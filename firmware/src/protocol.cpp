// protocol.cpp - JSON for frames, events, status, health (docs/10-protocol.md) and the command dispatcher.
#include "app.h"
#include "config_json.h"
#include "bounded_writer.h"
#include <esp_system.h>
#include <WiFi.h>

using namespace ring;
namespace app { namespace proto {

static const char* resetReason() {
  switch (esp_reset_reason()) { case ESP_RST_POWERON: return "POWERON"; case ESP_RST_SW: return "SW_RESET"; case ESP_RST_PANIC: return "PANIC"; case ESP_RST_INT_WDT: return "INT_WDT"; case ESP_RST_TASK_WDT: return "TASK_WDT"; case ESP_RST_WDT: return "WDT"; case ESP_RST_BROWNOUT: return "BROWNOUT"; case ESP_RST_DEEPSLEEP: return "DEEPSLEEP"; case ESP_RST_EXT: return "EXT"; default: return "UNKNOWN"; }
}
static void sensorJson(const SensorFrame& s, BoundedWriter& w) {
  w.append("{\"e\":[");
  for (int i = 0; i < s.n && !w.truncated(); i++) w.append("%s[%d,%d]", i ? "," : "", (int)s.e[i].d, (int)s.e[i].s);
  w.append("]"); if (s.p >= 0) w.append(",\"p\":%d", s.p);
  w.append(",\"hz\":%.1f,\"er\":%lu}", s.hz, (unsigned long)s.er);
}
int frameJson(const Frame& f, char* out, int n) {
  if (!out || n <= 0) return 0; BoundedWriter w(out, (size_t)n);
  w.append("{\"f\":{\"t\":%lu,\"n\":%lu,\"st\":%d", (unsigned long)f.t, (unsigned long)f.n, (int)f.st);
  if (f.fn != Fn::None) w.append(",\"fn\":\"%s\"", fnName(f.fn));
  if (f.zn[0]) w.append(",\"zn\":\"%s\"", f.zn);
  if (f.hasHand) w.append(",\"hx\":%.1f,\"hy\":%.1f", f.hx, f.hy);
  w.append(",\"spd\":%d,\"set\":%.3f,\"ex\":%.3f,\"dsp\":%.1f,\"cup\":%d,\"lk\":%d,\"flag\":%d,\"still\":%.1f", (int)f.spd, f.set, f.ex, f.dsp, (int)f.cup, f.lk, f.flag, f.still);
  if (f.st == CLEAN) w.append(",\"cln\":%.1f", f.cln);
  if (f.lat >= 0) w.append(",\"lat\":%d", f.lat);
  w.append(",\"A\":"); sensorJson(f.A, w); w.append(",\"B\":"); sensorJson(f.B, w); w.append("}}");
  return (int)w.size();
}
void eventJson(const Event& e, char* out, int n) {
  if (!out || n <= 0) return; BoundedWriter w(out, (size_t)n); const char* name = "";
  switch (e.type) { case Ev::Session: name = "session"; break; case Ev::Latch: name = "latch"; break; case Ev::Soap: name = "soap"; break; case Ev::CupFull: name = "cupfull"; break; case Ev::Disp: name = "disp"; break; case Ev::Off: name = "off"; break; case Ev::Still: name = "still"; break; case Ev::Clean: name = "clean"; break; case Ev::FalseOff: name = "falseoff"; break; case Ev::HeldOn: name = "heldon"; break; case Ev::Resume: name = "resume"; break; case Ev::Layout: name = "layout"; break; case Ev::Bg: name = "bg"; break; }
  w.append("{\"ev\":\"%s\",\"t\":%lu", name, (unsigned long)e.t);
  if (e.fn != Fn::None) w.append(",\"fn\":\"%s\"", fnName(e.fn)); if (e.lat >= 0) w.append(",\"lat\":%d", e.lat);
  if (e.a) w.append(",\"a\":\"%s\"", e.a); if (e.why) w.append(",\"why\":\"%s\"", e.why); if (e.id) w.append(",\"id\":\"%s\"", e.id);
  if (e.type == Ev::Session && e.a && e.a[1] == 'n') w.append(",\"ms\":%lu,\"used\":%.0f,\"savedOff\":%.0f,\"savedFlow\":%.0f", (unsigned long)e.ms, e.used, e.savedOff, e.savedFlow);
  if (e.type == Ev::CupFull || e.type == Ev::Soap) w.append(",\"ml\":%.1f", e.ml); if (e.type == Ev::Off) w.append(",\"water\":%s", e.water ? "true" : "false");
  if (e.type == Ev::Still) w.append(",\"x\":%.0f,\"y\":%.0f", e.x, e.y); if (e.type == Ev::HeldOn) w.append(",\"frames\":%d", e.frames); w.append("}");
}
void statusJson(JsonObject o) {
  bool setup; Totals totals; char calName[32], calWhen[24];
  { Lock lk; setup = g.setupNeeded; totals = g.totals; strncpy(calName, g.calName, sizeof calName); calName[sizeof calName - 1] = 0; strncpy(calWhen, g.calWhen, sizeof calWhen); calWhen[sizeof calWhen - 1] = 0; }
  o["fw"] = RING_FW_VERSION; o["proto"] = RING_PROTO; o["up"] = millis(); o["rst"] = resetReason(); o["setup"] = setup; o["heap"] = ESP.getFreeHeap(); o["clients"] = (int)g.clients;
  JsonObject cal = o["cal"].to<JsonObject>(); cal["saved"] = calName[0] != 0; if (calName[0]) { cal["name"] = calName; cal["when"] = calWhen; }
  o["sess"] = totals.sess; o["ml"] = (int)totals.ml; o["savedOff"] = (int)totals.savedOff; o["savedFlow"] = (int)totals.savedFlow;
}
void healthJson(JsonObject o) {
  Frame f; SensorInfo infoA, infoB; Health health; uint8_t ledBright;
  { Lock lk; f = g.frame; infoA = g.infoA; infoB = g.infoB; health = g.health; ledBright = g.cfg.tuning.ledBright; }
  auto sensor = [&](const char* key, const SensorFrame& sf, const SensorInfo& inf) {
    JsonObject a = o[key].to<JsonObject>(); a["hz"] = sf.hz; a["er"] = sf.er; a["calNeeded"] = sf.calNeeded; a["str"] = (int)sf.topStr; a["alive"] = sf.alive;
    a["sda"] = inf.sda; a["scl"] = inf.scl; a["pres"] = inf.present; a["cfg"] = inf.cfgOk; a["ver"] = inf.ver; a["st"] = inf.status; a["bus"] = inf.busErr; a["stop"] = inf.stop; a["setups"] = inf.setups;
  };
  sensor("A", f.A, infoA); sensor("B", f.B, infoB);
  o["bgDrift"] = health.bgDrift; o["ghosts"] = health.ghosts; o["front"] = health.front; o["trigNoHand"] = health.trigNoHand;
  o["eventDrops"] = g.events.droppedCount();
  o["falseOff"] = 0; o["heldOn"] = 0;
  o["led"] = ledBright; o["stations"] = WiFi.softAPgetStationNum(); o["heap"] = ESP.getFreeHeap(); o["rst"] = resetReason(); o["temp"] = health.temp;
}

// ---- commands -----------------------------------------------------------------------------------------------------------------------
static bool validPass(const char* p) { size_t n = p ? strlen(p) : 0; return n >= 8 && n <= 63; }
static bool validPin(const char* p) { size_t n = p ? strlen(p) : 0; if (n < 4 || n > 8) return false; for (size_t i = 0; i < n; i++) if (p[i] < '0' || p[i] > '9') return false; return true; }

bool handleCommand(JsonObjectConst c, bool authed, JsonDocument& reply, bool& needRestart) {
  const char* cmd = c["c"] | ""; int id = c["id"] | 0;
  JsonObject ack = reply["ack"].to<JsonObject>(); ack["c"] = cmd; ack["id"] = id;
  auto err = [&](const char* msg) { reply.clear(); JsonObject e = reply["err"].to<JsonObject>(); e["c"] = cmd; e["id"] = id; e["msg"] = msg; return false; };
  auto needAuth = [&]() { return g.pin[0] && !authed; };
  // Authorization policy is fail-closed: after initial setup, every state-mutating
  // command requires an authenticated WebSocket session. Read-only commands are
  // explicitly allow-listed here so new commands cannot accidentally become public.
  const bool readOnly = !strcmp(cmd, "hello") || !strcmp(cmd, "auth") || !strcmp(cmd, "get") || !strcmp(cmd, "list");
  const bool initialSetup = !strcmp(cmd, "setup") && g.setupNeeded;
  if (!readOnly && !initialSetup && needAuth()) return err("PIN required");
  if (!strcmp(cmd, "hello")) { net::sendStatus(); net::sendCfg(); return true; }
  if (!strcmp(cmd, "auth")) { bool ok = !g.pin[0] || !strcmp(c["pin"] | "", g.pin); ack["ok"] = ok; return true; }
  if (!strcmp(cmd, "setup")) {
    const char* pass = c["pass"] | ""; const char* pin = c["pin"] | "";
    if (!validPass(pass)) return err("Password must be 8 to 63 characters"); if (!validPin(pin)) return err("PIN must be 4 to 8 digits");
    strncpy(g.wifiPass, pass, sizeof g.wifiPass - 1); strncpy(g.pin, pin, sizeof g.pin - 1); g.setupNeeded = false; storage::saveSecrets(); ack["restart"] = true; needRestart = true; return true;
  }
  if (!strcmp(cmd, "layout")) { const char* idl = c["layout"] | ""; { Lock lk; if (!g.cfg.findLayout(idl)) return err("unknown layout"); strncpy(g.cfg.layout, idl, sizeof g.cfg.layout - 1); g.sm->setLayout(idl); g.cfgDirty = true; g.cfgDirtyAt = millis(); } net::sendCfg(); return true; }
  if (!strcmp(cmd, "clean")) { Lock lk; if (!strcmp(c["a"] | "start", "end")) g.sm->endClean(); else g.sm->startClean("ui"); return true; }
  if (!strcmp(cmd, "cfg")) {
    JsonObjectConst set = c["set"]; if (set.isNull()) return err("nothing to set");
    char e[64]; { Lock lk; uint16_t oldKhz = g.cfg.tuning.i2cKhz; float oS = g.cfg.tuning.rangeStart, oE = g.cfg.tuning.rangeEnd, oT = g.cfg.tuning.threshSens; if (!configApplySet(g.cfg, set, e, sizeof e)) return err(e); if (g.cfg.tuning.rangeStart != oS || g.cfg.tuning.rangeEnd != oE || g.cfg.tuning.threshSens != oT) g.sensorsReconfig = true; g.sm->setConfig(&g.cfg); if (!g.cfg.findLayout(g.cfg.layout) && g.cfg.nLayouts) strncpy(g.cfg.layout, g.cfg.layouts[0].id, sizeof g.cfg.layout - 1); if (g.cfg.tuning.i2cKhz != oldKhz) g.sensorsReconfig = true; g.cfgDirty = true; g.cfgDirtyAt = millis(); }
    net::sendCfg(); return true;
  }
  if (!strcmp(cmd, "cal")) { char e[64] = ""; if (!calib::command(c["step"] | "", c["a"] | "", c, e, sizeof e)) return err(e); return true; }
  if (!strcmp(cmd, "led")) { const char* t = c["test"] | "off"; g.ledTest = !strcmp(t, "white") ? 1 : !strcmp(t, "rgb") ? 2 : !strcmp(t, "count") ? 3 : 0; g.ledTestN = c["n"] | g.cfg.tuning.ledCount; return true; }
  if (!strcmp(cmd, "save")) { const char* name = c["name"] | ""; if (!name[0]) return err("name required"); if (!storage::saveCal(name, c["notes"] | "")) return err("could not save"); net::sendCals(); net::sendStatus(); return true; }
  if (!strcmp(cmd, "load")) { if (!storage::loadCal(c["name"] | "")) return err("no such calibration"); { Lock lk; g.sm->setConfig(&g.cfg); } net::sendCfg(); net::sendStatus(); return true; }
  if (!strcmp(cmd, "delete")) { storage::deleteCal(c["name"] | ""); net::sendCals(); return true; }
  if (!strcmp(cmd, "list")) { net::sendCals(); return true; }
  if (!strcmp(cmd, "wifi")) { const char* pass = c["pass"] | ""; if (!validPass(pass)) return err("Password must be 8 to 63 characters"); strncpy(g.wifiPass, pass, sizeof g.wifiPass - 1); storage::saveSecrets(); ack["restart"] = true; needRestart = true; return true; }
  if (!strcmp(cmd, "pin")) { const char* pin = c["pin"] | ""; if (!validPin(pin)) return err("PIN must be 4 to 8 digits"); strncpy(g.pin, pin, sizeof g.pin - 1); storage::saveSecrets(); return true; }
  if (!strcmp(cmd, "get")) { const char* w = c["what"] | "status"; if (!strcmp(w, "cfg")) net::sendCfg(); else if (!strcmp(w, "health")) { JsonDocument d; healthJson(d["health"].to<JsonObject>()); String s; serializeJson(d, s); net::broadcast(s.c_str()); } else if (!strcmp(w, "cal")) { JsonDocument d; calib::toJson(d["cal"].to<JsonObject>()); String s; serializeJson(d, s); net::broadcast(s.c_str()); } else net::sendStatus(); return true; }
  if (!strcmp(cmd, "reset")) {
    if (!strcmp(c["what"] | "", "totals")) { Lock lk; g.totals = Totals(); g.sm->totals() = Totals(); g.totalsDirty = true; }
    else { { Lock lk; storage::factoryReset(); g.sm->setConfig(&g.cfg); sensing::clearBg(); } net::sendCfg(); }
    net::sendStatus(); return true;
  }
  if (!strcmp(cmd, "sensors")) { if (!strcmp(c["a"] | "", "recheck")) { g.sensorsReconfig = true; return true; } return err("unknown sensors action"); }
  if (!strcmp(cmd, "reboot")) { g.reboot = true; return true; }
  return err("unknown command");
}

} }  // namespace app::proto
