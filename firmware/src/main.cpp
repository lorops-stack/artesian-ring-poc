// main.cpp - Artesian Ring PoC firmware. Core 1 (the Arduino loop): sensing, fusion and the state machine.
// Core 0 (ringTask): Wi-Fi, Ring Studio, LEDs, the button, storage. See docs/01-design-spec.md section 6.
#include "app.h"
#include "pins.h"
#include "defaults.h"
#include <esp_task_wdt.h>

namespace app { State g; }
using namespace app;

static void ringTask(void*) {
  esp_task_wdt_add(nullptr);
  for (;;) {
    net::loop(); leds::loop(); button::loop(); storage::loop(); calib::step();
    if (g.reboot) { Serial.println("[sys] restarting"); delay(200); ESP.restart(); }
    esp_task_wdt_reset(); delay(4);
  }
}

void setup() {
  Serial.begin(921600); delay(300);
  Serial.printf("\n[ring] Artesian Ring PoC firmware %s · protocol %d · %s\n", RING_FW_VERSION, RING_PROTO, __DATE__);
  g.lock = xSemaphoreCreateMutex();
  storage::begin(); storage::loadConfig();
  static ring::StateMachine sm(&g.cfg); g.sm = &sm; g.sm->totals() = g.totals;
  leds::begin();
  sensing::begin();
  calib::begin(); button::begin();
  net::begin();
  esp_task_wdt_init(8, true); esp_task_wdt_add(nullptr);
  xTaskCreatePinnedToCore(ringTask, "ring0", 12288, nullptr, 1, nullptr, 0);
  Serial.println("[ring] running. Echo lists print here until Ring Studio connects.");
}

void loop() { sensing::step(); esp_task_wdt_reset(); }
