#include "config_json.h"
#include <string.h>
#include <math.h>
#include <stdio.h>

namespace ring {

static void poseToJson(const SensorPose& s, JsonObject o) { o["x"] = s.x; o["y"] = s.y; o["z"] = s.z; o["yaw"] = s.yaw; o["tilt"] = s.tilt; o["off"] = s.off; o["on"] = s.on; }
static void poseFromJson(JsonObjectConst o, SensorPose& s) { if (o.isNull()) return; if (o["x"].is<float>()) s.x = o["x"]; if (o["y"].is<float>()) s.y = o["y"]; if (o["z"].is<float>()) s.z = o["z"]; if (o["yaw"].is<float>()) s.yaw = o["yaw"]; if (o["tilt"].is<float>()) s.tilt = o["tilt"]; if (o["off"].is<float>()) s.off = o["off"]; if (o["on"].is<bool>()) s.on = o["on"]; }
static void cpy(char* dst, size_t n, const char* src) { if (!src) return; strncpy(dst, src, n - 1); dst[n - 1] = 0; }

void configToJson(const Config& c, JsonObject out) {
  out["schema"] = c.schema;
  JsonObject p = out["plane"].to<JsonObject>(); p["w"] = c.plane.w; p["d"] = c.plane.d; p["unit"] = "in";
  JsonObject s = out["sensors"].to<JsonObject>(); poseToJson(c.A, s["A"].to<JsonObject>()); poseToJson(c.B, s["B"].to<JsonObject>()); poseToJson(c.C, s["C"].to<JsonObject>());
  JsonObject h = out["hand"].to<JsonObject>(); h["zmin"] = c.hand.zmin; h["zmax"] = c.hand.zmax; h["zwork"] = c.hand.zwork; h["strMin"] = c.hand.strMin; h["strMax"] = c.hand.strMax; h["stillThr"] = c.hand.stillThr; h["envRef"] = c.hand.envRef; h["envK"] = c.hand.envK; h["envDb"] = c.hand.envDb;
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
  JsonObjectConst h = in["hand"]; if (!h.isNull()) { get(h, "zmin", c.hand.zmin); get(h, "zmax", c.hand.zmax); get(h, "zwork", c.hand.zwork); get(h, "strMin", c.hand.strMin); get(h, "strMax", c.hand.strMax); get(h, "stillThr", c.hand.stillThr); get(h, "envRef", c.hand.envRef); get(h, "envK", c.hand.envK); get(h, "envDb", c.hand.envDb); }
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
  // Parsing preserves supplied values. Validation is intentionally separate so malformed
  // persisted/imported/operator configuration is rejected rather than silently rewritten.
  return true;
}

static bool bad(char* err, int n, const char* msg) { if (err && n > 0) { snprintf(err, n, "%s", msg); } return false; }
bool validateConfig(const Config& c, char* err, int errLen) {
  auto finite = [](float v) { return isfinite(v); };
  if (!finite(c.plane.w) || !finite(c.plane.d) || c.plane.w < 300 || c.plane.w > 1200 || c.plane.d < 250 || c.plane.d > 1200) return bad(err, errLen, "plane dimensions out of range");
  const SensorPose* poses[] = {&c.A,&c.B,&c.C}; for (auto p : poses) if (!finite(p->x)||!finite(p->y)||!finite(p->z)||!finite(p->yaw)||!finite(p->tilt)||!finite(p->off)||fabsf(p->x)>2000||fabsf(p->y)>2000||fabsf(p->z)>1000||fabsf(p->yaw)>720||fabsf(p->tilt)>90||fabsf(p->off)>500) return bad(err, errLen, "sensor pose out of range");
  const HandModel& h=c.hand; if (!finite(h.zmin)||!finite(h.zmax)||!finite(h.zwork)||h.zmin>=h.zmax||h.zwork<h.zmin||h.zwork>h.zmax||h.zmin<-300||h.zmax>500) return bad(err,errLen,"hand depth model invalid");
  if (!finite(h.strMin)||!finite(h.strMax)||h.strMin<0||h.strMax<=h.strMin||h.strMax>1000000||!finite(h.stillThr)||h.stillThr<0||h.stillThr>100) return bad(err,errLen,"hand strength/noise model invalid");
  if (c.nLayouts<1||c.nLayouts>MAX_LAYOUTS||!c.findLayout(c.layout)) return bad(err,errLen,"layout selection invalid");
  for(int i=0;i<c.nLayouts;i++){ const Layout& L=c.layouts[i]; if(!L.id[0]||L.nRows<1||L.nRows>MAX_ROWS) return bad(err,errLen,"layout rows invalid"); float sum=0; for(int j=0;j<L.nRows;j++){ const LayoutRow& R=L.rows[j]; if(!finite(R.h)||R.h<=0||R.h>1||R.n<1||R.n>MAX_COLS) return bad(err,errLen,"layout geometry invalid"); sum+=R.h; } if(fabsf(sum-1.0f)>0.02f) return bad(err,errLen,"layout row heights must sum to 1"); }
  const Tuning& t=c.tuning;
  if(t.settleMs<20||t.settleMs>3000||!finite(t.settleSpeed)||t.settleSpeed<1||t.settleSpeed>3000||!finite(t.startSpeed)||t.startSpeed<0||t.startSpeed>3000||t.goneFrames<1||t.goneFrames>30||t.exitMs<100||t.exitMs>10000) return bad(err,errLen,"tracking timing invalid");
  if(t.stillOffMs<1000||t.stillOffMs>120000||t.presentFrames<1||t.presentFrames>30||t.disposalHoldMs<250||t.disposalHoldMs>10000||t.disposalRunMs<1000||t.disposalRunMs>30000||t.cleanMs<5000||t.cleanMs>600000||t.cleanHoldMs<500||t.cleanHoldMs>10000) return bad(err,errLen,"function timing invalid");
  if(t.rangeStart<40||t.rangeEnd>3000||t.rangeEnd<=t.rangeStart+50||!finite(t.threshSens)||t.threshSens<0.1f||t.threshSens>5.0f||t.i2cKhz<50||t.i2cKhz>1000||t.wifiCh<1||t.wifiCh>13) return bad(err,errLen,"sensor/network tuning invalid");
  if(t.ledCount<1||t.ledCount>600||!finite(t.hyst)||t.hyst<0||t.hyst>150||!finite(t.beamHalf)||t.beamHalf<5||t.beamHalf>90||!finite(t.nearWin)||t.nearWin<0||t.nearWin>500||!finite(t.smooth)||t.smooth<0.05f||t.smooth>1.0f) return bad(err,errLen,"UI/association tuning invalid");
  if(c.nProfiles<1||c.nProfiles>MAX_PROFILES||!c.activeProfile()) return bad(err,errLen,"profile selection invalid");
  for(int i=0;i<c.nProfiles;i++){ const Profile& p=c.profiles[i]; if(!p.id[0]||!finite(p.hotF)||!finite(p.hotCapF)||!finite(p.warmF)||p.hotF<60||p.hotF>p.hotCapF||p.hotCapF>140||p.warmF<50||p.warmF>p.hotCapF||!finite(p.cupMl)||p.cupMl<10||p.cupMl>2000||!finite(p.soapMl)||p.soapMl<0.05f||p.soapMl>20||!finite(p.flowGpm)||p.flowGpm<0.1f||p.flowGpm>5) return bad(err,errLen,"profile values invalid"); }
  for(int i=0;i<c.nMasks;i++){ const Mask&m=c.masks[i]; if(!m.id[0]||!finite(m.x)||!finite(m.y)||!finite(m.a)||!finite(m.b)||m.a<=0||(m.kind==0&&m.b<=0)) return bad(err,errLen,"mask invalid"); }
  if(err&&errLen>0) err[0]=0; return true;
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
  if (!validateConfig(fresh, err, errLen)) return false;
  c = fresh; return true;
}

}  // namespace ring
