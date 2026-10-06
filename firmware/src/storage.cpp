// storage.cpp - LittleFS for the configuration and saved calibrations, NVS (Preferences) for secrets and totals.
#include "app.h"
#include "config_json.h"
#include <LittleFS.h>
#include <Preferences.h>

using namespace ring;
namespace app { namespace storage {

static Preferences prefs; static bool fsOk = false; static uint32_t lastTotalsSave = 0;
static const char* CFG_PATH = "/cfg.json";

void begin() {
  fsOk = LittleFS.begin(true);
  if (!fsOk) Serial.println("[fs] LittleFS failed to mount");
  else { Serial.printf("[fs] LittleFS %lu kB used of %lu kB\n", (unsigned long)(LittleFS.usedBytes() / 1024), (unsigned long)(LittleFS.totalBytes() / 1024)); if (!LittleFS.exists("/cals")) LittleFS.mkdir("/cals"); }
  prefs.begin("ring", false);
  loadSecrets();
  g.totals.sess = prefs.getUInt("sess", 0); g.totals.ml = prefs.getFloat("ml", 0); g.totals.savedOff = prefs.getFloat("savedOff", 0); g.totals.savedFlow = prefs.getFloat("savedFlow", 0);
  prefs.getString("calName", g.calName, sizeof g.calName); prefs.getString("calWhen", g.calWhen, sizeof g.calWhen);
}
void loadSecrets() {
  prefs.getString("pass", g.wifiPass, sizeof g.wifiPass);
  // Ring Studio uses the WPA2 AP password as its access boundary. Legacy studio PINs are ignored.
  g.pin[0] = 0;
  g.setupNeeded = strlen(g.wifiPass) < 8;
}
void saveSecrets() { prefs.putString("pass", g.wifiPass); prefs.remove("pin"); g.pin[0] = 0; }
void saveTotals() { prefs.putUInt("sess", g.totals.sess); prefs.putFloat("ml", g.totals.ml); prefs.putFloat("savedOff", g.totals.savedOff); prefs.putFloat("savedFlow", g.totals.savedFlow); g.totalsDirty = false; }

static bool readJsonFile(const char* path, JsonDocument& doc) {
  if (!fsOk || !LittleFS.exists(path)) return false;
  File f = LittleFS.open(path, "r"); if (!f) return false;
  DeserializationError e = deserializeJson(doc, f); f.close();
  if (e) { Serial.printf("[fs] %s: %s\n", path, e.c_str()); return false; }
  return true;
}
static bool writeJsonFile(const char* path, const JsonDocument& doc) {
  if (!fsOk) return false;
  String tmp = String(path) + ".tmp"; LittleFS.remove(tmp);
  File f = LittleFS.open(tmp, "w"); if (!f) return false;
  size_t written = serializeJson(doc, f); f.flush(); f.close();
  if (!written) { LittleFS.remove(tmp); return false; }
  LittleFS.remove(path);
  if (!LittleFS.rename(tmp, path)) { LittleFS.remove(tmp); return false; }
  return true;
}
bool loadConfig() {
  Config candidate; setDefaults(candidate);
  JsonDocument doc; if (!readJsonFile(CFG_PATH, doc)) { g.cfg = candidate; Serial.println("[cfg] no saved configuration, using defaults"); return false; }
  char err[96] = ""; if (!configFromJson(doc.as<JsonObjectConst>(), candidate) || !validateConfig(candidate, err, sizeof err)) { g.cfg = Config(); setDefaults(g.cfg); Serial.printf("[cfg] rejected saved configuration: %s\n", err[0] ? err : "parse error"); return false; }
  g.cfg = candidate; Serial.println("[cfg] loaded"); return true;
}
void saveConfig() {
  JsonDocument doc; configToJson(g.cfg, doc.to<JsonObject>());
  if (writeJsonFile(CFG_PATH, doc)) Serial.println("[cfg] saved"); g.cfgDirty = false;
}
static void safeName(const char* in, char* out, int n) { int k = 0; for (int i = 0; in[i] && k < n - 1; i++) { char c = in[i]; if (isalnum((unsigned char)c) || c == '-' || c == '_' || c == ' ') out[k++] = c == ' ' ? '_' : c; } out[k] = 0; if (!k) strcpy(out, "cal"); }
static void calPath(const char* name, char* out, int n) { char s[40]; safeName(name, s, sizeof s); snprintf(out, n, "/cals/%s.json", s); }
void listCals(JsonArray out) {
  if (!fsOk) return; File dir = LittleFS.open("/cals"); if (!dir) return;
  for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
    JsonDocument doc; DeserializationError e = deserializeJson(doc, f); if (e) continue;
    JsonObject o = out.add<JsonObject>(); o["name"] = doc["name"]; o["notes"] = doc["notes"]; o["when"] = doc["when"];
    JsonObject c = o["cfg"].to<JsonObject>(); c["sensors"] = doc["cfg"]["sensors"]; c["hand"] = doc["cfg"]["hand"]; c["plane"] = doc["cfg"]["plane"];
  }
}
bool saveCal(const char* name, const char* notes) {
  JsonDocument doc; doc["name"] = name; doc["notes"] = notes; char when[24]; snprintf(when, sizeof when, "up %lu s", (unsigned long)(millis() / 1000)); doc["when"] = when;
  configToJson(g.cfg, doc["cfg"].to<JsonObject>());
  char path[64]; calPath(name, path, sizeof path);
  if (!writeJsonFile(path, doc)) return false;
  strncpy(g.calName, name, sizeof g.calName - 1); g.calName[sizeof g.calName - 1] = 0; strncpy(g.calWhen, when, sizeof g.calWhen - 1); g.calWhen[sizeof g.calWhen - 1] = 0; prefs.putString("calName", g.calName); prefs.putString("calWhen", g.calWhen);
  return true;
}
bool loadCal(const char* name) {
  char path[64]; calPath(name, path, sizeof path); JsonDocument doc; if (!readJsonFile(path, doc)) return false;
  Config candidate; { Lock lk; candidate = g.cfg; } char err[96] = "";
  if (!configFromJson(doc["cfg"].as<JsonObjectConst>(), candidate) || !validateConfig(candidate, err, sizeof err)) { Serial.printf("[cal] rejected %s: %s\n", name, err[0] ? err : "parse error"); return false; }
  { Lock lk; g.cfg = candidate; g.cfgDirty = true; g.cfgDirtyAt = millis(); }
  strncpy(g.calName, name, sizeof g.calName - 1); g.calName[sizeof g.calName - 1] = 0; strncpy(g.calWhen, doc["when"] | "", sizeof g.calWhen - 1); g.calWhen[sizeof g.calWhen - 1] = 0; prefs.putString("calName", g.calName); prefs.putString("calWhen", g.calWhen);
  return true;
}
bool deleteCal(const char* name) { char path[64]; calPath(name, path, sizeof path); return fsOk && LittleFS.remove(path); }
void factoryReset() { setDefaults(g.cfg); if (fsOk) LittleFS.remove(CFG_PATH); g.calName[0] = 0; g.calWhen[0] = 0; prefs.remove("calName"); prefs.remove("calWhen"); g.cfgDirty = false; }
void loop() {
  uint32_t now = millis();
  if (g.cfgDirty && now - g.cfgDirtyAt > 2000) { Lock lk; saveConfig(); }
  if (g.totalsDirty && now - lastTotalsSave > 30000) { lastTotalsSave = now; saveTotals(); }
}

} }  // namespace app::storage
