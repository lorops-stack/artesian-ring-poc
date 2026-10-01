// sensing.cpp - core 1: measure A then B, associate, track, run the state machine, publish the frame.
#include "app.h"
#include "pins.h"
#include "defaults.h"
#include <esp_task_wdt.h>

using namespace ring;
namespace app { namespace sensing {

static xm125::Sensor sA(Wire, PIN_A_SDA, PIN_A_SCL, PIN_A_RST, "A");
static xm125::Sensor sB(Wire1, PIN_B_SDA, PIN_B_SCL, PIN_B_RST, "B");
static Tracker tracker; static bool hasPrev = false; static float prevX = 0, prevY = 0; static int miss = 0, jumps = 0;
static Echo bgA[8], bgB[8]; static int nBgA = 0, nBgB = 0;          // still objects learned by the stillness rule
static uint32_t lastA = 0, lastB = 0; static float hzA = 0, hzB = 0; static uint32_t frameN = 0;
static uint32_t idleSince = 0; static bool relearnDone = false; static uint32_t lastSerial = 0; static uint32_t lastRecal = 0;
static float spreadBuf[24]; static int spreadN = 0;

xm125::Sensor& sensor(char which) { return which == 'A' ? sA : sB; }
static xm125::Settings settingsFromCfg() {
  xm125::Settings s; const Tuning& t = g.cfg.tuning; s.startMm = t.rangeStart; s.endMm = t.rangeEnd; s.sensitivityX1000 = (uint32_t)(500 * t.threshSens); return s;
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
  if (!ok) Serial.printf("[%s] hint: is this board flashed with i2c_distance_detector.bin (docs/05)? A board still on the presence firmware answers at 0x52 but fails here. Status 0x%08lx: bits 16-25 are error flags.\n", s.name(), (unsigned long)s.lastStatus());
  return ok;
}
// Works on a local record and publishes it in one copy, so core 0 never reads a half-filled one.
static bool setupSensor(xm125::Sensor& s) {
  SensorInfo& pub = s.name()[0] == 'A' ? g.infoA : g.infoB;
  SensorInfo inf; inf.setups = pub.setups + 1;
  bool ok = setupSensorImpl(s, inf); pub = inf; return ok;
}
void begin() {
  uint32_t hz = g.cfg.tuning.i2cKhz * 1000UL;
  sA.beginBus(hz); sB.beginBus(hz);
  sA.hardReset(); sB.hardReset();
  setupSensor(sA); setupSensor(sB);
  g.checkFailing = !(sA.ok() && sB.ok());
  idleSince = millis();
}
void setBusSpeed(uint32_t hz) { sA.setBusSpeed(hz); sB.setBusSpeed(hz); }
// The XM125 locks its configuration once applied, so a new range or sensitivity needs a module reset and a fresh apply.
void reconfigure() {
  Serial.println("[sensors] range/threshold changed: resetting and re-configuring (keep the sink empty for 3 s)");
  sA.hardReset(); esp_task_wdt_reset(); sB.hardReset(); esp_task_wdt_reset();
  setupSensor(sA); esp_task_wdt_reset(); setupSensor(sB);
  g.checkFailing = !(sA.ok() && sB.ok()); nBgA = nBgB = 0; hasPrev = false; tracker.reset(); idleSince = millis(); relearnDone = false;
}
bool sensorPresent(char w) { return sensor(w).present(); }
uint32_t sensorVersion(char w) { return sensor(w).version(); }
uint32_t sensorStatus(char w) { return sensor(w).status(); }
// Reset test (C0 / W4): reset one sensor and report which one restarted (its measure counter went back to 0).
bool resetTest(char which, char& restartedWhich) {
  uint32_t cA = sA.measureCounter(), cB = sB.measureCounter();
  sensor(which).hardReset();
  uint32_t nA = sA.measureCounter(), nB = sB.measureCounter();
  bool aRestarted = nA < cA, bRestarted = nB < cB;
  restartedWhich = aRestarted && !bRestarted ? 'A' : (bRestarted && !aRestarted ? 'B' : (aRestarted && bRestarted ? '2' : '0'));
  setupSensor(sensor(which));
  return restartedWhich == which;
}
bool recordBackground() { bool a = sA.calibrate(), b = sB.calibrate(); nBgA = nBgB = 0; return a && b; }
void clearBg() { nBgA = nBgB = 0; }
float stillSpread() { if (spreadN < 4) return -1; float m = 0; for (int i = 0; i < spreadN; i++) m += spreadBuf[i]; m /= spreadN; float v = 0; for (int i = 0; i < spreadN; i++) v += (spreadBuf[i] - m) * (spreadBuf[i] - m); return sqrtf(v / (spreadN - 1)); }

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
    addBg(bgA, nBgA, dA, 2500); addBg(bgB, nBgB, dB, 2500);
  }
  if (e.type == Ev::Session && e.a && strcmp(e.a, "end") == 0) { g.totals = g.sm->totals(); g.totalsDirty = true; }
  if (g.cfg.tuning.log) Serial.println(line);
}

void step() {
  if (g.pauseSensing) { delay(5); return; }
  if (g.sensorsReconfig) { g.sensorsReconfig = false; reconfigure(); return; }
  Frame f; f.t = millis(); f.n = ++frameN;
  g.sensingBusy = true; readSensor(sA, f.A, lastA, hzA); readSensor(sB, f.B, lastB, hzB); g.sensingBusy = false;
  Lock lk;
  static bool hooked = false; if (!hooked) { g.sm->onEvent(onEvent, nullptr); hooked = true; }
  const Config& c = g.cfg;
  AssocOpts o{ &c.A, &c.B, &c.hand, &c.plane, bgA, nBgA, bgB, nBgB, hasPrev, prevX, prevY, 220, c.masks, c.nMasks };
  Assoc a = (f.A.alive && f.B.alive) ? associate(f.A.e, f.A.n, f.B.e, f.B.n, o) : Assoc{ FLAG_NO_HAND, 0, 0, 0, 0, 0, -1, -1 };
  bool hasPos = false; float x = 0, y = 0, speed = 0;
  if (a.flag == FLAG_NONE) { miss = 0; jumps = 0; tracker.update(a.x, a.y, f.t, x, y, speed); hasPos = true; hasPrev = true; prevX = a.x; prevY = a.y; f.A.p = a.iA; f.B.p = a.iB; }
  else if (a.flag == FLAG_JUMP) {
    if (++jumps >= 2) { jumps = 0; tracker.reset(); tracker.update(a.x, a.y, f.t, x, y, speed); speed = 400; hasPos = true; hasPrev = true; prevX = a.x; prevY = a.y; a.flag = FLAG_NONE; f.A.p = a.iA; f.B.p = a.iB; }
    else if (hasPrev) { x = prevX; y = prevY; hasPos = true; speed = hypotf(tracker.vx(), tracker.vy()); }
  } else { if (++miss >= c.tuning.goneFrames) { tracker.reset(); hasPrev = false; } }
  if (hasPos) { spreadBuf[spreadN % 24] = x; spreadN++; } else spreadN = 0;
  Input in{ f.t, hasPos, x, y, speed, a.flag };
  bool wasSession = g.sm->session();
  Snapshot s = g.sm->step(in);
  if (!wasSession && g.sm->session() && !hasPos) g.health.trigNoHand++;
  f.st = s.st; f.fn = s.fn; if (s.zone) strncpy(f.zn, s.zone->id, sizeof f.zn - 1); f.hasHand = hasPos; f.hx = x; f.hy = y; f.spd = speed; f.set = s.settle; f.ex = s.exitRem; f.dsp = s.dispSec; f.cup = s.cupMl; f.still = s.still; f.cln = s.cleanSec; f.lk = s.lk; f.flag = s.flag; f.lat = s.lat;
  // Idle re-learn of the recorded threshold (spec 4.4): IDLE, no session, nothing in the hand window for 30 s
  bool quiet = s.st == IDLE && !g.sm->session() && a.flag == FLAG_NO_HAND;
  if (!quiet) { idleSince = f.t; relearnDone = false; }
  if (quiet && !relearnDone && f.t - idleSince > c.tuning.bgRelearnIdleMs && f.t - lastRecal > 60000) { relearnDone = true; lastRecal = f.t; Serial.println("[bg] idle 30 s: re-recording the empty-sink threshold"); sA.calibrate(); esp_task_wdt_reset(); sB.calibrate(); nBgA = nBgB = 0; }
  else if (quiet && (f.A.calNeeded || f.B.calNeeded) && f.t - lastRecal > 20000) { lastRecal = f.t; if (f.A.calNeeded) sA.recalibrate(); if (f.B.calNeeded) sB.recalibrate(); }
  g.checkFailing = !(f.A.alive && f.B.alive);
  g.frame = f;
  // Phase 0 view: with no Ring Studio connected, print the echo lists on USB serial
  if (g.clients == 0 && f.t - lastSerial >= 45) {
    lastSerial = f.t; char line[256]; int p = 0;
    for (int k = 0; k < 2; k++) {
      const SensorFrame& S = k ? f.B : f.A; p += snprintf(line + p, sizeof line - p, "%s: %s%d echo%s ", k ? "B" : "A", S.alive ? "" : "(no answer) ", S.n, S.n == 1 ? " " : "s");
      for (int i = 0; i < S.n && i < 3 && p < (int)sizeof line - 40; i++) p += snprintf(line + p, sizeof line - p, "%s%4.0f mm (str %.0f)", i ? ", " : "", S.e[i].d, S.e[i].s);
      p += snprintf(line + p, sizeof line - p, "   ");
    }
    snprintf(line + p, sizeof line - p, "%.1f Hz  %s%s", (f.A.hz + f.B.hz) / 2, stateName(f.st), f.hasHand ? "" : "");
    if (f.hasHand) { char pos[48]; snprintf(pos, sizeof pos, "  hand x %.0f y %.0f", f.hx, f.hy); strncat(line, pos, sizeof line - strlen(line) - 1); }
    Serial.println(line);
  }
}

} }  // namespace app::sensing
