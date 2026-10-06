// net.cpp - the Wi-Fi access point, Ring Studio static files, the WebSocket stream and the HTTP API (docs/10-protocol.md).
#include "app.h"
#include "config_json.h"
#include "defaults.h"
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <AsyncJson.h>
#include <LittleFS.h>
#include <Update.h>

using namespace ring;
namespace app { namespace net {

static AsyncWebServer server(80);
static AsyncWebSocket ws("/ws");
struct WsSession { uint32_t id = 0; bool used = false; bool authed = false; };
static WsSession sessions[8];
static bool sessionAuth(uint32_t id) { for (auto& s : sessions) if (s.used && s.id == id) return s.authed; return false; }
static void sessionConnect(uint32_t id) { for (auto& s : sessions) if (!s.used) { s = {id, true, false}; return; } }
static void sessionDisconnect(uint32_t id) { for (auto& s : sessions) if (s.used && s.id == id) { s = {}; return; } }
static void sessionSetAuth(uint32_t id, bool value) { for (auto& s : sessions) if (s.used && s.id == id) { s.authed = value; return; } }
static constexpr size_t MAX_JSON_BODY = 8192;
#ifndef RING_ENABLE_OTA
#define RING_ENABLE_OTA 0
#endif
static bool httpAuthed(AsyncWebServerRequest* r) {
  if (!g.pin[0]) return g.setupNeeded;
  if (!r->hasHeader("X-Ring-PIN")) return false;
  return r->getHeader("X-Ring-PIN")->value().equals(g.pin);
}
static bool requireHttpAuth(AsyncWebServerRequest* r) {
  if (httpAuthed(r)) return true;
  r->send(401, "application/json", "{\"err\":\"PIN required\"}");
  return false;
}
static uint32_t lastFrameSent = 0, lastStatus = 0, lastHealth = 0, lastN = 0;
static char frameBuf[1400];

static void makeTempPass() { const char* al = "abcdefghjkmnpqrstuvwxyz23456789"; for (int i = 0; i < 10; i++) g.tempPass[i] = al[esp_random() % strlen(al)]; g.tempPass[10] = 0; }
static void startAp() {
  const char* pass = g.setupNeeded ? g.tempPass : g.wifiPass;
  WiFi.mode(WIFI_AP); WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  bool ok = WiFi.softAP(AP_SSID, pass, g.cfg.tuning.wifiCh, 0, 4);
  Serial.printf("[wifi] AP %s %s on channel %d, http://192.168.4.1\n", AP_SSID, ok ? "up" : "FAILED", g.cfg.tuning.wifiCh);
  if (g.setupNeeded) { Serial.println("[wifi] ===================================================="); Serial.printf("[wifi]  TEMPORARY Wi-Fi password: %s\n", g.tempPass); Serial.println("[wifi]  Join ArtesianRing, open http://192.168.4.1 and set your own."); Serial.println("[wifi] ===================================================="); }
}
void broadcast(const char* json) { if (ws.count()) ws.textAll(json); }
void sendCfg() { JsonDocument d; { Lock lk; configToJson(g.cfg, d["cfg"].to<JsonObject>()); } String s; serializeJson(d, s); broadcast(s.c_str()); }
void sendStatus() { JsonDocument d; proto::statusJson(d["status"].to<JsonObject>()); String s; serializeJson(d, s); broadcast(s.c_str()); }
void sendCals() { JsonDocument d; storage::listCals(d["cals"].to<JsonArray>()); String s; serializeJson(d, s); broadcast(s.c_str()); }
static void sendCal() { JsonDocument d; calib::toJson(d["cal"].to<JsonObject>()); String s; serializeJson(d, s); broadcast(s.c_str()); }

static void onWsEvent(AsyncWebSocket* srv, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
  if (type == WS_EVT_CONNECT) { g.clients = srv->count(); sessionConnect(client->id()); Serial.printf("[ws] client %lu connected (%d)\n", (unsigned long)client->id(), (int)g.clients); }
  else if (type == WS_EVT_DISCONNECT) { sessionDisconnect(client->id()); g.clients = srv->count(); Serial.printf("[ws] client %lu left\n", (unsigned long)client->id()); }
  else if (type == WS_EVT_DATA) {
    AwsFrameInfo* info = (AwsFrameInfo*)arg; if (!(info->final && info->index == 0 && info->len == len) || info->opcode != WS_TEXT) return;
    JsonDocument doc; if (deserializeJson(doc, data, len)) return;
    JsonDocument reply; bool restart = false; bool isAuth = sessionAuth(client->id());
    bool ok = proto::handleCommand(doc.as<JsonObjectConst>(), isAuth, reply, restart);
    if (ok && !strcmp(doc["c"] | "", "auth")) sessionSetAuth(client->id(), reply["ack"]["ok"] | false);
    String s; serializeJson(reply, s); client->text(s);
    if (restart) g.restartWifi = true;
  }
}

void begin() {
  if (g.setupNeeded) makeTempPass();
  startAp();
  ws.onEvent(onWsEvent); server.addHandler(&ws);
  server.on("/api/status", HTTP_GET, [](AsyncWebServerRequest* r) { JsonDocument d; proto::statusJson(d.to<JsonObject>()); String s; serializeJson(d, s); r->send(200, "application/json", s); });
  server.on("/api/health", HTTP_GET, [](AsyncWebServerRequest* r) { JsonDocument d; proto::healthJson(d.to<JsonObject>()); String s; serializeJson(d, s); r->send(200, "application/json", s); });
  server.on("/api/cfg", HTTP_GET, [](AsyncWebServerRequest* r) { JsonDocument d; { Lock lk; configToJson(g.cfg, d.to<JsonObject>()); } String s; serializeJson(d, s); r->send(200, "application/json", s); });
  server.on("/api/cal/export", HTTP_GET, [](AsyncWebServerRequest* r) { JsonDocument d; d["kind"] = "ring-calibration"; d["fw"] = RING_FW_VERSION; d["name"] = g.calName; { Lock lk; configToJson(g.cfg, d["cfg"].to<JsonObject>()); } String s; serializeJson(d, s); AsyncWebServerResponse* resp = r->beginResponse(200, "application/json", s); resp->addHeader("Content-Disposition", "attachment; filename=ring-calibration.json"); r->send(resp); });
  auto* cfgPost = new AsyncCallbackJsonWebHandler("/api/cfg", [](AsyncWebServerRequest* r, JsonVariant& json) {
    if (!requireHttpAuth(r)) return;
    JsonObjectConst d = json.as<JsonObjectConst>();
    char e[96] = ""; bool ok;
    { Lock lk; ok = configApplySet(g.cfg, d["set"].as<JsonObjectConst>(), e, sizeof e); if (ok) { g.sm->setConfig(&g.cfg); g.cfgDirty = true; g.cfgDirtyAt = millis(); } }
    if (ok) { sendCfg(); r->send(200, "application/json", "{\"ok\":true}"); }
    else { JsonDocument out; out["err"] = e[0] ? e : "invalid configuration"; String s; serializeJson(out, s); r->send(400, "application/json", s); }
  });
  cfgPost->setMethod(HTTP_POST); cfgPost->setMaxContentLength(MAX_JSON_BODY); server.addHandler(cfgPost);
  auto* calImport = new AsyncCallbackJsonWebHandler("/api/cal/import", [](AsyncWebServerRequest* r, JsonVariant& json) {
    if (!requireHttpAuth(r)) return;
    JsonObjectConst d = json.as<JsonObjectConst>(); if (d["cfg"].isNull()) { r->send(400, "application/json", "{\"err\":\"not a calibration file\"}"); return; }
    Config candidate; { Lock lk; candidate = g.cfg; }
    char e[96] = ""; if (!configFromJson(d["cfg"].as<JsonObjectConst>(), candidate) || !validateConfig(candidate, e, sizeof e)) { JsonDocument out; out["err"] = e[0] ? e : "invalid configuration"; String s; serializeJson(out, s); r->send(400, "application/json", s); return; }
    { Lock lk; g.cfg = candidate; g.sm->setConfig(&g.cfg); g.cfgDirty = true; g.cfgDirtyAt = millis(); }
    sendCfg(); r->send(200, "application/json", "{\"ok\":true}");
  });
  calImport->setMethod(HTTP_POST); calImport->setMaxContentLength(MAX_JSON_BODY); server.addHandler(calImport);
  server.on("/api/log", HTTP_GET, [](AsyncWebServerRequest* r) { r->send(200, "text/plain", "see USB serial"); });
  // OTA is intentionally disabled until the authenticated update path is hardened.
#if RING_ENABLE_OTA
  // Over-the-air firmware update (F18): multipart upload of the .bin, then restart
  server.on("/api/update", HTTP_POST, [](AsyncWebServerRequest* r) { bool ok = !Update.hasError(); AsyncWebServerResponse* resp = r->beginResponse(ok ? 200 : 500, "text/plain", ok ? "OK, restarting" : Update.errorString()); resp->addHeader("Connection", "close"); r->send(resp); if (ok) g.reboot = true; },
    [](AsyncWebServerRequest* r, const String& filename, size_t index, uint8_t* data, size_t len, bool final) {
      if (index == 0) { Serial.printf("[ota] %s\n", filename.c_str()); g.pauseSensing = true; if (!Update.begin(UPDATE_SIZE_UNKNOWN)) Update.printError(Serial); }
      if (!Update.hasError() && Update.write(data, len) != len) Update.printError(Serial);
      if (final) { if (Update.end(true)) Serial.printf("[ota] done, %u bytes\n", (unsigned)(index + len)); else Update.printError(Serial); g.pauseSensing = false; }
    });
#else
  server.on("/api/update", HTTP_ANY, [](AsyncWebServerRequest* r) { r->send(403, "application/json", "{\"err\":\"OTA disabled\"}"); });
#endif
  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html").setCacheControl("max-age=600");
  server.onNotFound([](AsyncWebServerRequest* r) { if (r->method() == HTTP_OPTIONS) r->send(200); else r->send(404, "text/plain", "Not found. Ring Studio files missing? Run tools/build_ui.py and Upload Filesystem Image."); });
  // Ring Studio is served from this AP; cross-origin API access is intentionally not enabled.
  server.begin();
  Serial.println("[web] server started");
}

void loop() {
  uint32_t now = millis();
  ws.cleanupClients();
  if (g.restartWifi) { g.restartWifi = false; delay(300); WiFi.softAPdisconnect(true); delay(200); startAp(); }
  if (!ws.count()) return;
  // frames at the sensor rate (one message per new frame), capped at 30 Hz
  Frame f; { Lock lk; f = g.frame; }
  if (f.n != lastN && now - lastFrameSent >= 33) { lastN = f.n; lastFrameSent = now; proto::frameJson(f, frameBuf, sizeof frameBuf); broadcast(frameBuf); }
  char ev[EVLEN]; int guard = 0; while (g.events.pop(ev) && guard++ < 8) broadcast(ev);
  if (now - lastStatus > 5000) { lastStatus = now; sendStatus(); }
  if (now - lastHealth > 1000) { lastHealth = now; JsonDocument d; proto::healthJson(d["health"].to<JsonObject>()); String s; serializeJson(d, s); broadcast(s.c_str()); }
  if (calib::changed()) sendCal();
}

} }  // namespace app::net

namespace app {
void EventQueue::push(const char* s) {
  portENTER_CRITICAL(&mux);
  int next = (head + 1) % EVQ;
  if (next == tail) { dropped++; portEXIT_CRITICAL(&mux); return; }
  strncpy(buf[head], s, EVLEN - 1); buf[head][EVLEN - 1] = 0; head = next;
  portEXIT_CRITICAL(&mux);
}
bool EventQueue::pop(char* out) {
  portENTER_CRITICAL(&mux);
  if (tail == head) { portEXIT_CRITICAL(&mux); return false; }
  strncpy(out, buf[tail], EVLEN); out[EVLEN - 1] = 0; tail = (tail + 1) % EVQ;
  portEXIT_CRITICAL(&mux); return true;
}
uint32_t EventQueue::droppedCount() { portENTER_CRITICAL(&mux); uint32_t n = dropped; portEXIT_CRITICAL(&mux); return n; }
}
