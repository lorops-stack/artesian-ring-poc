// leds.cpp - the WS2812 ring (spec 4.2 patterns, LED tests, calibration guidance) and the onboard status LED.
#include "app.h"
#include "pins.h"
#include <Adafruit_NeoPixel.h>

using namespace ring;
namespace app { namespace leds {

static Adafruit_NeoPixel* ring_ = nullptr; static Adafruit_NeoPixel status_(1, PIN_STATUS_RGB, NEO_GRB + NEO_KHZ800);
static uint16_t count_ = 0; static char order_[5] = ""; static uint32_t lastT = 0; static uint8_t sr = 0, sg = 60, sb = 0; static bool haveClient = false;

static neoPixelType orderType(const char* o) {
  if (!strcmp(o, "RGB")) return NEO_RGB + NEO_KHZ800; if (!strcmp(o, "BRG")) return NEO_BRG + NEO_KHZ800; if (!strcmp(o, "BGR")) return NEO_BGR + NEO_KHZ800;
  if (!strcmp(o, "RBG")) return NEO_RBG + NEO_KHZ800; if (!strcmp(o, "GBR")) return NEO_GBR + NEO_KHZ800; return NEO_GRB + NEO_KHZ800;
}
static void ensureRing() {
  const Tuning& t = g.cfg.tuning;
  if (ring_ && count_ == t.ledCount && !strcmp(order_, t.ledOrder)) return;
  if (ring_) { ring_->clear(); ring_->show(); delete ring_; }
  ring_ = new Adafruit_NeoPixel(t.ledCount, PIN_LED_RING_DATA, orderType(t.ledOrder)); ring_->begin(); ring_->clear(); ring_->show();
  count_ = t.ledCount; strncpy(order_, t.ledOrder, sizeof order_ - 1);
}
void begin() { pinMode(PIN_LED_RING_DATA, OUTPUT); digitalWrite(PIN_LED_RING_DATA, LOW); status_.begin(); status_.setBrightness(40); setStatus(0, 60, 0); ensureRing(); }
void setStatus(uint8_t r, uint8_t gg, uint8_t b) { sr = r; sg = gg; sb = b; status_.setPixelColor(0, status_.Color(r, gg, b)); status_.show(); }

struct Col { uint8_t r, g, b; };
static Col fnColor(Fn f) {
  switch (f) { case Fn::Soap: return { 0xB6, 0x9C, 0xFF }; case Fn::Disposal: return { 0xF2, 0xB4, 0x4B }; case Fn::Cup: return { 0x4F, 0xD1, 0xE8 }; case Fn::Waterfall: return { 0x3F, 0xC7, 0xA6 }; case Fn::Hot: return { 0xFF, 0x6B, 0x4A }; case Fn::Warm: return { 0xFF, 0xB2, 0x7A }; case Fn::Cold: return { 0x6F, 0xB6, 0xFF }; case Fn::Neutral: return { 0xAE, 0xB7, 0xC2 }; default: return { 0x8F, 0xE3, 0xF2 }; }
}
static Col mix(Col a, Col b, float t) { return { (uint8_t)(a.r + (b.r - a.r) * t), (uint8_t)(a.g + (b.g - a.g) * t), (uint8_t)(a.b + (b.b - a.b) * t) }; }
static void setPix(int i, Col c, float bright, float cap) { float k = bright * cap; ring_->setPixelColor(i, ring_->Color((uint8_t)(c.r * k), (uint8_t)(c.g * k), (uint8_t)(c.b * k))); }

void loop() {
  uint32_t now = millis(); if (now - lastT < 30) return; lastT = now; float time = now / 1000.0f;
  ensureRing(); const Tuning& t = g.cfg.tuning; float cap = t.ledBright / 255.0f; int n = count_, off = t.ledOffset % (n ? n : 1);
  Frame f; { Lock lk; f = g.frame; }
  Zone zonesCopy[MAX_ZONES]; int nz = 0; { Lock lk; nz = g.sm->nZones(); memcpy(zonesCopy, g.sm->zones(), sizeof(Zone) * nz); }
  // LED tests from C0 (and Settings)
  if (g.ledTest) {
    for (int i = 0; i < n; i++) {
      if (g.ledTest == 1) setPix(i, { 255, 255, 255 }, 0.35f, cap);
      else if (g.ledTest == 2) { int ph = ((int)(time * 0.7f)) % 3; setPix(i, ph == 0 ? Col{ 255, 0, 0 } : ph == 1 ? Col{ 0, 255, 0 } : Col{ 0, 0, 255 }, 0.5f, cap); }
      else setPix(i, i < g.ledTestN ? Col{ 255, 255, 255 } : Col{ 0, 0, 0 }, i < g.ledTestN && ((int)(time * 4) % 2 || i % 10 != 9) ? 0.3f : 0.0f, cap);
    }
    ring_->show();
  } else {
    bool active = f.fn != Fn::None && (f.st == ACTIVE || f.st == CUP_FULL); Col col = active ? fnColor(f.fn) : fnColor(Fn::None);
    const Zone* hov = nullptr; for (int i = 0; i < nz; i++) if (!strcmp(zonesCopy[i].id, f.zn)) hov = &zonesCopy[i];
    bool blocked = !hov || hov->fn == Fn::Neutral || (hov->fn == Fn::Soap && (f.lk & 1)) || (hov->fn == Fn::Disposal && ((f.lk & 2) || f.dsp > 0));
    if (!active && hov && !blocked && f.hasHand) col = fnColor(hov->fn);
    for (int i = 0; i < n; i++) {
      float uu = (float)((i - off + n) % n) / n, d = fminf(uu, 1 - uu) * 2, b;
      if (f.st == CLEAN) { b = 0.35f + 0.35f * sinf(time * 1.2f); col = { 0xE8, 0xEE, 0xF4 }; }
      else if (active) b = 0.72f + 0.28f * sinf(uu * 60 - time * 5);
      else if (f.st == EXIT_PENDING) { b = d <= f.ex ? 0.85f : 0.06f; col = f.fn != Fn::None ? fnColor(f.fn) : col; }
      else if (f.hasHand && !blocked && f.set > 0) b = d <= f.set ? 0.95f : 0.1f;
      else if (f.dsp > 0) { col = fnColor(Fn::Disposal); float c = 0.12f * (1 + sinf(time * 3)); b = 0.08f + 0.85f * expf(-powf((d - c) * 6, 2)); }
      else if (g.calTargetHole) { // C8 guidance: light the ring segment nearest the target hole
        Hole hs[16]; templateHoles(g.cfg.plane, hs); const Hole& H = hs[(g.calTargetHole - 1) % 16]; float ang = atan2f(H.y - g.cfg.plane.d / 2, H.x - g.cfg.plane.w / 2); float u2 = fmodf((ang + M_PI / 2) / (2 * M_PI) + 1.0f, 1.0f); float dd = fabsf(uu - u2); dd = fminf(dd, 1 - dd); b = 0.08f + 0.9f * expf(-dd * dd * 400); col = fnColor(Fn::Cup);
      }
      else { float cp = fmodf(time * 0.09f, 1.0f), dd = fabsf(uu - cp); dd = fminf(dd, 1 - dd); b = 0.07f + 0.75f * expf(-dd * dd * 900) + 0.03f * sinf(time * 1.5f); }
      if (b < 0) b = 0; if (b > 1) b = 1;
      setPix(i, mix(col, { 255, 255, 255 }, 0.3f * b), b, cap);
    }
    ring_->show();
  }
  // status LED: button phases win, then red when a check fails, blue with a client, green otherwise
  if (g.buttonPhase == 1) setStatus(255, 120, 0); else if (g.buttonPhase == 2) setStatus(140, 0, 200); else if (g.buttonPhase == 3) { setStatus(((int)(time * 6) % 2) ? 255 : 0, ((int)(time * 6) % 2) ? 255 : 0, ((int)(time * 6) % 2) ? 255 : 0); }
  else if (g.checkFailing) setStatus(200, 0, 0); else if (g.clients > 0) { if (!haveClient) { haveClient = true; } setStatus(0, 40, 200); } else { haveClient = false; setStatus(0, 60, 0); }
}

} }  // namespace app::leds
