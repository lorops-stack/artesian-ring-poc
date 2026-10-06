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
struct WsSession { uint32_t id = 0; bool used = false; bool authed = false; uint8_t authFails = 0; uint32_t authBlockedUntil = 0; };
static WsSession sessions[8];
static bool sessionAuth(uint32_t id) { for (auto& s : sessions) if (s.used && s.id == id) return s.authed; return false; }
static void sessionConnect(uint32_t id) { for (auto& s : sessions) if (!s.used) { s = {id, true, false}; return; } }
static void sessionDisconnect(uint32_t id) { for (auto& s : sessions) if (s.used && s.id == id) { s = {}; return; } }
static bool sessionCanAuth(uint32_t id) { uint32_t now = millis(); for (auto& s : sessions) if (s.used && s.id == id) return (int32_t)(now - s.authBlockedUntil) >= 0; return false; }
static void sessionSetAuth(uint32_t id, bool value) {
  for (auto& s : sessions) if (s.used && s.id == id) {
    s.authed = value;
    if (value) { s.authFails = 0; s.authBlockedUntil = 0; }
    else if (++s.authFails >= 5) { s.authFails = 0; s.authBlockedUntil = millis() + 30000; }
    return;
  }
}
static constexpr size_t MAX_JSON_BODY = 8192;
static constexpr uint32_t FRAME_INTERVAL_MS = 100; // 10 Hz UI telemetry; sensing remains at full rate.
#ifndef RING_ENABLE_OTA
#define RING_ENABLE_OTA 0
#endif
static uint8_t httpAuthFails = 0; static uint32_t httpAuthBlockedUntil = 0;
static bool httpAuthed(AsyncWebServerRequest* r) {
  if (!g.pin[0]) return g.setupNeeded;
  uint32_t now = millis(); if ((int32_t)(now - httpAuthBlockedUntil) < 0) return false;
  bool ok = r->hasHeader("X-Ring-PIN") && r->getHeader("X-Ring-PIN")->value().equals(g.pin);
  if (ok) { httpAuthFails = 0; httpAuthBlockedUntil = 0; return true; }
  if (++httpAuthFails >= 5) { httpAuthFails = 0; httpAuthBlockedUntil = now + 30000; }
  return false;
}
static bool requireHttpAuth(AsyncWebServerRequest* r) {
  if (httpAuthed(r)) return true;
  r->send(401, "application/json", "{\"err\":\"PIN required\"}");
  return false;
}
static uint32_t lastFrameSent = 0, lastStatus = 0, lastHealth = 0, lastN = 0;
static uint32_t wsBackpressureDrops = 0;
static char frameBuf[1400];

static void makeTempPass() { const char* al = "abcdefghjkmnpqrstuvwxyz23456789"; for (int i = 0; i < 10; i++) g.tempPass[i] = al[esp_random() % strlen(al)]; g.tempPass[10] = 0; }
static void startAp() {
  const char* pass = g.setupNeeded ? g.tempPass : g.wifiPass;
  WiFi.mode(WIFI_AP); WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  bool ok = WiFi.softAP(AP_SSID, pass, g.cfg.tuning.wifiCh, 0, 4);
  Serial.printf("[wifi] AP %s %s on channel %d, http://192.168.4.1\n", AP_SSID, ok ? "up" : "FAILED", g.cfg.tuning.wifiCh);
  if (g.setupNeeded) { Serial.println("[wifi] ===================================================="); Serial.printf("[wifi]  TEMPORARY Wi-Fi password: %s\n", g.tempPass); Serial.println("[wifi]  Join ArtesianRing, open http://192.168.4.1 and set your own."); Serial.println("[wifi] ===================================================="); }
}
static bool clientWritable(AsyncWebSocketClient* c) { return c && c->status() == WS_CONNECTED && c->canSend(); }
static void broadcast(const char* json, bool droppable = false) {
  if (!ws.count()) return;
  for (auto& s : sessions) {
    if (!s.used) continue;
    AsyncWebSocketClient* c = ws.client(s.id);
    if (!clientWritable(c)) { if (droppable) wsBackpressureDrops++; continue; }
    c->text(json);
  }
}
void sendCfg() { JsonDocument d; { Lock lk; configToJson(g.cfg, d["cfg"].to<JsonObject>()); } String s; serializeJson(d, s); broadcast(s.c_str()); }
void sendStatus() { JsonDocument d; proto::statusJson(d["status"].to<JsonObject>()); String s; serializeJson(d, s); broadcast(s.c_str()); }
void sendCals() { JsonDocument d; storage::listCals(d["cals"].to<JsonArray>()); String s; serializeJson(d, s); broadcast(s.c_str()); }
static void sendCal() { JsonDocument d; calib::toJson(d["cal"].to<JsonObject>()); String s; serializeJson(d, s); broadcast(s.c_str()); }

static void onWsEvent(AsyncWebSocket* srv, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
  if (type == WS_EVT_CONNECT) { g.clients = srv->count(); sessionConnect(client->id()); Serial.printf("[ws] client %lu connected (%d)\n", (unsigned long)client->id(), (int)g.clients); }
  else if (type == WS_EVT_DISCONNECT) { sessionDisconnect(client->id()); g.clients = srv->count(); Serial.printf("[ws] client %lu left\n", (unsigned long)client->id()); }
  else if (type == WS_EVT_DATA) {
    AwsFrameInfo* info = (AwsFrameInfo*)arg; if (!(info->final && info->index == 0 && info->len == len) || info->opcode != WS_TEXT) return;
    if (len > 4096) { client->text("{\"err\":{\"c\":\"\",\"id\":0,\"msg\":\"command too large\"}}"); return; }
    JsonDocument doc; if (deserializeJson(doc, data, len)) { client->text("{\"err\":{\"c\":\"\",\"id\":0,\"msg\":\"bad json\"}}"); return; }
    if (!strcmp(doc["c"] | "", "auth") && !sessionCanAuth(client->id())) { client->text("{\"err\":{\"c\":\"auth\",\"id\":0,\"msg\":\"too many PIN attempts; wait 30 seconds\"}}"); return; }
    JsonDocument reply; bool restart = false; bool isAuth = sessionAuth(client->id());
    bool ok = proto::handleCommand(doc.as<JsonObjectConst>(), isAuth, reply, restart);
    if (ok && !strcmp(doc["c"] | "", "auth")) sessionSetAuth(client->id(), reply["ack"]["ok"] | false);
    String s; serializeJson(reply, s); if (clientWritable(client)) client->text(s);
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
#if RING_ENABLE_OTA
  server.on("/api/update", HTTP_POST, [](AsyncWebServerRequest* r) { if (!requireHttpAuth(r)) return; bool ok = !Update.hasError(); AsyncWebServerResponse* resp = r->beginResponse(ok ? 200 : 500, "text/plain", ok ? "OK, restarting" : Update.errorString()); resp->addHeader("Connection", "close"); r->send(resp); if (ok) g.reboot = true; },
    [](AsyncWebServerRequest* r, const String& filename, size_t index, uint8_t* data, size_t len, bool final) {
      if (!httpAuthed(r)) return;
      if (index == 0) { Serial.printf("[ota] %s\n", filename.c_str()); g.pauseSensing = true; if (!Update.begin(UPDATE_SIZE_UNKNOWN)) Update.printError(Serial); }
      if (!Update.hasError() && Update.write(data, len) != len) Update.printError(Serial);
      if (final) { if (Update.end(true)) Serial.printf("[ota] done, %u bytes\n", (unsigned)(index + len)); else Update.printError(Serial); g.pauseSensing = false; }
    });
#else
  server.on("/api/update", HTTP_ANY, [](AsyncWebServerRequest* r) { r->send(403, "application/json", "{\"err\":\"OTA disabled\"}"); });
#endif
  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html").setCacheControl("max-age=600");
  server.onNotFound([](AsyncWebServerRequest* r) { if (r->method() == HTTP_OPTIONS) r->send(200); else r->send(404, "text/plain", "Not found. Ring Studio files missing? Run tools/build_ui.py and Upload Filesystem Image."); });
  server.begin();
  Serial.println("[web] server started");
}

void loop() {
  uint32_t now = millis();
  ws.cleanupClients();
  if (g.restartWifi) { g.restartWifi = false; delay(300); WiFi.softAPdisconnect(true); delay(200); startAp(); }
  if (!ws.count()) return;
  Frame f; { Lock lk; f = g.frame; }
  // UI telemetry is lossy by design. Never queue stale frames behind a slow Wi-Fi client.
  if (f.n != lastN && now - lastFrameSent >= FRAME_INTERVAL_MS) {
    lastN = f.n; lastFrameSent = now;
    proto::frameJson(f, frameBuf, sizeof frameBuf);
    broadcast(frameBuf, true);
  }
  char ev[EVLEN]; int guard = 0; while (g.events.pop(ev) && guard++ < 8) broadcast(ev);
  if (now - lastStatus > 5000) { lastStatus = now; sendStatus(); }
  if (now - lastHealth > 1000) { lastHealth = now; JsonDocument d; proto::healthJson(d["health"].to<JsonObject>()); d["health"]["wsDrops"] = wsBackpressureDrops; String s; serializeJson(d, s); broadcast(s.c_str()); }
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