#include "config_json.h"
#include <string.h>

namespace ring {

static void poseToJson(const SensorPose& s, JsonObject o) { o["x"] = s.x; o["y"] = s.y; o["z"] = s.z; o["yaw"] = s.yaw; o["tilt"] = s.tilt; o["off"] = s.off; o["on"] = s.on; }
static void poseFromJson(JsonObjectConst o, SensorPose& s) { if (o.isNull()) return; if (o["x"].is<float>()) s.x = o["x"]; if (o["y"].is<float>()) s.y = o["y"]; if (o["z"].is<float>()) s.z = o["z"]; if (o["yaw"].is<float>()) s.yaw = o["yaw"]; if (o["tilt"].is<float>()) s.tilt = o["tilt"]; if (o["off"].is<float>()) s.off = o["off"]; if (o["on"].is<bool>()) s.on = o["on"]; }
static void cpy(char* dst, size_t n, const char* src) { if (!src) return; strncpy(dst, src, n - 1); dst[n - 1] = 0; }

void configToJson(const Config& c, JsonObject out) {
  out["schema"] = c.schema;
  JsonObject p = out["plane"].to<JsonObject>(); p["w"] = c.plane.w; p["d"] = c.plane.d; p["unit"] = "in";
  JsonObject s = out["sensors"].to<JsonObject>(); poseToJson(c.A, s["A"].to<JsonObject>()); poseToJson(c.B, s["B"].to<JsonObject>()); poseToJson(c.C, s["C"].to<JsonObject>());
  JsonObject h = out["hand"].to<JsonObject>(); h["zmin"] = c.hand.zmin; h["zmax"] = c.hand.zmax; h["zwork"] = c.hand.zwork; h["strMin"] = c.hand.strMin; h["strMax"] = c.hand.strMax; h["stillThr"] = c.hand.stillThr;
  JsonObject rg = out["rig"].to<JsonObject>(); rg["mount"] = c.rig.mount; rg["slotH"] = c.rig.slotH; rg["recess"] = c.rig.recess; rg["sinkDepth"] = c.rig.sinkDepth; rg["beamV"] = c.rig.beamV;
  JsonObject ms = out["masks"].to<JsonObject>();
  for (int i = 0; i < c.nMasks; i++) {
    const Mask& m = c.masks[i]; JsonObject mo = ms[m.id].to<JsonObject>(); mo["t"] = m.kind == 1 ? "circle" : "rect"; mo["x"] = m.x; mo["y"] = m.y;
    if (m.kind == 1) mo["r"] = m.a; else { mo["w"] = m.a; mo["h"] = m.b; }
  }
  out["layout"] = c.layout;
  JsonObject ls = out["layouts"].to<JsonObject>();
  for (int i = 0; i < c.nLayouts; i++) {
    const Layout& L = c.layouts[i]; JsonObject lo = ls[L.id].to<JsonObject>(); lo["name"] = L.name; JsonArray rows = lo["rows"].to<JsonArray>();
    for (int r = 0; r < L.nRows; r++) { JsonObject ro = rows.add<JsonObject>(); ro["h"] = L.rows[r].h; JsonArray fns = ro["fns"].to<JsonArray>(); for (int k = 0; k < L.rows[r].n; k++) fns.add(fnName(L.rows[r].fns[k])); }
  }
  const Tuning& t = c.tuning; JsonObject to = out["tuning"].to<JsonObject>();
  to["settleMs"] = t.settleMs; to["settleSpeed"] = t.settleSpeed; to["startSpeed"] = t.startSpeed; to["goneFrames"] = t.goneFrames; to["exitMs"] = t.exitMs; to["stillOffMs"] = t.stillOffMs; to["presentFrames"] = t.presentFrames;
  to["disposalHoldMs"] = t.disposalHoldMs; to["disposalRunMs"] = t.disposalRunMs; to["cleanMs"] = t.cleanMs; to["cleanHoldMs"] = t.cleanHoldMs; to["rangeStart"] = t.rangeStart; to["rangeEnd"] = t.rangeEnd; to["threshSens"] = t.threshSens;
  to["i2cKhz"] = t.i2cKhz; to["log"] = t.log; to["wifiCh"] = t.wifiCh; to["ledCount"] = t.ledCount; to["ledBright"] = t.ledBright; to["ledOrder"] = t.ledOrder; to["hyst"] = t.hyst; to["beamHalf"] = t.beamHalf; to["ledOffset"] = t.ledOffset; to["bgRelearnIdleMs"] = t.bgRelearnIdleMs; to["nearWin"] = t.nearWin; to["smooth"] = t.smooth;
  out["profile"] = c.profile;
  JsonObject ps = out["profiles"].to<JsonObject>();
  for (int i = 0; i < c.nProfiles; i++) { const Profile& P = c.profiles[i]; JsonObject po = ps[P.id].to<JsonObject>(); po["name"] = P.name; po["hotF"] = P.hotF; po["hotCapF"] = P.hotCapF; po["warmF"] = P.warmF; po["cupMl"] = P.cupMl; po["soapMl"] = P.soapMl; po["flowGpm"] = P.flowGpm; po["colors"].to<JsonObject>(); }
  JsonObject u = out["units"].to<JsonObject>(); u["temp"] = c.tempUnit;
}

template <typename T> static void get(JsonObjectConst o, const char* k, T& v) { if (!o[k].isNull()) v = o[k].as<T>(); }

bool configFromJson(const JsonObjectConst in, Config& c) {
  if (in.isNull()) return false;
  JsonObjectConst p = in["plane"]; if (!p.isNull()) { get(p, "w", c.plane.w); get(p, "d", c.plane.d); }
  JsonObjectConst s = in["sensors"]; if (!s.isNull()) { poseFromJson(s["A"], c.A); poseFromJson(s["B"], c.B); poseFromJson(s["C"], c.C); }
  JsonObjectConst h = in["hand"]; if (!h.isNull()) { get(h, "zmin", c.hand.zmin); get(h, "zmax", c.hand.zmax); get(h, "zwork", c.hand.zwork); get(h, "strMin", c.hand.strMin); get(h, "strMax", c.hand.strMax); get(h, "stillThr", c.hand.stillThr); }
  JsonObjectConst rg = in["rig"]; if (!rg.isNull()) { if (rg["mount"].is<const char*>()) cpy(c.rig.mount, sizeof c.rig.mount, rg["mount"]); get(rg, "slotH", c.rig.slotH); get(rg, "recess", c.rig.recess); get(rg, "sinkDepth", c.rig.sinkDepth); get(rg, "beamV", c.rig.beamV); }
  JsonObjectConst ms = in["masks"];
  if (!ms.isNull()) {
    c.nMasks = 0;
    for (JsonPairConst kv : ms) {
      if (c.nMasks >= MAX_MASKS) break;
      JsonObjectConst mo = kv.value(); if (mo.isNull()) continue;
      Mask& m = c.masks[c.nMasks]; m = Mask(); cpy(m.id, sizeof m.id, kv.key().c_str()); const char* t = mo["t"] | "rect"; m.kind = strcmp(t, "circle") == 0 ? 1 : 0;
      m.x = mo["x"] | 0.0f; m.y = mo["y"] | 0.0f;
      if (m.kind == 1) { m.a = mo["r"] | 0.0f; if (m.a < 1) continue; } else { m.a = mo["w"] | 0.0f; m.b = mo["h"] | 0.0f; if (m.a < 1 || m.b < 1) continue; }
      c.nMasks++;
    }
  }
  if (in["layout"].is<const char*>()) cpy(c.layout, sizeof c.layout, in["layout"]);
  JsonObjectConst ls = in["layouts"];
  if (!ls.isNull()) {
    c.nLayouts = 0;
    for (JsonPairConst kv : ls) {
      if (c.nLayouts >= MAX_LAYOUTS) break;
      JsonObjectConst lo = kv.value(); if (lo.isNull()) continue;
      Layout& L = c.layouts[c.nLayouts++]; L = Layout(); cpy(L.id, sizeof L.id, kv.key().c_str()); cpy(L.name, sizeof L.name, lo["name"] | kv.key().c_str());
      JsonArrayConst rows = lo["rows"]; L.nRows = 0;
      for (JsonObjectConst ro : rows) { if (L.nRows >= MAX_ROWS) break; LayoutRow& R = L.rows[L.nRows++]; R.h = ro["h"] | 0.0f; R.n = 0; for (JsonVariantConst f : ro["fns"].as<JsonArrayConst>()) { if (R.n >= MAX_COLS) break; R.fns[R.n++] = fnFromName(f.as<const char*>()); } }
    }
    if (!c.findLayout(c.layout) && c.nLayouts) cpy(c.layout, sizeof c.layout, c.layouts[0].id);
  }
  JsonObjectConst to = in["tuning"]; Tuning& t = c.tuning;
  if (!to.isNull()) {
    get(to, "settleMs", t.settleMs); get(to, "settleSpeed", t.settleSpeed); get(to, "startSpeed", t.startSpeed); get(to, "goneFrames", t.goneFrames); get(to, "exitMs", t.exitMs); get(to, "stillOffMs", t.stillOffMs); get(to, "presentFrames", t.presentFrames);
    get(to, "disposalHoldMs", t.disposalHoldMs); get(to, "disposalRunMs", t.disposalRunMs); get(to, "cleanMs", t.cleanMs); get(to, "cleanHoldMs", t.cleanHoldMs); get(to, "rangeStart", t.rangeStart); get(to, "rangeEnd", t.rangeEnd); get(to, "threshSens", t.threshSens);
    get(to, "i2cKhz", t.i2cKhz); get(to, "log", t.log); get(to, "wifiCh", t.wifiCh); get(to, "ledCount", t.ledCount); get(to, "ledBright", t.ledBright); if (to["ledOrder"].is<const char*>()) cpy(t.ledOrder, sizeof t.ledOrder, to["ledOrder"]); get(to, "hyst", t.hyst); get(to, "beamHalf", t.beamHalf); get(to, "nearWin", t.nearWin); get(to, "smooth", t.smooth); get(to, "ledOffset", t.ledOffset); get(to, "bgRelearnIdleMs", t.bgRelearnIdleMs);
  }
  if (in["profile"].is<const char*>()) cpy(c.profile, sizeof c.profile, in["profile"]);
  JsonObjectConst ps = in["profiles"];
  if (!ps.isNull()) {
    c.nProfiles = 0;
    for (JsonPairConst kv : ps) { if (c.nProfiles >= MAX_PROFILES) break; JsonObjectConst po = kv.value(); if (po.isNull()) continue; Profile& P = c.profiles[c.nProfiles++]; P = Profile(); cpy(P.id, sizeof P.id, kv.key().c_str()); cpy(P.name, sizeof P.name, po["name"] | kv.key().c_str()); get(po, "hotF", P.hotF); get(po, "hotCapF", P.hotCapF); get(po, "warmF", P.warmF); get(po, "cupMl", P.cupMl); get(po, "soapMl", P.soapMl); get(po, "flowGpm", P.flowGpm); }
    if (!c.nProfiles) { c.nProfiles = 1; c.profiles[0] = Profile(); }
  }
  JsonObjectConst u = in["units"]; if (!u.isNull() && u["temp"].is<const char*>()) cpy(c.tempUnit, sizeof c.tempUnit, u["temp"]);
  // sanity
  if (t.ledCount < 1 || t.ledCount > 600) t.ledCount = 132;
  if (t.rangeEnd <= t.rangeStart) t.rangeEnd = t.rangeStart + 100;
  if (c.plane.w < 100) c.plane.w = 584.2f;
  if (c.plane.d < 100) c.plane.d = 533.4f;
  return true;
}

// Dotted-path sets are applied on a JSON image of the config, then read back. Simple and schema-proof.
bool configApplySet(Config& c, const JsonObjectConst set, char* err, int errLen) {
  JsonDocument doc; JsonObject root = doc.to<JsonObject>(); configToJson(c, root);
  for (JsonPairConst kv : set) {
    char path[96]; strncpy(path, kv.key().c_str(), sizeof path - 1); path[sizeof path - 1] = 0;
    JsonVariant node = root; char* tok = strtok(path, "."); char* next;
    while (tok) {
      next = strtok(nullptr, ".");
      if (!next) {
        if (kv.value().isNull()) { if (node.is<JsonObject>()) node.as<JsonObject>().remove(tok); }
        else { JsonObject o = node.as<JsonObject>(); if (o.isNull()) { snprintf(err, errLen, "bad path %s", kv.key().c_str()); return false; } o[tok].set(kv.value()); }
      } else {
        JsonObject o = node.as<JsonObject>(); if (o.isNull()) { snprintf(err, errLen, "bad path %s", kv.key().c_str()); return false; }
        if (o[tok].isNull()) o[tok].to<JsonObject>();
        node = o[tok];
      }
      tok = next;
    }
  }
  Config fresh; setDefaults(fresh); configFromJson(root, fresh);
  // keep layouts/profiles exactly as the JSON says (configFromJson rebuilt them); copy over
  c = fresh; return true;
}

}  // namespace ring
