// button.cpp - the onboard BOOT button, read only while running (spec 6: short = clean, 3-8 s = calibration,
// 10 s = reset the Wi-Fi password and PIN). Holding it at power-up enters the chip's download mode instead.
#include "app.h"
#include "pins.h"

namespace app { namespace button {

static uint32_t downAt = 0; static bool wasDown = false, resetDone = false; static uint32_t armedAt = 0;

void begin() { pinMode(PIN_CAL_BUTTON, INPUT_PULLUP); armedAt = millis() + 3000; }   // ignore the first 3 s (a press that started before boot)
void loop() {
  uint32_t now = millis(); if (now < armedAt) return;
  bool down = digitalRead(PIN_CAL_BUTTON) == LOW;
  if (down && !wasDown) { downAt = now; resetDone = false; }
  if (down) {
    uint32_t held = now - downAt;
    g.buttonPhase = held >= 10000 ? 3 : held >= 3000 ? 2 : 1;
    if (held >= 10000 && !resetDone) {
      resetDone = true; g.wifiPass[0] = 0; g.pin[0] = 0; g.setupNeeded = true; storage::saveSecrets();
      Serial.println("[button] Wi-Fi password and PIN reset. Restarting in 2 s with a temporary password."); g.events.push("{\"ev\":\"button\",\"a\":\"reset\"}");
      delay(1500); g.reboot = true;
    }
  } else if (wasDown) {
    uint32_t held = now - downAt; g.buttonPhase = 0;
    if (held < 1000) { Lock lk; if (g.sm->state() == ring::CLEAN) g.sm->endClean(); else g.sm->startClean("button"); g.events.push("{\"ev\":\"button\",\"a\":\"short\"}"); }
    else if (held >= 3000 && held < 8000) { g.events.push("{\"ev\":\"button\",\"a\":\"cal\"}"); Serial.println("[button] calibration requested: open Ring Studio > Calibrate"); }
  }
  wasDown = down;
}

} }  // namespace app::button
