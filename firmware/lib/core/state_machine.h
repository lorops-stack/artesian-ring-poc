// state_machine.h - the latch state machine (spec section 4). Time-driven: every step() carries the frame time, so
// the same code runs on the ESP32 and in the native tests. Mirrors ui/src/js/03-statemachine.js line for line in
// behaviour; the fixtures in test/fixtures run against both.
#pragma once
#include <stdint.h>
#include "config.h"

namespace ring {

enum State : uint8_t { IDLE = 0, ARMING = 1, ACTIVE = 2, CUP_FULL = 3, EXIT_PENDING = 4, CLEAN = 5 };
const char* stateName(State s);

enum class Ev : uint8_t { Session, Latch, Soap, CupFull, Disp, Off, Still, Clean, FalseOff, HeldOn, Resume, Layout, Bg };
struct Event {
  Ev type; uint32_t t = 0; Fn fn = Fn::None; int lat = -1;
  const char* a = nullptr;      // "start" / "end"
  const char* why = nullptr;    // exit, still, clean, layout, timer, zone, reset
  uint32_t ms = 0; float used = 0, savedOff = 0, savedFlow = 0, ml = 0, x = 0, y = 0; int frames = 0; bool water = false; const char* id = nullptr;
};
typedef void (*EventFn)(const Event&, void* ctx);

struct Input { uint32_t t; bool hasPos; float x, y; float speed; uint8_t flag; };

struct Snapshot {
  State st; Fn fn; const Zone* zone; float settle, exitRem, dispSec, cupMl, still, cleanSec; uint8_t lk, flag; int lat; bool session; uint32_t falseOff, heldOn;
};
struct Totals { uint32_t sess = 0; float ml = 0, savedOff = 0, savedFlow = 0; };

class StateMachine {
 public:
  explicit StateMachine(const Config* cfg) { setConfig(cfg); reset(); }
  void setConfig(const Config* cfg);        // also rebuilds the zones for the active layout
  void reset();
  void onEvent(EventFn fn, void* ctx) { evFn_ = fn; evCtx_ = ctx; }
  Snapshot step(const Input& in);
  // commands
  bool setLayout(const char* id);           // any state -> IDLE, all off, disposal stopped
  void startClean(const char* src);
  void endClean();
  void allOff(const char* why, bool keepDisposal);
  // readouts
  State state() const { return st_; }
  Fn fn() const { return fn_; }
  bool flowing() const { return st_ == ACTIVE && fnIsWater(fn_); }
  bool session() const { return session_; }
  uint32_t disposalUntil() const { return disposalUntil_; }
  const Zone* zones() const { return zones_; } int nZones() const { return nZones_; }
  Totals& totals() { return totals_; }
  uint32_t t() const { return t_; }

 private:
  void emit(Ev type, const Event& e);
  void startSession();
  void endSession();
  void stopDisposal(const char* why);
  bool zoneBlocked(Fn fn) const;
  float flowMls() const; float baseMls() const;

  const Config* cfg_ = nullptr; Zone zones_[MAX_ZONES]; int nZones_ = 0;
  EventFn evFn_ = nullptr; void* evCtx_ = nullptr;
  State st_ = IDLE, resumeSt_ = IDLE; Fn fn_ = Fn::None; const Zone* zone_ = nullptr; const Zone* armZone_ = nullptr; uint32_t armSince_ = 0; float settle_ = 0;
  bool session_ = false; uint32_t sessionStart_ = 0, entryT_ = 0; bool soapUsed_ = false, dispUsed_ = false; uint32_t disposalUntil_ = 0; float cupMl_ = 0;
  uint32_t exitStart_ = 0; int gone_ = 0, present_ = 0; uint32_t cleanUntil_ = 0, lastSeen_ = 0; int lat_ = -1; uint32_t falseOff_ = 0, heldOn_ = 0;
  bool hasRef_ = false; float refX_ = 0, refY_ = 0; uint32_t lastMove_ = 0; float still_ = 0; uint8_t flag_ = FLAG_NO_HAND; uint32_t t_ = 0;
  float winX_[11], winY_[11]; int winN_ = 0, winI_ = 0;
  float flowMs_ = 0, usedMl_ = 0; int32_t lastOffT_ = -1000000000; const char* lastOffWhy_ = nullptr; Totals totals_;
};

}  // namespace ring
