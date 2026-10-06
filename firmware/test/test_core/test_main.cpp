// Native tests for lib/core: geometry, and the state machine against the shared fixtures in test/fixtures.
// Run: pio test -e native   (from firmware/). Also: tools/native_tests.sh builds it with plain g++.
#include <unity.h>
#include "echo_hold.h"
#include <ArduinoJson.h>
#include <stdio.h>
#include <string.h>
#include <vector>
#include <string>
#include "geometry.h"
#include "config.h"
#include "config_json.h"
#include "state_machine.h"

using namespace ring;

static std::string readFile(const char* path) {
  FILE* f = fopen(path, "rb"); if (!f) { f = fopen((std::string("../") + path).c_str(), "rb"); } if (!f) return "";
  std::string s; char buf[4096]; size_t n; while ((n = fread(buf, 1, sizeof buf, f)) > 0) s.append(buf, n); fclose(f); return s;
}

// ---- geometry ---------------------------------------------------------------------------------------------------------------------------
void test_zones_kitchen() {
  Config c; setDefaults(c); Zone z[MAX_ZONES]; int n = buildZones(*c.findLayout("kitchen"), z, MAX_ZONES);
  TEST_ASSERT_EQUAL(9, n); TEST_ASSERT_EQUAL((int)Fn::Soap, (int)z[0].fn); TEST_ASSERT_EQUAL((int)Fn::Neutral, (int)z[4].fn); TEST_ASSERT_EQUAL((int)Fn::Cold, (int)z[8].fn);
  TEST_ASSERT_EQUAL_STRING("kitchen-2-1", z[7].id);
  TEST_ASSERT_EQUAL(6, buildZones(*c.findLayout("bathroom"), z, MAX_ZONES)); TEST_ASSERT_EQUAL(5, buildZones(*c.findLayout("accessible"), z, MAX_ZONES));
  TEST_ASSERT_FLOAT_WITHIN(1e-5, 0.4f, z[0].y1);
}
void test_hysteresis() {
  Config c; setDefaults(c); Zone z[MAX_ZONES]; int n = buildZones(*c.findLayout("kitchen"), z, MAX_ZONES); float edge = c.plane.w / 3;
  const Zone* a = zoneAt(z, n, c.plane, edge - 40, 450, nullptr, 20); TEST_ASSERT_NOT_NULL(a); TEST_ASSERT_EQUAL((int)Fn::Hot, (int)a->fn);
  TEST_ASSERT_EQUAL_PTR(a, zoneAt(z, n, c.plane, edge + 10, 450, a, 20));
  TEST_ASSERT_NULL(zoneAt(z, n, c.plane, edge + 10, 450, nullptr, 20));
  TEST_ASSERT_EQUAL((int)Fn::Warm, (int)zoneAt(z, n, c.plane, edge + 25, 450, a, 20)->fn);
}
void test_locate() {
  Config c; setDefaults(c); float pts[4][2] = { { 100, 100 }, { 292, 267 }, { 500, 480 }, { 60, 500 } };
  for (auto& p : pts) { float rA = range(c.A, p[0], p[1], c.hand.zwork), rB = range(c.B, p[0], p[1], c.hand.zwork), x, y; locate(rA, rB, c.A, c.B, c.hand.zwork, c.plane.w / 2, c.plane.d / 2, x, y); TEST_ASSERT_FLOAT_WITHIN(0.5, p[0], x); TEST_ASSERT_FLOAT_WITHIN(0.5, p[1], y); }
}
void test_geometry_uncertainty() {
  Config c; setDefaults(c); float back = geometryUncertainty(c.A,c.B,c.plane.w/2,20,c.hand.zwork,8); float front = geometryUncertainty(c.A,c.B,c.plane.w/2,c.plane.d*0.8f,c.hand.zwork,8);
  TEST_ASSERT_TRUE(back > front); TEST_ASSERT_TRUE(front > 0 && front < 100);
}
void test_tracker_smoothing() {
  // the same noisy readings: lower alpha gives a steadier dot
  float xs[8] = { 200, 214, 190, 212, 188, 210, 192, 205 }; float spread[2];
  float al[2] = { 1.0f, 0.3f };
  for (int k = 0; k < 2; k++) { Tracker t; t.setAlpha(al[k]); float lo = 1e9f, hi = -1e9f, ox, oy, sp;
    for (int i = 0; i < 8; i++) { t.update(xs[i], 150, 1000 + i * 43, ox, oy, sp); if (i >= 2) { if (ox < lo) lo = ox; if (ox > hi) hi = ox; } } spread[k] = hi - lo; }
  TEST_ASSERT_TRUE(spread[1] < spread[0] * 0.6f);
}
void test_reflection_filters() {
  // 406 x 330 bench rig, A(0,0) B(406.4,0). Mirrors ui/test/reflection.test.js.
  Config c; setDefaults(c); c.plane.w = 406.4f; c.plane.d = 330.2f; c.A.x = 0; c.A.y = 0; c.B.x = 406.4f; c.B.y = 0; float h = c.hand.zwork;
  // closed-form solver: exact in the back strip, never the mirror root, deterministic when the circles fall short
  float pts[5][2] = { { 203, 10 }, { 50, 30 }, { 380, 60 }, { 203, 165 }, { 400, 330 } };
  for (auto& p : pts) { float x, y; locate(range(c.A, p[0], p[1], h), range(c.B, p[0], p[1], h), c.A, c.B, h, c.plane.w / 2, c.plane.d / 2, x, y); TEST_ASSERT_FLOAT_WITHIN(0.01, p[0], x); TEST_ASSERT_FLOAT_WITHIN(0.01, p[1], y); }
  { float x, y, res = locate(180, 190, c.A, c.B, 0, c.plane.w / 2, c.plane.d / 2, x, y); TEST_ASSERT_FLOAT_WITHIN(1e-4, 0, y); TEST_ASSERT_TRUE(res > 20 && res < 40); TEST_ASSERT_TRUE(x > 180 && x < 230); }
  { float x, y; locate(range(c.A, 203, -12, h), range(c.B, 203, -12, h), c.A, c.B, h, c.plane.w / 2, c.plane.d / 2, x, y); TEST_ASSERT_TRUE(y > 0); }
  // back-edge lock is gone: a track pinned at y=0 does not drag the next valid fix onto the edge.
  // A genuinely out-of-plane solve is rejected rather than clamped back onto the sink boundary.
  { Echo a[1] = { { roundf(range(c.A, 203, 100, h)), 60 } }, b[1] = { { roundf(range(c.B, 203, 100, h)), 60 } };
    AssocOpts o{ &c.A, &c.B, &c.hand, &c.plane, nullptr, 0, nullptr, 0, true, 203, 0, 220 }; o.nearWin = 120;
    Assoc r = associate(a, 1, b, 1, o); TEST_ASSERT_EQUAL(FLAG_NONE, r.flag); TEST_ASSERT_FLOAT_WITHIN(2, 100, r.y);
    Echo a2[1] = { { roundf(range(c.A, -12, 150, h)), 60 } }, b2[1] = { { roundf(range(c.B, -12, 150, h)), 60 } }; o.hasPrev = false;
    Assoc e = associate(a2, 1, b2, 1, o); TEST_ASSERT_EQUAL(FLAG_OUTSIDE, e.flag); }
  // Measured 19.25 in bench evidence: a 228/222 mm pair is degenerate near the baseline and must be
  // rejected before nearWin. A 408/457 mm pair is well-conditioned and resolves inside the sink.
  { Config m = c; m.plane.w = 488.95f; m.plane.d = 533.4f; m.A.x = 0; m.A.y = 0; m.B.x = 488.95f; m.B.y = 0;
    Echo badA[1] = { { 228, 45 } }, badB[1] = { { 222, 33 } };
    AssocOpts o{ &m.A, &m.B, &m.hand, &m.plane, nullptr, 0, nullptr, 0, false, 0, 0, 220 }; o.nearWin = 120;
    TEST_ASSERT_EQUAL(FLAG_OUTSIDE, associate(badA, 1, badB, 1, o).flag);
    Echo goodA[1] = { { 408, 141 } }, goodB[1] = { { 457, 136 } };
    Assoc good = associate(goodA, 1, goodB, 1, o); TEST_ASSERT_EQUAL(FLAG_NONE, good.flag);
    TEST_ASSERT_FLOAT_WITHIN(3, 201, good.x); TEST_ASSERT_FLOAT_WITHIN(3, 355, good.y);
    Echo mixA[2] = { { 228, 45 }, { 408, 141 } }, mixB[2] = { { 222, 33 }, { 457, 136 } };
    TEST_ASSERT_EQUAL(FLAG_NONE, associate(mixA, 2, mixB, 2, o).flag); }
  // first-arrival rule: bounces later than the hand are dropped, and a strong bounce cannot set the reference
  { float x = 200, y = 180, rA = roundf(range(c.A, x, y, h)), rB = roundf(range(c.B, x, y, h));
    Echo a[3] = { { rA, 55 }, { rA + 90, 70 }, { rA + 240, 30 } }, b[2] = { { rB, 48 }, { rB + 160, 60 } };
    AssocOpts o{ &c.A, &c.B, &c.hand, &c.plane, nullptr, 0, nullptr, 0, false, 0, 0, 220 }; o.nearWin = 120;
    Assoc r = associate(a, 3, b, 2, o); TEST_ASSERT_EQUAL(FLAG_NONE, r.flag); TEST_ASSERT_EQUAL(0, r.iA); TEST_ASSERT_EQUAL(0, r.iB); TEST_ASSERT_TRUE(hypotf(r.x - x, r.y - y) < 3);
    Echo a2[2] = { { rA, 12 }, { rA + 90, 170 } }, b2[2] = { { rB, 10 }, { rB + 160, 160 } };
    Assoc r2 = associate(a2, 2, b2, 2, o); TEST_ASSERT_EQUAL(FLAG_NONE, r2.flag); TEST_ASSERT_EQUAL(0, r2.iA); TEST_ASSERT_EQUAL(0, r2.iB); }
  // track-aware reference: a cup nearer sensor A than the hand does not steal an established track
  { float hx = 150, hy = 200, cx = 100, cy = 80;
    Echo a[2] = { { roundf(range(c.A, cx, cy, h)), 40 }, { roundf(range(c.A, hx, hy, h)), 20 } }, b[2] = { { roundf(range(c.B, hx, hy, h)), 20 }, { roundf(range(c.B, cx, cy, h)), 40 } };
    AssocOpts o{ &c.A, &c.B, &c.hand, &c.plane, nullptr, 0, nullptr, 0, true, hx, hy, 220 }; o.nearWin = 120;
    Assoc r = associate(a, 2, b, 2, o); TEST_ASSERT_EQUAL(FLAG_NONE, r.flag); TEST_ASSERT_TRUE(hypotf(r.x - hx, r.y - hy) < 5);
    o.hasPrev = false; Assoc r0 = associate(a, 2, b, 2, o); TEST_ASSERT_EQUAL(FLAG_NONE, r0.flag); TEST_ASSERT_TRUE(hypotf(r0.x - cx, r0.y - cy) < 5); }
  // strength envelope
  { HandModel hm = c.hand; hm.envRef = 60; hm.envK = 2; hm.envDb = 12;
    TEST_ASSERT_TRUE(strengthInEnvelope(hm, 300, 60)); TEST_ASSERT_TRUE(strengthInEnvelope(hm, 300, 20)); TEST_ASSERT_TRUE(strengthInEnvelope(hm, 150, 180));
    TEST_ASSERT_FALSE(strengthInEnvelope(hm, 250, 400)); TEST_ASSERT_FALSE(strengthInEnvelope(hm, 300, 4)); TEST_ASSERT_TRUE(strengthInEnvelope(c.hand, 250, 400));
    float x = 200, y = 180, rA = roundf(range(c.A, x, y, h)), rB = roundf(range(c.B, x, y, h));
    Echo a[1] = { { rA, 400 } }, b[1] = { { rB, 380 } }; AssocOpts o{ &c.A, &c.B, &hm, &c.plane, nullptr, 0, nullptr, 0, false, 0, 0, 220 }; o.nearWin = 120;
    TEST_ASSERT_EQUAL(FLAG_STRENGTH, associate(a, 1, b, 1, o).flag);
    Echo a2[1] = { { rA, 70 } }, b2[1] = { { rB, 55 } }; TEST_ASSERT_EQUAL(FLAG_NONE, associate(a2, 1, b2, 1, o).flag); }
  // tracker predict extrapolates
  { Tracker t; t.setAlpha(0.6f); float ox, oy, sp; for (int i = 0; i < 8; i++) t.update(100 + 20 * i, 150, 1000 + 43 * i, ox, oy, sp); float px, py; t.predict(1000 + 43 * 8, px, py); TEST_ASSERT_TRUE(px > 100 + 20 * 7.5f); TEST_ASSERT_FLOAT_WITHIN(1, 150, py); }
}
void test_associate() {
  Config c; setDefaults(c); float x = 200, y = 400, rA = range(c.A, x, y, c.hand.zwork), rB = range(c.B, x, y, c.hand.zwork);
  Echo eA[3] = { { 520, 900 }, { roundf(rA), 2000 }, { roundf(rA) + 200, 2 } }, eB[3] = { { roundf(rB), 1800 }, { 650, 820 }, { roundf(rB) + 210, 2 } };
  Echo bgA[1] = { { 520, 900 } }, bgB[1] = { { 650, 820 } };
  AssocOpts o{ &c.A, &c.B, &c.hand, &c.plane, bgA, 1, bgB, 1, false, 0, 0, 220 };
  Assoc r = associate(eA, 3, eB, 3, o); TEST_ASSERT_EQUAL(FLAG_NONE, r.flag); TEST_ASSERT_FLOAT_WITHIN(4, x, r.x); TEST_ASSERT_FLOAT_WITHIN(4, y, r.y); TEST_ASSERT_EQUAL(1, r.iA); TEST_ASSERT_EQUAL(0, r.iB);
  Echo weak[1] = { { 400, 1 } }; Assoc w = associate(weak, 1, weak, 1, o); TEST_ASSERT_EQUAL(FLAG_STRENGTH, w.flag);
  Assoc none = associate(eA, 0, eB, 0, o); TEST_ASSERT_EQUAL(FLAG_NO_HAND, none.flag);
  // nearest-echo gate: a later echo (table bounce) is dropped, the near hand echo survives, and off means unchanged
  float x2 = 200, y2 = 150, hA = range(c.A, x2, y2, c.hand.zwork), hB = range(c.B, x2, y2, c.hand.zwork);
  Echo gA[2] = { { roundf(hA), 80 }, { roundf(hA) + 260, 150 } }, gB[2] = { { roundf(hB), 90 }, { roundf(hB) + 240, 160 } };
  AssocOpts og{ &c.A, &c.B, &c.hand, &c.plane, nullptr, 0, nullptr, 0, false, 0, 0, 220 }; og.nearWin = 120;
  Assoc g1 = associate(gA, 2, gB, 2, og); TEST_ASSERT_EQUAL(FLAG_NONE, g1.flag); TEST_ASSERT_EQUAL(0, g1.iA); TEST_ASSERT_EQUAL(0, g1.iB);
  Echo lateA[1] = { { roundf(hA) + 260, 150 } }, nearB[1] = { { roundf(hB), 90 } }; Echo faintA[2] = { { 70, 4 }, { roundf(hA), 80 } };
  Assoc g2 = associate(faintA, 2, nearB, 1, og); TEST_ASSERT_EQUAL(FLAG_NONE, g2.flag); TEST_ASSERT_EQUAL(1, g2.iA);   // a faint blip nearer than the hand does not drop it
  (void)lateA;
}
void test_masks_and_flat_defaults() {
  Config c; setDefaults(c);
  TEST_ASSERT_EQUAL_FLOAT(0, c.A.tilt); TEST_ASSERT_EQUAL_FLOAT(0, c.hand.zwork); TEST_ASSERT_EQUAL_STRING("flat", c.rig.mount); TEST_ASSERT_EQUAL(0, c.nMasks);
  float h = c.hand.zwork;
  float a1 = range(c.A, 430, 150, h), b1 = range(c.B, 430, 150, h), a2 = range(c.A, 150, 400, h), b2 = range(c.B, 150, 400, h);
  Echo eA[2] = { { roundf(a1), 3000 }, { roundf(a2), 2500 } }, eB[2] = { { roundf(b1), 3000 }, { roundf(b2), 2500 } };
  AssocOpts o{ &c.A, &c.B, &c.hand, &c.plane, nullptr, 0, nullptr, 0, false, 0, 0, 220 };
  // add a circle by the config path, as the protocol does
  JsonDocument sd; JsonObject set = sd.to<JsonObject>(); JsonObject m1 = set["masks.m1"].to<JsonObject>(); m1["t"] = "circle"; m1["x"] = 430; m1["y"] = 150; m1["r"] = 60; char err[64] = "";
  TEST_ASSERT_TRUE(configApplySet(c, set, err, sizeof err)); TEST_ASSERT_EQUAL(1, c.nMasks); TEST_ASSERT_EQUAL(1, c.masks[0].kind); TEST_ASSERT_FLOAT_WITHIN(0.01, 60, c.masks[0].a);
  o.masks = c.masks; o.nMasks = c.nMasks;
  Assoc r = associate(eA, 2, eB, 2, o); TEST_ASSERT_EQUAL(FLAG_NONE, r.flag); TEST_ASSERT_FLOAT_WITHIN(5, 150, r.x); TEST_ASSERT_FLOAT_WITHIN(5, 400, r.y);
  Assoc only = associate(eA, 1, eB, 1, o); TEST_ASSERT_EQUAL(FLAG_MASKED, only.flag);
  // a rectangle, with the edge exactly in or out
  Mask rect; rect.kind = 0; rect.x = 400; rect.y = 100; rect.a = 100; rect.b = 100;
  TEST_ASSERT_FALSE(maskHit(&rect, 1, 399, 150)); TEST_ASSERT_TRUE(maskHit(&rect, 1, 401, 150));
  // round trip through JSON keeps rig and masks; null deletes
  JsonDocument doc; JsonObject root = doc.to<JsonObject>(); configToJson(c, root); TEST_ASSERT_EQUAL(1, root["masks"].size()); TEST_ASSERT_EQUAL_STRING("flat", root["rig"]["mount"]);
  Config d; setDefaults(d); configFromJson(root, d); TEST_ASSERT_EQUAL(1, d.nMasks); TEST_ASSERT_EQUAL_STRING("m1", d.masks[0].id);
  JsonDocument sd2; JsonObject del = sd2.to<JsonObject>(); del["masks.m1"] = nullptr; TEST_ASSERT_TRUE(configApplySet(c, del, err, sizeof err)); TEST_ASSERT_EQUAL(0, c.nMasks);
}
void test_config_json_roundtrip_and_set() {
  Config c; setDefaults(c); JsonDocument doc; JsonObject root = doc.to<JsonObject>(); configToJson(c, root);
  TEST_ASSERT_EQUAL(3, root["layouts"].size()); TEST_ASSERT_EQUAL_STRING("kitchen", root["layout"]);
  Config d; setDefaults(d); d.tuning.settleMs = 999; configFromJson(root, d); TEST_ASSERT_EQUAL(150, d.tuning.settleMs);
  JsonDocument sd; JsonObject set = sd.to<JsonObject>(); set["tuning.settleMs"] = 210; set["sensors.A.off"] = 17.5; set["layouts.bathroom"] = nullptr; char err[64] = "";
  TEST_ASSERT_TRUE(configApplySet(c, set, err, sizeof err)); TEST_ASSERT_EQUAL(210, c.tuning.settleMs); TEST_ASSERT_FLOAT_WITHIN(0.01, 17.5, c.A.off); TEST_ASSERT_NULL(c.findLayout("bathroom")); TEST_ASSERT_EQUAL(2, c.nLayouts);
}

void test_config_validation_rejects_bad_values_atomically() {
  Config c; setDefaults(c); char err[96] = "";
  JsonDocument sd; JsonObject set = sd.to<JsonObject>(); set["tuning.wifiCh"] = 99;
  TEST_ASSERT_FALSE(configApplySet(c, set, err, sizeof err)); TEST_ASSERT_EQUAL(6, c.tuning.wifiCh); TEST_ASSERT_TRUE(strlen(err) > 0);
  sd.clear(); set = sd.to<JsonObject>(); set["tuning.rangeStart"] = 900; set["tuning.rangeEnd"] = 850;
  TEST_ASSERT_FALSE(configApplySet(c, set, err, sizeof err)); TEST_ASSERT_EQUAL(60, c.tuning.rangeStart); TEST_ASSERT_EQUAL(850, c.tuning.rangeEnd);
  sd.clear(); set = sd.to<JsonObject>(); set["tuning.smooth"] = 0.4;
  TEST_ASSERT_TRUE(configApplySet(c, set, err, sizeof err)); TEST_ASSERT_FLOAT_WITHIN(0.001, 0.4, c.tuning.smooth);
}

// ---- fixtures through the state machine ---------------------------------------------------------------------------------------------
struct Rec { std::string ev, fn, a, why; int lat; float used, savedOff, savedFlow; };
static std::vector<Rec> g_events;
static void onEv(const Event& e, void*) {
  Rec r; r.lat = e.lat; r.used = e.used; r.savedOff = e.savedOff; r.savedFlow = e.savedFlow; r.a = e.a ? e.a : ""; r.why = e.why ? e.why : ""; r.fn = e.fn == Fn::None ? "" : fnName(e.fn);
  switch (e.type) { case Ev::Session: r.ev = "session"; break; case Ev::Latch: r.ev = "latch"; break; case Ev::Soap: r.ev = "soap"; break; case Ev::CupFull: r.ev = "cupfull"; break; case Ev::Disp: r.ev = "disp"; break; case Ev::Off: r.ev = "off"; break; case Ev::Still: r.ev = "still"; break; case Ev::Clean: r.ev = "clean"; break; case Ev::FalseOff: r.ev = "falseoff"; break; case Ev::HeldOn: r.ev = "heldon"; break; case Ev::Resume: r.ev = "resume"; break; case Ev::Layout: r.ev = "layout"; break; case Ev::Bg: r.ev = "bg"; break; }
  g_events.push_back(r);
}
static bool matches(const Rec& e, JsonObjectConst x) {
  if (e.ev != (x["ev"] | "")) return false;
  if (!x["fn"].isNull() && e.fn != (x["fn"] | "")) return false;
  if (!x["a"].isNull() && e.a != (x["a"] | "")) return false;
  if (!x["why"].isNull() && e.why != (x["why"] | "")) return false;
  return true;
}
static JsonDocument g_fx;
void run_scenario(JsonObjectConst sc) {
  Config c; setDefaults(c); StateMachine sm(&c); g_events.clear(); sm.onEvent(onEv, nullptr);
  Zone z[MAX_ZONES]; int nz = buildZones(*c.findLayout("kitchen"), z, MAX_ZONES);
  uint32_t t = 0;
  for (JsonObjectConst seg : sc["plan"].as<JsonArrayConst>()) {
    bool has = !(seg["pos"].is<JsonVariantConst>() && seg["pos"].isNull() && !seg["zone"].is<const char*>());
    float px = 0, py = 0;
    if (seg["zone"].is<const char*>()) { Fn fn = fnFromName(seg["zone"]); for (int i = 0; i < nz; i++) if (z[i].fn == fn) { zoneCentre(z[i], c.plane, px, py); break; } has = true; }
    else if (seg["pos"].is<JsonArrayConst>()) { px = seg["pos"][0]; py = seg["pos"][1]; has = true; } else has = false;
    int frames = (int)((seg["ms"].as<float>() / 45.0f) + 0.5f); if (frames < 1) frames = 1;
    bool wobble = seg["wobble"] | false; float speed = seg["speed"].isNull() ? (has ? 20.0f : 0.0f) : seg["speed"].as<float>(); uint8_t flag = seg["flag"] | 0;
    for (int i = 0; i < frames; i++) { t += 45; Input in{ t, has, px + (wobble ? ((i % 2) ? 4.0f : -4.0f) : 0.0f), py, speed, flag }; sm.step(in); }
  }
  // ordered subsequence of expected events
  JsonArrayConst exp = sc["events"]; size_t k = 0; std::string got;
  for (const Rec& e : g_events) {
    got += e.ev + (e.fn.empty() ? "" : ":" + e.fn) + (e.a.empty() ? "" : ":" + e.a) + (e.why.empty() ? "" : "(" + e.why + ")") + " ";
    if (k < exp.size() && matches(e, exp[k])) {
      JsonObjectConst x = exp[k];
      if (!x["usedMin"].isNull()) { TEST_ASSERT_TRUE_MESSAGE(e.used >= x["usedMin"].as<float>() && e.savedOff >= x["savedOffMin"].as<float>() && e.savedFlow >= x["savedFlowMin"].as<float>(), "saved split"); }
      k++;
    }
  }
  char msg[512]; snprintf(msg, sizeof msg, "%s: expected events in order; got %s", sc["id"] | "?", got.c_str());
  TEST_ASSERT_EQUAL_MESSAGE((int)exp.size(), (int)k, msg);
  snprintf(msg, sizeof msg, "%s: final state", sc["id"] | "?"); TEST_ASSERT_EQUAL_MESSAGE(sc["state"].as<int>(), (int)sm.state(), msg);
  if (sc["fn"].is<const char*>()) TEST_ASSERT_EQUAL_STRING(sc["fn"], fnName(sm.fn()));
  if (!sc["latMax"].isNull()) { for (const Rec& e : g_events) if (e.ev == "latch") { TEST_ASSERT_TRUE_MESSAGE(e.lat >= 150 && e.lat <= sc["latMax"].as<int>(), "latency"); break; } }
  for (JsonObjectConst x : sc["noEvents"].as<JsonArrayConst>()) for (const Rec& e : g_events) { snprintf(msg, sizeof msg, "%s: unexpected %s", sc["id"] | "?", x["ev"] | ""); TEST_ASSERT_FALSE_MESSAGE(matches(e, x), msg); }
  for (JsonPairConst kv : sc["count"].as<JsonObjectConst>()) {
    std::string key = kv.key().c_str(), ev = key, a; size_t dot = key.find('.'); if (dot != std::string::npos) { ev = key.substr(0, dot); a = key.substr(dot + 1); }
    int n = 0; for (const Rec& e : g_events) if (e.ev == ev && (a.empty() || e.a == a)) n++;
    snprintf(msg, sizeof msg, "%s: count of %s", sc["id"] | "?", key.c_str()); TEST_ASSERT_EQUAL_MESSAGE(kv.value().as<int>(), n, msg);
  }
}
void test_fixtures() {
  std::string text = readFile("test/fixtures/scenarios.json");
  TEST_ASSERT_TRUE_MESSAGE(text.size() > 0, "scenarios.json not found (run from firmware/)");
  TEST_ASSERT_TRUE(deserializeJson(g_fx, text) == DeserializationError::Ok);
  int n = 0; for (JsonObjectConst sc : g_fx["scenarios"].as<JsonArrayConst>()) { run_scenario(sc); n++; }
  TEST_ASSERT_TRUE(n >= 10);
}
void test_layout_change_and_clean_commands() {
  Config c; setDefaults(c); StateMachine sm(&c); g_events.clear(); sm.onEvent(onEv, nullptr);
  Zone z[MAX_ZONES]; int nz = buildZones(*c.findLayout("kitchen"), z, MAX_ZONES); float px = 0, py = 0; for (int i = 0; i < nz; i++) if (z[i].fn == Fn::Disposal) zoneCentre(z[i], c.plane, px, py);
  uint32_t t = 0; for (int i = 0; i < 30; i++) { t += 45; Input in{ t, true, px + ((i % 2) ? 4.0f : -4.0f), py, i < 3 ? 400.0f : 20.0f, 0 }; sm.step(in); }
  TEST_ASSERT_TRUE(sm.disposalUntil() > 0);
  strcpy(c.layout, "bathroom"); TEST_ASSERT_TRUE(sm.setLayout("bathroom")); TEST_ASSERT_EQUAL(IDLE, sm.state()); TEST_ASSERT_EQUAL(0, (int)sm.disposalUntil());
  sm.startClean("ui"); TEST_ASSERT_EQUAL(CLEAN, sm.state()); sm.endClean(); TEST_ASSERT_EQUAL(IDLE, sm.state());
}

void setUp() {} void tearDown() {}
static void test_echo_hold() {
  EchoHold h(2); Echo a[1] = { { 300, 80 } }; int n = 0; bool held = false;
  const Echo* r = h.update(a, 1, true, n, held); TEST_ASSERT_FALSE(held); TEST_ASSERT_EQUAL(1, n); TEST_ASSERT_TRUE(r == a);
  r = h.update(a, 0, true, n, held); TEST_ASSERT_TRUE(held); TEST_ASSERT_EQUAL(1, n); TEST_ASSERT_EQUAL_FLOAT(300, r[0].d);   // 1st missed frame held
  r = h.update(a, 0, true, n, held); TEST_ASSERT_TRUE(held); TEST_ASSERT_EQUAL(1, n);                                          // 2nd held
  r = h.update(a, 0, true, n, held); TEST_ASSERT_FALSE(held); TEST_ASSERT_EQUAL(0, n);                                         // 3rd: let go
  r = h.update(a, 0, true, n, held); TEST_ASSERT_FALSE(held); TEST_ASSERT_EQUAL(0, n);                                         // nothing saved any more
  Echo b[1] = { { 250, 60 } }; h.update(b, 1, true, n, held); r = h.update(b, 0, false, n, held);                              // a dead sensor is never held
  TEST_ASSERT_FALSE(held); TEST_ASSERT_EQUAL(0, n); r = h.update(b, 0, true, n, held); TEST_ASSERT_FALSE(held); TEST_ASSERT_EQUAL(0, n);
  h.update(b, 1, true, n, held); Echo c[2] = { { 100, 9 }, { 200, 9 } }; h.update(c, 2, true, n, held); r = h.update(c, 0, true, n, held);
  TEST_ASSERT_TRUE(held); TEST_ASSERT_EQUAL(2, n); TEST_ASSERT_EQUAL_FLOAT(200, r[1].d);                                       // keeps the latest list
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_zones_kitchen); RUN_TEST(test_hysteresis); RUN_TEST(test_locate); RUN_TEST(test_geometry_uncertainty); RUN_TEST(test_associate); RUN_TEST(test_reflection_filters); RUN_TEST(test_tracker_smoothing); RUN_TEST(test_masks_and_flat_defaults); RUN_TEST(test_config_json_roundtrip_and_set); RUN_TEST(test_config_validation_rejects_bad_values_atomically);
  RUN_TEST(test_fixtures); RUN_TEST(test_echo_hold); RUN_TEST(test_layout_change_and_clean_commands);
  return UNITY_END();
}
