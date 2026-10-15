// sensing.cpp - core 1: measure A then B, associate, track, run the state machine, publish the frame.
#include "app.h"
#include "pins.h"
#include "echo_hold.h"
#include "defaults.h"
#include "bounded_writer.h"
#include <esp_task_wdt.h>

using namespace ring;
namespace app { namespace sensing {

static xm125::Sensor sA(Wire, PIN_A_SDA, PIN_A_SCL, PIN_A_RST, "A");
static xm125::Sensor sB(Wire1, PIN_B_SDA, PIN_B_SCL, PIN_B_RST, "B");
static xm125::Sensor sC(Wire1, PIN_C_SDA, PIN_C_SCL, PIN_C_RST, "C");
static EchoHold holdA(ECHO_HOLD_FRAMES), holdB(ECHO_HOLD_FRAMES), holdC(ECHO_HOLD_FRAMES);
static Tracker tracker; static bool hasPrev = false; static float prevX = 0, prevY = 0; static int miss = 0, jumps = 0; static float jumpX = 0, jumpY = 0; static uint32_t jumpT = 0;
static Echo bgA[8], bgB[8], bgC[8]; static int nBgA = 0, nBgB = 0, nBgC = 0;          // still objects learned by the stillness rule
static uint32_t lastA = 0, lastB = 0, lastC = 0; static float hzA = 0, hzB = 0, hzC = 0; static uint32_t frameN = 0, lastFusionT=0;
static uint32_t idleSince = 0; static bool relearnDone = false; static uint32_t lastSerial = 0, lastDiagSerial=0; static uint32_t lastRecal = 0;
static float spreadBuf[24]; static int spreadN = 0;

xm125::Sensor& sensor(char which) { return which == 'A' ? sA : (which == 'B' ? sB : sC); }
static xm125::Settings settingsFromCfg() {
  xm125::Settings s; const Tuning& t = g.cfg.tuning;
  s.startMm = t.rangeStart; s.endMm = t.rangeEnd;
  // XM125 register 0x004A is 0..1000 and higher means a LOWER detector threshold (more sensitive).
  float sens = 500.0f * t.threshSens; if (sens < 0) sens = 0; if (sens > 1000) sens = 1000;
  s.sensitivityX1000 = (uint32_t)lroundf(sens);
  return s;
}
static bool setupSensorImpl(xm125::Sensor& s, SensorInfo& inf) {
  s.lineLevels(inf.sda, inf.scl);
  Serial.printf("[%s] I2C lines idle: SDA %s, SCL %s%s\n", s.name(), inf.sda ? "high" : "LOW", inf.scl ? "high" : "LOW", (inf.sda && inf.scl) ? "" : "  <- the module's pull-ups are not holding them up: no 3V3/G on the module, or the wire is open or shorted (or its I2C pull-up jumper was cut)");
  inf.present = s.present(); inf.busErr = s.lastBusError();
  if (!inf.present) { Serial.printf("[%s] not found on the bus (I2C error %d: 2 = no ACK at 0x52, 5 = timeout)\n", s.name(), inf.busErr); return false; }
  inf.ver = s.version(); char v[16]; xm125::Sensor::versionString(inf.ver, v, sizeof v); Serial.printf("[%s] distance detector %s\n", s.name(), v);
  bool ok = s.configure(settingsFromCfg());
  if (!ok) { Serial.printf("[%s] configure failed (status 0x%08lx), resetting and trying once more\n", s.name(), (unsigned long)s.lastStatus()); s.hardReset(); esp_task_wdt_reset(); ok = s.present() && s.configure(settingsFromCfg()); }
  inf.cfgOk = ok; inf.status = s.lastStatus(); inf.stop = s.stopMode();
  Serial.printf("[%s] configure %s (status 0x%08lx)\n", s.name(), ok ? "OK" : "FAILED", (unsigned long)s.lastStatus());
  if (ok) {
    uint32_t rs=0, re=0, sens=0, sq=0, step=0;
    if (s.readReg(xm125::REG_START, rs) && s.readReg(xm125::REG_END, re) && s.readReg(xm125::REG_THRESHOLD_SENSITIVITY, sens) && s.readReg(xm125::REG_SIGNAL_QUALITY, sq) && s.readReg(xm125::REG_MAX_STEP_LENGTH, step))
      Serial.printf("[%s] detector cfg start=%lu end=%lu sensitivity=%lu signalQ=%lu maxStep=%lu(auto=0)\n", s.name(), (unsigned long)rs, (unsigned long)re, (unsigned long)sens, (unsigned long)sq, (unsigned long)step);
  }
  if (!ok) Serial.printf("[%s] hint: is this board flashed with i2c_distance_detector.bin (docs/05)? A board still on the presence firmware answers at 0x52 but fails here. Status 0x%08lx: bits 16-25 are error flags.\n", s.name(), (unsigned long)s.lastStatus());
  return ok;
}
// Works on a local record and publishes it in one copy, so core 0 never reads a half-filled one.
static bool setupSensor(xm125::Sensor& s) {
  SensorInfo& pub = s.name()[0] == 'A' ? g.infoA : (s.name()[0]=='B'?g.infoB:g.infoC);
  uint16_t priorSetups; { Lock lk; priorSetups = pub.setups; }
  SensorInfo inf; inf.setups = priorSetups + 1;
  bool ok = setupSensorImpl(s, inf); { Lock lk; pub = inf; } return ok;
}
void begin() {
  uint32_t hz = g.cfg.tuning.i2cKhz * 1000UL;
  sA.beginBus(hz); sB.beginBus(hz); sC.beginBus(hz);
  sA.hardReset(); sB.hardReset(); sC.hardReset();
  setupSensor(sA); setupSensor(sB); setupSensor(sC);
  g.checkFailing = !(sA.ok() && sB.ok() && sC.ok());
  idleSince = millis();
}
void setBusSpeed(uint32_t hz) { sA.setBusSpeed(hz); sB.setBusSpeed(hz); sC.setBusSpeed(hz); }
// The XM125 locks its configuration once applied, so a new range or sensitivity needs a module reset and a fresh apply.
void reconfigure() {
  setBusSpeed(g.cfg.tuning.i2cKhz * 1000UL); clearBg();
  Serial.println("[sensors] range/threshold changed: resetting and re-configuring (keep the sink empty for 3 s)");
  sA.hardReset(); esp_task_wdt_reset(); sB.hardReset(); esp_task_wdt_reset(); sC.hardReset(); esp_task_wdt_reset();
  setupSensor(sA); esp_task_wdt_reset(); setupSensor(sB); esp_task_wdt_reset(); setupSensor(sC);
  g.checkFailing = !(sA.ok() && sB.ok() && sC.ok()); nBgA = nBgB = nBgC = 0; hasPrev = false; tracker.reset(); idleSince = millis(); relearnDone = false;
}
bool sensorPresent(char w) { return sensor(w).present(); }
uint32_t sensorVersion(char w) { return sensor(w).version(); }
uint32_t sensorStatus(char w) { return sensor(w).status(); }
// Reset test (C0 / W4): reset one sensor and report which one restarted (its measure counter went back to 0).
bool resetTest(char which, char& restartedWhich) {
  xm125::Sensor* sensors[] = {&sA, &sB, &sC}; uint32_t before[3];
  // Establish non-zero counters so resetting a just-configured module is observable.
  for(int k=0;k<3;k++) { xm125::Result r; if(!sensors[k]->measure(r)) { restartedWhich='0'; return false; } before[k]=sensors[k]->measureCounter(); }
  sensor(which).hardReset(); int n=0; restartedWhich='0';
  for(int k=0;k<3;k++) if(sensors[k]->measureCounter()<before[k]) { n++; restartedWhich='A'+k; }
  if(n>1) restartedWhich='2'; setupSensor(sensor(which)); return restartedWhich==which;
}
bool recordBackground() { bool a=sA.calibrate(); esp_task_wdt_reset(); bool b=sB.calibrate(); esp_task_wdt_reset(); bool c=sC.calibrate(); nBgA=nBgB=nBgC=0; return a && b && c; }
void clearBg() { nBgA=nBgB=nBgC=0; holdA.reset(); holdB.reset(); holdC.reset(); }

float stillSpread() { if (spreadN < 4) return -1; float m = 0; for (int i = 0; i < (spreadN < 24 ? spreadN : 24); i++) m += spreadBuf[i]; m /= (spreadN < 24 ? spreadN : 24); float v = 0; for (int i = 0; i < (spreadN < 24 ? spreadN : 24); i++) v += (spreadBuf[i] - m) * (spreadBuf[i] - m); return sqrtf(v / ((spreadN < 24 ? spreadN : 24) - 1)); }

static void readSensor(xm125::Sensor& s, SensorFrame& out, uint32_t& lastT, float& hz) {
  xm125::Result r; out.n = 0; out.p = -1; out.alive = false; out.topStr = 0;
  uint32_t t0 = millis();
  if (s.measure(r)) {
    out.alive = true; out.calNeeded = r.calNeeded;
    for (uint8_t i = 0; i < r.n && out.n < 10; i++) { float str = xm125::Sensor::strengthLinear(r.strengthDb1000[i]); out.e[out.n].d = (float)r.distMm[i]; out.e[out.n].s = str; if (str > out.topStr) out.topStr = str; out.n++; }
    if (lastT) { float inst = 1000.0f / (float)(t0 - lastT + 1); hz = hz ? 0.9f * hz + 0.1f * inst : inst; }
    lastT = t0;
  } else { hz *= 0.8f; }
  out.er = s.errors(); out.hz = hz;
}
static void addBg(Echo* list, int& n, float d, float s) { for (int i = 0; i < n; i++) if (fabsf(list[i].d - d) <= 25) { if (s > list[i].s) list[i].s = s; return; } if (n < 8) { list[n].d = d; list[n].s = s; n++; } }
static void onEvent(const Event& e, void*) {
  char line[EVLEN]; proto::eventJson(e, line, sizeof line); g.events.push(line);
  if (e.type == Ev::Still) { // learn the still object as background for the association
    float dA = range(g.cfg.A, e.x, e.y, g.cfg.hand.zwork) + g.cfg.A.off, dB = range(g.cfg.B, e.x, e.y, g.cfg.hand.zwork) + g.cfg.B.off;
    addBg(bgA, nBgA, dA, 2500); addBg(bgB, nBgB, dB, 2500); addBg(bgC, nBgC, range(g.cfg.C,e.x,e.y,g.cfg.hand.zwork)+g.cfg.C.off,2500);
  }
  if (e.type == Ev::Session && e.a && strcmp(e.a, "end") == 0) { g.totals = g.sm->totals(); g.totalsDirty = true; }
  if (g.cfg.tuning.log) Serial.println(line);
}

void step() {
  if (g.pauseSensing) { delay(5); return; }
  struct BusyGuard { BusyGuard() { g.sensingBusy=true; } ~BusyGuard() { g.sensingBusy=false; } } busy;
  if(g.pauseSensing) return;
  if (g.sensorsReconfig) { g.sensorsReconfig = false; reconfigure(); return; }
  Frame f; f.t = millis(); f.n = ++frameN;
  readSensor(sA, f.A, lastA, hzA); readSensor(sB, f.B, lastB, hzB); readSensor(sC, f.C, lastC, hzC);
  Lock lk;
  static bool hooked = false; if (!hooked) { g.sm->onEvent(onEvent, nullptr); hooked = true; }
  const Config& c = g.cfg; tracker.setAlpha(c.tuning.smooth);
  // Kinematic gate: with a live track the association compares candidates against where the track should be now,
  // not where it was last frame, so a hand in motion is followed and a bounce that moves the wrong way is rejected.
  float gateX = prevX, gateY = prevY; if (hasPrev && tracker.has()) tracker.predict(f.t, gateX, gateY);
  AssocOpts o{ &c.A, &c.B, &c.hand, &c.plane, bgA, nBgA, bgB, nBgB, hasPrev, gateX, gateY, 220, c.masks, c.nMasks, c.tuning.nearWin, &c.C, bgC, nBgC };
  int nEA = 0, nEB = 0, nEC = 0; bool heldA = false, heldB = false, heldC = false;
  const Echo* eA = holdA.update(f.A.e, f.A.n, f.A.alive, nEA, heldA); const Echo* eB = holdB.update(f.B.e, f.B.n, f.B.alive, nEB, heldB);
  const Echo* eC = holdC.update(f.C.e, f.C.n, f.C.alive, nEC, heldC);
  Assoc a = (f.A.alive && f.B.alive && f.C.alive) ? associate3(eA, nEA, eB, nEB, eC, nEC, o) : Assoc{ FLAG_NO_HAND, 0, 0, 0, 0, 0, -1, -1 };
  if ((heldA&&heldB&&heldC)||(!hasPrev&&(heldA||heldB||heldC))) a.flag=FLAG_NO_HAND;
  if (heldA) a.iA = -1; if (heldB) a.iB = -1; if (heldC) a.iC = -1;   // a held echo has no index in this frame's list
  bool hasPos = false; float x = 0, y = 0, speed = 0;
  if (a.flag == FLAG_NONE) { miss = 0; jumps = 0; tracker.update(a.x, a.y, f.t, x, y, speed); hasPos = true; hasPrev = true; prevX = a.ux; prevY = a.uy; f.A.p = a.iA; f.B.p = a.iB; f.C.p = a.iC; }   // prev is the raw fix: a clamped one would pin the track to the edge
  else if (a.flag == FLAG_JUMP) {
    // One jump is a bounce or a body; two jumps in a row to the same place is the hand really having moved. The second
    // must land within 60 mm of the first, or it is treated as a new first jump. Speed is the measured displacement.
    bool agrees = jumps > 0 && hypotf(a.ux - jumpX, a.uy - jumpY) <= 60;
    if (agrees) { jumps = 0; float dt = (f.t - jumpT) / 1000.0f; if (dt < 0.02f) dt = 0.02f; float sp = hypotf(a.ux - jumpX, a.uy - jumpY) / dt; tracker.reset(); tracker.update(a.x, a.y, f.t, x, y, speed); speed = sp > 1500 ? 1500 : sp; hasPos = true; hasPrev = true; prevX = a.ux; prevY = a.uy; a.flag = FLAG_NONE; f.A.p = a.iA; f.B.p = a.iB; f.C.p = a.iC; }
    else { jumps = 1; jumpX = a.ux; jumpY = a.uy; jumpT = f.t; if (hasPrev) { x = gateX; y = gateY; hasPos = true; speed = hypotf(tracker.vx(), tracker.vy()); } }
  } else { jumps = 0; if (++miss >= c.tuning.goneFrames) { tracker.reset(); hasPrev = false; } }
  // The association is plane-gated, but the alpha-beta predictor can overshoot a boundary between updates.
  // Never publish or actuate from a filter artefact outside the configured sink. Drop that frame and reset the
  // predictor so the next valid in-plane measurement re-acquires cleanly instead of sticking to an edge.
  if (hasPos && (x < 0 || x > c.plane.w || y < 0 || y > c.plane.d)) {
    hasPos = false; a.flag = FLAG_OUTSIDE; tracker.reset(); hasPrev = false; miss = 0; jumps = 0;
  }
  if (hasPos) { spreadBuf[spreadN % 24] = x; spreadN++; } else spreadN = 0;
  Input in{ f.t, hasPos, x, y, speed, a.flag };
  bool wasSession = g.sm->session();
  Snapshot s = g.sm->step(in);
  if (!wasSession && g.sm->session() && !hasPos) g.health.trigNoHand++;
  f.st = s.st; f.fn = s.fn; if (s.zone) strncpy(f.zn, s.zone->id, sizeof f.zn - 1); f.hasHand = hasPos; f.hx = x; f.hy = y; f.spd = speed; f.set = s.settle; f.ex = s.exitRem; f.dsp = s.dispSec; f.cup = s.cupMl; f.still = s.still; f.cln = s.cleanSec; f.lk = s.lk; f.flag = s.flag; f.lat = s.lat;
  // Idle re-learn of the recorded threshold is allowed only when ALL THREE sensors report a truly empty scene.
  // FLAG_NO_HAND is not enough: it also means "echoes existed but could not be fused". Re-recording in that state
  // can teach an untracked real hand into the XM125's recorded threshold and make it disappear.
  bool quiet = s.st == IDLE && !g.sm->session() && f.A.alive && f.B.alive && f.C.alive && f.A.n == 0 && f.B.n == 0 && f.C.n == 0;
  if (!quiet) { idleSince = f.t; relearnDone = false; }
  if (quiet && !relearnDone && f.t - idleSince > c.tuning.bgRelearnIdleMs && f.t - lastRecal > 60000) { relearnDone = true; lastRecal = f.t; Serial.println("[bg] idle 30 s: re-recording the empty-sink threshold"); sA.calibrate(); esp_task_wdt_reset(); sB.calibrate(); esp_task_wdt_reset(); sC.calibrate(); nBgA = nBgB = nBgC = 0; }
  else if (quiet && (f.A.calNeeded || f.B.calNeeded || f.C.calNeeded) && f.t - lastRecal > 20000) { lastRecal = f.t; if (f.A.calNeeded) sA.recalibrate(); if (f.B.calNeeded) sB.recalibrate(); if (f.C.calNeeded) sC.recalibrate(); }
  g.checkFailing = !(f.A.alive && f.B.alive && f.C.alive);
  g.frame = f;
  // Bench diagnostic view: keep a low-rate raw/fusion trace on USB even while Ring Studio is connected.
  // This is intentionally ~5 Hz so diagnostics do not recreate the WebSocket backpressure problem.
  if (g.clients > 0 && f.t - lastDiagSerial >= 200) {
    lastDiagSerial = f.t; char line[512]; BoundedWriter w(line, sizeof line);
    w.append("[diag] A%d", f.A.n);
    for (int i = 0; i < f.A.n && i < 3 && !w.truncated(); i++) w.append("%s%.0f/%.0f", i ? "," : " ", f.A.e[i].d, f.A.e[i].s);
    w.append(" B%d", f.B.n);
    for (int i = 0; i < f.B.n && i < 3 && !w.truncated(); i++) w.append("%s%.0f/%.0f", i ? "," : " ", f.B.e[i].d, f.B.e[i].s);
    w.append(" C%d",f.C.n); for(int i=0;i<f.C.n&&i<3;i++) w.append(" %.0f/%.0f",f.C.e[i].d,f.C.e[i].s);
    w.append(" pick=%d/%d/%d%s%s%s assoc=%u", a.iA, a.iB, a.iC, heldA ? " holdA" : "", heldB ? " holdB" : "", heldC ? " holdC" : "", (unsigned)a.flag);
    if (a.flag != FLAG_NO_HAND) w.append(" raw=%.0f,%.0f r=%.1f u=%.1f", a.ux, a.uy, a.res, a.uncertainty);
    if (f.hasHand) w.append(" track=%.0f,%.0f spd=%.0f", f.hx, f.hy, f.spd);
    else w.append(" track=none");
    Serial.println(line);
  }
  // Phase 0 view: with no Ring Studio connected, print the echo lists on USB serial
  if (g.clients == 0 && f.t - lastSerial >= 45) {
    lastSerial = f.t; char line[640]; BoundedWriter w(line, sizeof line);
    for (int k = 0; k < 3; k++) {
      const SensorFrame& S = k==0?f.A:(k==1?f.B:f.C); w.append("%s: %s%d echo%s ", k==0?"A":(k==1?"B":"C"), S.alive ? "" : "(no answer) ", S.n, S.n == 1 ? " " : "s");
      for (int i = 0; i < S.n && i < 3 && !w.truncated(); i++) w.append("%s%4.0f mm (str %.0f)", i ? ", " : "", S.e[i].d, S.e[i].s);
      w.append("   ");
    }
    w.append("%.1f Hz  %s", (f.A.hz+f.B.hz+f.C.hz)/3, stateName(f.st));
    if (f.hasHand) w.append("  hand x %.0f y %.0f", f.hx, f.hy);
    Serial.println(line);
  }
}

} }  // namespace app::sensing
