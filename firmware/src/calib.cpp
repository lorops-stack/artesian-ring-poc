// calib.cpp - calibration steps on the device (spec section 8): C0 hardware check, identify, C6 background capture,
// C7 wand readings and C8 hand readings. The fits (C7, C8) run in the browser from the samples sent here.
#include "app.h"
#include "xm125.h"

using namespace ring;
namespace app { namespace calib {

enum Step : uint8_t { NONE, C0, IDENT, C6, C7, C8 };
enum St : uint8_t { IDLE_, RUNNING, WAITING, DONE, FAILED };
struct Check { const char* id; const char* label; int ok; const char* code; char detail[80]; };
struct Sample { uint8_t hole; uint8_t depth; bool high; bool hasA, hasB; float dA, sA, dB, sB, spread; };
struct Pair { uint8_t hole, depth; bool high; };

static Step cur = NONE; static St st = IDLE_; static bool dirty = false; static uint32_t t0 = 0, phaseT = 0;
static Check checks[8]; static int nChecks = 0; static char prompt[96] = "";
static Pair queue[64]; static int qn = 0; static Sample samples[40]; static int ns = 0; static int skips = 0;
static float bufA[14], bufSA[14], bufB[14], bufSB[14]; static int bufN = 0; static float stillA[120], stillB[120]; static int stillN = 0; static bool stillPhase = false, stillDone = false;
static float readA = 0, readB = 0; static bool haveRead = false;
// c6 capture buffers
static struct { float d; float s; int n; } accA[12], accB[12]; static int nAccA = 0, nAccB = 0; static int capFrames = 0; static bool c6Ok = true; static float c6Max = 0;
static Hole holes[16]; static bool waveA = false, waveB = false; static float noiseSpread = -1; static bool identA = false, identB = false;

static void mark() { dirty = true; }
static void takeBus() { g.pauseSensing = true; for (int i = 0; i < 60 && g.sensingBusy; i++) delay(5); delay(10); }
bool changed() { bool d = dirty; dirty = false; return d; }
void begin() {}

static void setPrompt(const char* p) { strncpy(prompt, p, sizeof prompt - 1); st = WAITING; mark(); }
static void addCheck(const char* id, const char* label, int ok, const char* code, const char* detail) {
  if (nChecks >= 8) return; Check& c = checks[nChecks++]; c.id = id; c.label = label; c.ok = ok; c.code = code; strncpy(c.detail, detail ? detail : "", sizeof c.detail - 1); c.detail[sizeof c.detail - 1] = 0; mark();
}
static void buildQueue(bool c7) {
  qn = 0;
  for (int h = 1; h <= 16; h++) { if (c7) { queue[qn++] = { (uint8_t)h, 60, false }; queue[qn++] = { (uint8_t)h, 160, false }; } else { queue[qn++] = { (uint8_t)h, 0, true }; queue[qn++] = { (uint8_t)h, 0, false }; } }
}
static void nextWaiting() {
  bufN = 0; haveRead = false;
  if (qn > 0) { const Pair& p = queue[0]; if (cur == C7) snprintf(prompt, sizeof prompt, "Hole %d, mark %d (%d mm)", p.hole, p.depth == 60 ? 1 : 2, p.depth); else snprintf(prompt, sizeof prompt, "Hole %d, hand held %s", p.hole, p.high ? "high" : "low"); st = WAITING; mark(); return; }
  if (cur == C8 && !stillDone) { stillPhase = true; stillN = 0; setPrompt("Hold your hand as still as you can over the drain for 5 seconds"); return; }
  st = DONE; g.calTargetHole = 0; mark();
}
static void removeHole(uint8_t hole) { int w = 0; for (int i = 0; i < qn; i++) if (queue[i].hole != hole) queue[w++] = queue[i]; qn = w; }

bool command(const char* s, const char* a, JsonVariantConst extra, char* err, int errLen) {
  Step want = !strcmp(s, "c0") ? C0 : !strcmp(s, "identify") ? IDENT : !strcmp(s, "c6") ? C6 : !strcmp(s, "c7") ? C7 : !strcmp(s, "c8") ? C8 : NONE;
  if (!strcmp(a, "stop")) { cur = NONE; st = IDLE_; g.pauseSensing = false; g.calTargetHole = 0; mark(); return true; }
  if (!strcmp(a, "apply")) {
    { Lock lk; JsonObjectConst sens = extra["sensors"]; JsonObjectConst hand = extra["hand"];
    auto poseSet = [&](JsonObjectConst o, SensorPose& p) { if (o.isNull()) return; if (!o["x"].isNull()) p.x = o["x"]; if (!o["y"].isNull()) p.y = o["y"]; if (!o["z"].isNull()) p.z = o["z"]; if (!o["off"].isNull()) p.off = o["off"]; };
    if (!sens.isNull()) { poseSet(sens["A"], g.cfg.A); poseSet(sens["B"], g.cfg.B); }
    if (!hand.isNull()) { if (!hand["zwork"].isNull()) g.cfg.hand.zwork = hand["zwork"]; if (!hand["strMin"].isNull()) g.cfg.hand.strMin = hand["strMin"]; if (!hand["strMax"].isNull()) g.cfg.hand.strMax = hand["strMax"]; if (!hand["stillThr"].isNull()) g.cfg.hand.stillThr = hand["stillThr"]; }
    g.sm->setConfig(&g.cfg); g.cfgDirty = true; g.cfgDirtyAt = millis(); }
    net::sendCfg(); return true;
  }
  if (want == NONE) { snprintf(err, errLen, "unknown step"); return false; }
  if (!strcmp(a, "start")) {
    cur = want; st = RUNNING; t0 = millis(); phaseT = t0; nChecks = 0; ns = 0; skips = 0; qn = 0; bufN = 0; stillPhase = stillDone = false; stillN = 0; haveRead = false; prompt[0] = 0; waveA = waveB = false; noiseSpread = -1; identA = identB = false;
    templateHoles(g.cfg.plane, holes);
    if (want == IDENT) setPrompt("Hold your hand 20 cm in front of the back-left sensor");
    else if (want == C6) { nAccA = nAccB = 0; capFrames = 0; c6Ok = true; c6Max = 0; takeBus(); }
    else if (want == C7) { buildQueue(true); nextWaiting(); }
    else if (want == C8) { buildQueue(false); nextWaiting(); }
    mark(); return true;
  }
  if (cur != want) { snprintf(err, errLen, "step not running"); return false; }
  if (!strcmp(a, "next")) { st = RUNNING; phaseT = millis(); mark(); return true; }
  if (!strcmp(a, "sample")) { st = RUNNING; bufN = 0; phaseT = millis(); if (qn) g.calTargetHole = queue[0].hole; mark(); return true; }
  if (!strcmp(a, "skip")) { if (cur == C7) { if (skips >= 2) { snprintf(err, errLen, "only 2 holes may be skipped"); return false; } skips++; } if (qn) removeHole(queue[0].hole); nextWaiting(); return true; }
  if (!strcmp(a, "redo")) {
    uint8_t hole = extra["hole"] | (qn ? queue[0].hole : 1);
    int w = 0; for (int i = 0; i < ns; i++) if (samples[i].hole != hole) samples[w++] = samples[i]; ns = w;
    removeHole(hole); // put the hole's pairs at the front
    Pair add[2]; int na = 0; if (cur == C7) { add[na++] = { hole, 60, false }; add[na++] = { hole, 160, false }; } else { add[na++] = { hole, 0, true }; add[na++] = { hole, 0, false }; }
    for (int i = qn - 1; i >= 0; i--) queue[i + na] = queue[i]; for (int i = 0; i < na; i++) queue[i] = add[i]; qn += na;
    if (st == DONE) st = WAITING; nextWaiting(); return true;
  }
  snprintf(err, errLen, "unknown action"); return false;
}

// Pick the echo that belongs to the wand/hand near a hole: strongest echo within ±180 mm of the expected range.
static bool pickNear(const SensorFrame& S, const SensorPose& P, const Hole& H, float depth, float& d, float& s) {
  float exp = range(P, H.x, H.y, depth) + P.off; int best = -1; float bs = 0;
  for (int i = 0; i < S.n; i++) if (fabsf(S.e[i].d - exp) <= 180 && S.e[i].s > bs) { bs = S.e[i].s; best = i; }
  if (best < 0 && S.n) { // fall back to the strongest echo anywhere
    for (int i = 0; i < S.n; i++) if (S.e[i].s > bs) { bs = S.e[i].s; best = i; }
  }
  if (best < 0) return false; d = S.e[best].d; s = S.e[best].s; return true;
}
static float median(float* v, int n) { for (int i = 1; i < n; i++) for (int j = i; j > 0 && v[j - 1] > v[j]; j--) { float t = v[j]; v[j] = v[j - 1]; v[j - 1] = t; } return n ? (n % 2 ? v[n / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : 0; }
static float spread(const float* v, int n) { if (n < 2) return 0; float m = 0; for (int i = 0; i < n; i++) m += v[i]; m /= n; float s = 0; for (int i = 0; i < n; i++) s += (v[i] - m) * (v[i] - m); return sqrtf(s / (n - 1)); }

// Runs on core 0 every few ms. Reads the latest frame published by core 1.
void step() {
  if (cur == NONE || st == DONE || st == FAILED) return;
  uint32_t now = millis(); Frame f; { Lock lk; f = g.frame; }
  if (cur == C0) {
    if (st != RUNNING) return;
    int idx = nChecks; char d[80];
    switch (idx) {
      case 0: { takeBus(); bool a = sensing::sensorPresent('A'), b = sensing::sensorPresent('B'); snprintf(d, sizeof d, "%s%s", a ? "" : "Sensor A not found. ", b ? "" : "Sensor B not found."); addCheck("found", "Sensors answer on their buses", a && b, "W1", a && b ? "A and B answer at 0x52" : d); break; }
      case 1: { char va[16] = "-", vb[16] = "-"; uint32_t A = sensing::sensorVersion('A'), B = sensing::sensorVersion('B'); xm125::Sensor::versionString(A, va, sizeof va); xm125::Sensor::versionString(B, vb, sizeof vb); bool ok = A != 0 && B != 0 && (A >> 16) >= 1 && (B >> 16) >= 1; snprintf(d, sizeof d, "A: %s · B: %s", va, vb); addCheck("fw", "Distance detector firmware", ok, "F1", d); break; }
      case 2: { uint32_t sa = sensing::sensorStatus('A'), sb = sensing::sensorStatus('B'); bool ok = !((sa | sb) & (xm125::ST_ERROR_MASK | xm125::ST_DETECTOR_ERROR)); snprintf(d, sizeof d, ok ? "no error flags" : "A 0x%08lx · B 0x%08lx", (unsigned long)sa, (unsigned long)sb); addCheck("status", "Sensor status flags", ok, "F2", d); break; }
      case 3: { char ra = '0', rb = '0'; bool a = sensing::resetTest('A', ra), b = sensing::resetTest('B', rb); bool ok = a && b; if (ok) snprintf(d, sizeof d, "A and B each restart on their own line"); else if (ra == 'B' || rb == 'A') snprintf(d, sizeof d, "Resetting %c restarted %c", ra == 'B' ? 'A' : 'B', ra == 'B' ? 'B' : 'A'); else snprintf(d, sizeof d, "Sensor %c did not restart when reset", a ? 'B' : 'A'); addCheck("rst", "Reset lines", ok, "W4", d); g.pauseSensing = false; break; }
      case 4: { if (!waveA && !waveB && now - phaseT < 100) { setPrompt("Wave the foil ball 20 cm in front of sensor A, then sensor B"); return; }
                for (int i = 0; i < f.A.n; i++) if (f.A.e[i].d < 300) waveA = true; for (int i = 0; i < f.B.n; i++) if (f.B.e[i].d < 300) waveB = true;
                if (now - phaseT < 6000 && !(waveA && waveB)) return;
                snprintf(d, sizeof d, "%s %s", waveA ? "A sees the ball." : "A sees nothing.", waveB ? "B sees the ball." : "B sees nothing."); addCheck("wave", "Wave test: each sensor sees the ball", waveA && waveB, "S1", d); phaseT = now; break; }
      case 5: { if (noiseSpread < 0 && now - phaseT < 100) { setPrompt("Hold the ball still in the middle of the sink for 3 seconds"); return; }
                if (now - phaseT < 3200) return; noiseSpread = sensing::stillSpread(); if (noiseSpread < 0) noiseSpread = 99; snprintf(d, sizeof d, "spread %.1f mm", noiseSpread); addCheck("noise", "Still-target noise under 5 mm", noiseSpread < 5, "S4", d); break; }
      case 6: addCheck("led", "LED ring (answer the questions)", -1, "", "white test, colour order, count"); st = DONE; break;
    }
    return;
  }
  if (cur == IDENT) {
    if (st != WAITING) return;
    for (int i = 0; i < f.A.n; i++) if (f.A.e[i].d < 300 && f.A.e[i].s > g.cfg.hand.strMin) identA = true;
    for (int i = 0; i < f.B.n; i++) if (f.B.e[i].d < 300 && f.B.e[i].s > g.cfg.hand.strMin) identB = true;
    if (identA || identB) { st = DONE; mark(); }
    return;
  }
  if (cur == C6) {
    if (st != RUNNING) return;
    if (g.pauseSensing) { for (int i = 0; i < 60 && g.sensingBusy; i++) delay(5); bool ok = sensing::recordBackground(); g.pauseSensing = false; c6Ok = ok; phaseT = now; if (!ok) { st = FAILED; mark(); } return; }
    if (now - phaseT < 600) return;   // let the first frames after the capture arrive
    auto acc = [&](const SensorFrame& S, decltype(accA)& A, int& n) { for (int i = 0; i < S.n; i++) { bool seen = false; for (int k = 0; k < n; k++) if (fabsf(A[k].d - S.e[i].d) <= 20) { A[k].n++; if (S.e[i].s > A[k].s) A[k].s = S.e[i].s; seen = true; break; } if (!seen && n < 12) { A[n].d = S.e[i].d; A[n].s = S.e[i].s; A[n].n = 1; n++; } } };
    acc(f.A, accA, nAccA); acc(f.B, accB, nAccB); capFrames++; if (capFrames % 5 == 0) mark();
    if (capFrames >= 40) { c6Max = 0; for (int k = 0; k < nAccA; k++) if (accA[k].n >= 24 && accA[k].s > c6Max) c6Max = accA[k].s; for (int k = 0; k < nAccB; k++) if (accB[k].n >= 24 && accB[k].s > c6Max) c6Max = accB[k].s; st = DONE; mark(); }
    return;
  }
  if (cur == C7 || cur == C8) {
    if (st != RUNNING) return;
    if (stillPhase) {
      if (f.hasHand && f.A.p >= 0 && f.B.p >= 0 && stillN < 120) { stillA[stillN] = f.A.e[f.A.p].d; stillB[stillN] = f.B.e[f.B.p].d; stillN++; if (stillN % 6 == 0) mark(); }
      if (now - phaseT > 5200) { stillDone = true; stillPhase = false; st = DONE; g.calTargetHole = 0; mark(); }
      return;
    }
    if (!qn) { st = DONE; mark(); return; }
    const Pair& p = queue[0]; const Hole& H = holes[p.hole - 1]; float depth = cur == C7 ? p.depth : (p.high ? 60 : 160);
    float dA, sA, dB, sB; bool a = pickNear(f.A, g.cfg.A, H, depth, dA, sA), b = pickNear(f.B, g.cfg.B, H, depth, dB, sB);
    if (cur == C7) { if (a) dA -= 0; }   // readings are to the ball surface; the browser adds the ball radius
    if (a && b && bufN < 14) { bufA[bufN] = dA; bufSA[bufN] = sA; bufB[bufN] = dB; bufSB[bufN] = sB; bufN++; readA = dA; readB = dB; haveRead = true; if (bufN % 3 == 0) mark(); }
    if (bufN >= 12) {
      Sample& S = samples[ns < 40 ? ns : 39]; if (ns < 40) ns++;
      S.hole = p.hole; S.depth = p.depth; S.high = p.high; S.hasA = S.hasB = true;
      float tA[14], tB[14]; memcpy(tA, bufA, sizeof tA); memcpy(tB, bufB, sizeof tB);
      S.spread = (spread(bufA, bufN) + spread(bufB, bufN)) / 2; S.dA = median(tA, bufN); S.dB = median(tB, bufN);
      float sa2[14], sb2[14]; memcpy(sa2, bufSA, sizeof sa2); memcpy(sb2, bufSB, sizeof sb2); S.sA = median(sa2, bufN); S.sB = median(sb2, bufN);
      Event e; e.type = Ev::Bg; char line[EVLEN]; snprintf(line, sizeof line, "{\"ev\":\"beep\",\"t\":%lu}", (unsigned long)now); g.events.push(line); (void)e;
      for (int i = 1; i < qn; i++) queue[i - 1] = queue[i]; qn--;
      nextWaiting();
    } else if (now - phaseT > 8000) { setPrompt(cur == C7 ? "No steady reading. Hold the ball still at the mark, then try again" : "No steady reading. Hold your hand still, then try again"); }
    return;
  }
}

void toJson(JsonObject o) {
  static const char* STEPS[] = { "", "c0", "identify", "c6", "c7", "c8" }; static const char* STS[] = { "idle", "running", "waiting", "done", "failed" };
  if (cur == NONE) { o["step"] = nullptr; o["state"] = "idle"; return; }
  o["step"] = STEPS[cur]; o["state"] = STS[st]; if (prompt[0] && st == WAITING) o["prompt"] = prompt;
  if (cur == C0) {
    o["n"] = 7; o["i"] = nChecks; JsonArray arr = o["checks"].to<JsonArray>();
    for (int i = 0; i < nChecks; i++) { JsonObject c = arr.add<JsonObject>(); c["id"] = checks[i].id; c["label"] = checks[i].label; if (checks[i].ok >= 0) c["ok"] = checks[i].ok == 1; else c["ok"] = nullptr; if (checks[i].code[0]) c["code"] = checks[i].code; else c["code"] = nullptr; c["detail"] = checks[i].detail; }
    if (st == DONE) { JsonObject r = o["result"].to<JsonObject>(); r["checks"] = arr; bool ok = true; for (int i = 0; i < nChecks; i++) if (checks[i].ok == 0) ok = false; r["ok"] = ok; }
  } else if (cur == IDENT) {
    o["n"] = 1; o["i"] = st == DONE ? 1 : 0;
    if (st == DONE) { JsonObject r = o["result"].to<JsonObject>(); bool swapped = identB && !identA; r["swapped"] = swapped; r["ok"] = identA && !identB; if (swapped) r["code"] = "W3"; else r["code"] = nullptr; }
  } else if (cur == C6) {
    o["n"] = 40; o["i"] = capFrames;
    if (st == DONE || st == FAILED) {
      JsonObject r = o["result"].to<JsonObject>(); JsonArray codes = r["codes"].to<JsonArray>();
      auto dump = [&](const char* k, decltype(accA)& A, int n) { JsonArray arr = r[k].to<JsonArray>(); for (int i = 0; i < n; i++) if (A[i].n >= 24) { JsonObject e = arr.add<JsonObject>(); e["d"] = (int)A[i].d; e["s"] = (int)A[i].s; e["n"] = A[i].n; } };
      dump("A", accA, nAccA); dump("B", accB, nAccB);
      bool strong = c6Max > 1200; if (!c6Ok) codes.add("F2"); if (strong) codes.add("B1"); else if (c6Max > 1000) codes.add("B2");
      r["ok"] = c6Ok && !strong; r["maxStrength"] = (int)c6Max;
    }
  } else {
    o["n"] = cur == C7 ? 32 : 33; o["i"] = ns;
    if (qn && !stillPhase) { o["hole"] = queue[0].hole; if (cur == C7) o["depth"] = queue[0].depth; else o["high"] = queue[0].high; }
    if (stillPhase) { o["phase"] = "still"; o["stillN"] = stillN; }
    if (haveRead) { JsonObject rd = o["reading"].to<JsonObject>(); JsonArray a = rd["A"].to<JsonArray>(); a.add((int)readA); a.add(0); JsonArray b = rd["B"].to<JsonArray>(); b.add((int)readB); b.add(0); rd["steady"] = bufN / 12.0f; }
    JsonArray arr = o["samples"].to<JsonArray>();
    for (int i = 0; i < ns; i++) { JsonObject s = arr.add<JsonObject>(); s["hole"] = samples[i].hole; if (cur == C7) s["depth"] = samples[i].depth; else s["high"] = samples[i].high; JsonArray a = s["A"].to<JsonArray>(); a.add(samples[i].dA); a.add(samples[i].sA); JsonArray b = s["B"].to<JsonArray>(); b.add(samples[i].dB); b.add(samples[i].sB); s["spread"] = samples[i].spread; }
    if (cur == C8 && (stillN || stillDone)) { JsonArray sa = o["still"].to<JsonArray>(); for (int i = 0; i < stillN; i++) { JsonObject s = sa.add<JsonObject>(); s["A"] = stillA[i]; s["B"] = stillB[i]; } }
    if (st == DONE) o["result"] = nullptr;   // the browser computes the fit from samples (RS.fit)
    o["skips"] = skips;
  }
}

} }  // namespace app::calib
