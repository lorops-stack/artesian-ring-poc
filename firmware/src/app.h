// app.h - shared application state between the sensing core (1) and the Wi-Fi/LED core (0).
#pragma once
#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <ArduinoJson.h>
#include "config.h"
#include "state_machine.h"
#include "geometry.h"
#include "xm125.h"

#define RING_FW_VERSION "0.1.0"
#define RING_PROTO 1

namespace app {

struct SensorFrame { ring::Echo e[10]; uint8_t n = 0; int8_t p = -1; float hz = 0; uint32_t er = 0; bool alive = false; bool calNeeded = false; float topStr = 0; };
struct Frame {
  uint32_t t = 0, n = 0; ring::State st = ring::IDLE; ring::Fn fn = ring::Fn::None; char zn[28] = ""; bool hasHand = false;
  float hx = 0, hy = 0, spd = 0, set = 0, ex = 0, dsp = 0, cup = 0, still = 0, cln = 0; uint8_t lk = 0, flag = 1; int lat = -1;
  SensorFrame A, B;
};
// Events cross from core 1 to core 0 through a small ring buffer of pre-rendered JSON lines.
constexpr int EVQ = 32, EVLEN = 160;
struct EventQueue { char buf[EVQ][EVLEN]; volatile int head = 0, tail = 0; void push(const char* s); bool pop(char* out); };

struct Health {
  float bgDrift = 0; uint32_t ghosts = 0, front = 0, trigNoHand = 0; const char* rst = "UNKNOWN"; float temp = 0;
};

struct State {
  ring::Config cfg;
  ring::StateMachine* sm = nullptr;
  SemaphoreHandle_t lock = nullptr;
  Frame frame;                 // latest, written by core 1
  EventQueue events;
  Health health;
  ring::Totals totals;         // persisted
  bool setupNeeded = true;     // no Wi-Fi password / PIN yet
  char wifiPass[64] = "";
  char pin[9] = "";
  char tempPass[12] = "";
  bool cfgDirty = false; uint32_t cfgDirtyAt = 0;
  bool totalsDirty = false;
  volatile int clients = 0;
  volatile bool restartWifi = false, reboot = false;
  volatile bool checkFailing = false;
  volatile bool pauseSensing = false;                     // set while a calibration step talks to the sensors itself
  volatile bool sensingBusy = false;                      // true while core 1 is inside a measurement
  // LED tests and button-driven status
  volatile int ledTest = 0; volatile int ledTestN = 0;    // 0 none, 1 white, 2 rgb, 3 count
  volatile int buttonPhase = 0;                           // 0 none, 1 held <3 s, 2 held 3-8 s, 3 reset done
  uint32_t calTargetHole = 0;                             // C8 guidance: light the ring near this hole (0 none)
  char calName[32] = ""; char calWhen[24] = "";            // the loaded/saved calibration, for status
};
extern State g;

inline void lockTake() { xSemaphoreTake(g.lock, portMAX_DELAY); }
inline void lockGive() { xSemaphoreGive(g.lock); }
struct Lock { Lock() { lockTake(); } ~Lock() { lockGive(); } };

// modules
namespace sensing { void begin(); void step(); bool sensorPresent(char which); uint32_t sensorVersion(char which); uint32_t sensorStatus(char which); bool resetTest(char which, char& restartedWhich); bool recordBackground(); void setBusSpeed(uint32_t hz); xm125::Sensor& sensor(char which); float stillSpread(); void clearBg(); }
namespace calib { void begin(); void step(); bool command(const char* step, const char* action, JsonVariantConst extra, char* err, int errLen); void toJson(JsonObject out); bool changed(); }
namespace proto { int frameJson(const Frame& f, char* out, int n); void eventJson(const ring::Event& e, char* out, int n); void statusJson(JsonObject o); void healthJson(JsonObject o); bool handleCommand(JsonObjectConst c, bool authed, JsonDocument& reply, bool& needRestart); }
namespace net { void begin(); void loop(); void broadcast(const char* json); void sendCfg(); void sendStatus(); void sendCals(); }
namespace leds { void begin(); void loop(); void setStatus(uint8_t r, uint8_t g, uint8_t b); }
namespace button { void begin(); void loop(); }
namespace storage { void begin(); bool loadConfig(); void saveConfig(); void saveTotals(); void loadSecrets(); void saveSecrets(); void listCals(JsonArray out); bool saveCal(const char* name, const char* notes); bool loadCal(const char* name); bool deleteCal(const char* name); void loop(); void factoryReset(); }

}  // namespace app
