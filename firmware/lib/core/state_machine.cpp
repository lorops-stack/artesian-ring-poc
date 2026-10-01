#include "state_machine.h"
#include <math.h>
#include <string.h>

namespace ring {

static const char* ST_NAMES[] = { "IDLE", "ARMING", "ACTIVE", "CUP_FULL", "EXIT_PENDING", "CLEAN" };
const char* stateName(State s) { return ST_NAMES[s]; }
static constexpr float GPM_TO_MLS = 3785.41f / 60.0f, BASELINE_GPM = 2.2f;

void StateMachine::setConfig(const Config* cfg) {
  cfg_ = cfg; const Layout* L = cfg->activeLayout(); nZones_ = L ? buildZones(*L, zones_, MAX_ZONES) : 0;
  zone_ = nullptr; armZone_ = nullptr;
}
void StateMachine::reset() {
  st_ = IDLE; resumeSt_ = IDLE; fn_ = Fn::None; zone_ = nullptr; armZone_ = nullptr; armSince_ = 0; settle_ = 0;
  session_ = false; sessionStart_ = entryT_ = 0; soapUsed_ = dispUsed_ = false; disposalUntil_ = 0; cupMl_ = 0;
  exitStart_ = 0; gone_ = present_ = 0; cleanUntil_ = lastSeen_ = 0; lat_ = -1; falseOff_ = heldOn_ = 0;
  hasRef_ = false; lastMove_ = 0; still_ = 0; flag_ = FLAG_NO_HAND; t_ = 0; winN_ = winI_ = 0; flowMs_ = usedMl_ = 0; lastOffT_ = -1000000000; lastOffWhy_ = nullptr;
  totals_ = Totals();
}
float StateMachine::flowMls() const { const Profile* p = cfg_->activeProfile(); return (p ? p->flowGpm : 1.5f) * GPM_TO_MLS; }
float StateMachine::baseMls() const { return BASELINE_GPM * GPM_TO_MLS; }
void StateMachine::emit(Ev type, const Event& e0) { if (!evFn_) return; Event e = e0; e.type = type; e.t = t_; evFn_(e, evCtx_); }

void StateMachine::startSession() {
  session_ = true; sessionStart_ = entryT_ = t_; flowMs_ = usedMl_ = 0; soapUsed_ = dispUsed_ = false;
  Event e; e.a = "start"; emit(Ev::Session, e);
}
void StateMachine::endSession() {
  if (!session_) return;
  uint32_t ms = t_ - sessionStart_; float savedFlow = (baseMls() - flowMls()) * flowMs_ / 1000.0f, rest = ms > flowMs_ ? ms - flowMs_ : 0, savedOff = baseMls() * rest / 1000.0f;
  totals_.sess += 1; totals_.ml += usedMl_; totals_.savedOff += savedOff; totals_.savedFlow += savedFlow;
  session_ = false; soapUsed_ = dispUsed_ = false; armZone_ = nullptr; settle_ = 0; cupMl_ = 0;
  Event e; e.a = "end"; e.ms = ms; e.used = usedMl_; e.savedOff = savedOff; e.savedFlow = savedFlow; emit(Ev::Session, e);
}
void StateMachine::stopDisposal(const char* why) { if (disposalUntil_) { disposalUntil_ = 0; Event e; e.a = "stop"; e.why = why; emit(Ev::Disp, e); } }
void StateMachine::allOff(const char* why, bool keepDisposal) {
  bool hadWater = st_ == ACTIVE || st_ == CUP_FULL;
  fn_ = Fn::None; st_ = IDLE; zone_ = nullptr; armZone_ = nullptr; settle_ = 0;
  if (!keepDisposal) stopDisposal(why);
  Event e; e.why = why; e.water = hadWater; emit(Ev::Off, e); lastOffT_ = (int32_t)t_; lastOffWhy_ = why;
  endSession();
}
bool StateMachine::setLayout(const char* id) {
  if (!cfg_->findLayout(id)) return false;
  // the caller updates cfg->layout before calling; rebuild zones here
  const Layout* L = cfg_->findLayout(id); nZones_ = buildZones(*L, zones_, MAX_ZONES);
  if (st_ == CLEAN) cleanUntil_ = 0;
  allOff("layout", false); st_ = IDLE; Event e; e.id = id; emit(Ev::Layout, e); return true;
}
void StateMachine::startClean(const char* src) {
  if (st_ == CLEAN) return;
  stopDisposal("clean"); allOff("clean", true);
  st_ = CLEAN; cleanUntil_ = t_ + cfg_->tuning.cleanMs; Event e; e.a = "start"; e.why = src; emit(Ev::Clean, e);
}
void StateMachine::endClean() { if (st_ != CLEAN) return; st_ = IDLE; cleanUntil_ = 0; Event e; e.a = "end"; emit(Ev::Clean, e); }
bool StateMachine::zoneBlocked(Fn fn) const {
  if (fn == Fn::Neutral) return true;
  if (fn == Fn::Soap && soapUsed_) return true;
  if (fn == Fn::Disposal && (dispUsed_ || disposalUntil_)) return true;
  return false;
}

Snapshot StateMachine::step(const Input& in) {
  const Tuning& tun = cfg_->tuning; const Profile* prof = cfg_->activeProfile();
  uint32_t t = in.t; float dt = t_ ? fminf(0.2f, fmaxf(0.0f, (t - t_) / 1000.0f)) : 0; t_ = t;
  uint8_t flag = in.hasPos ? in.flag : (uint8_t)FLAG_NO_HAND;
  bool present = in.hasPos && (flag == FLAG_NONE || flag == FLAG_JUMP);
  bool usable = present && flag == FLAG_NONE;
  auto snap = [&]() {
    Snapshot s; s.st = st_; s.fn = fn_; s.zone = zone_; s.settle = settle_; s.exitRem = st_ == EXIT_PENDING ? fmaxf(0, fminf(1, 1 - (float)(t_ - exitStart_) / tun.exitMs)) : 0;
    s.dispSec = disposalUntil_ ? fmaxf(0, (float)(disposalUntil_ - t_) / 1000.0f) : 0; s.cupMl = cupMl_; s.lk = (soapUsed_ ? 1 : 0) | (dispUsed_ ? 2 : 0); s.flag = flag_; s.still = still_; s.lat = lat_; s.session = session_;
    s.cleanSec = st_ == CLEAN ? fmaxf(0, (float)(cleanUntil_ - t_) / 1000.0f) : 0; s.falseOff = falseOff_; s.heldOn = heldOn_; return s; };

  // Water accounting over dt
  if (flowing()) {
    flowMs_ += dt * 1000; usedMl_ += flowMls() * dt;
    if (fn_ == Fn::Cup) { cupMl_ += flowMls() * dt; float cap = prof ? prof->cupMl : 350; if (cupMl_ >= cap) { cupMl_ = cap; st_ = CUP_FULL; Event e; e.ml = cupMl_; emit(Ev::CupFull, e); } }
  }
  if (disposalUntil_ && (int32_t)(t - disposalUntil_) >= 0) { disposalUntil_ = 0; Event e; e.a = "stop"; e.why = "timer"; emit(Ev::Disp, e); }

  // Presence / gone counting
  if (present) {
    lastSeen_ = t;
    if (gone_ > 0 && gone_ < tun.goneFrames && session_ && st_ != EXIT_PENDING) { heldOn_ += 1; Event e; e.frames = gone_; emit(Ev::HeldOn, e); }
    gone_ = 0;
  } else gone_ += 1;

  // Stillness: half-second average position against a reference (spec 4.4)
  if (usable) {
    winX_[winI_] = in.x; winY_[winI_] = in.y; winI_ = (winI_ + 1) % 11; if (winN_ < 11) winN_++;
    float mx = 0, my = 0; for (int i = 0; i < winN_; i++) { mx += winX_[i]; my += winY_[i]; } mx /= winN_; my /= winN_;
    if (!hasRef_) { hasRef_ = true; refX_ = mx; refY_ = my; lastMove_ = t; }
    else if (hypotf(mx - refX_, my - refY_) > cfg_->hand.stillThr) { refX_ = mx; refY_ = my; lastMove_ = t; }
    still_ = (t - lastMove_) / 1000.0f;
  } else if (!present && gone_ >= tun.goneFrames) { hasRef_ = false; still_ = 0; winN_ = winI_ = 0; }

  if (st_ == CLEAN) { flag_ = present ? FLAG_BLOCKED : FLAG_NO_HAND; settle_ = 0; zone_ = nullptr; if ((int32_t)(t - cleanUntil_) >= 0) endClean(); return snap(); }

  if (st_ == IDLE) {
    zone_ = nullptr; settle_ = 0;
    if (present && in.speed >= tun.startSpeed) present_ += 1; else present_ = 0;
    if (present_ >= tun.presentFrames) {
      present_ = 0; startSession(); st_ = ARMING; armZone_ = nullptr; hasRef_ = false;
      if ((int32_t)t - lastOffT_ < 1000 && lastOffWhy_ && strcmp(lastOffWhy_, "exit") == 0) { falseOff_ += 1; Event e; e.why = "hand back within 1 s"; emit(Ev::FalseOff, e); }
    } else { flag_ = present ? (uint8_t)FLAG_NOT_SETTLED : (in.hasPos ? flag : (uint8_t)FLAG_NO_HAND); return snap(); }
  }

  if (st_ == EXIT_PENDING) {
    if (present) { st_ = resumeSt_; Event e; emit(Ev::Resume, e); }
    else if (t - exitStart_ >= tun.exitMs) { allOff("exit", true); flag_ = FLAG_NO_HAND; return snap(); }
    else { flag_ = FLAG_NO_HAND; return snap(); }
  }

  if (!present) {
    if (gone_ >= tun.goneFrames) { resumeSt_ = st_; st_ = EXIT_PENDING; exitStart_ = lastSeen_ ? lastSeen_ : t; settle_ = 0; }
    flag_ = FLAG_NO_HAND; return snap();
  }

  if (usable && still_ * 1000 >= tun.stillOffMs) {
    Event e; e.x = in.x; e.y = in.y; emit(Ev::Still, e); allOff("still", true); flag_ = FLAG_STILL; hasRef_ = false; present_ = 0; return snap();
  }

  if (usable) zone_ = zoneAt(zones_, nZones_, cfg_->plane, in.x, in.y, zone_, tun.hyst);
  const Zone* z = zone_;
  if (!z || !usable || armZone_ != z || in.speed >= tun.settleSpeed) { armZone_ = z; armSince_ = t; }
  uint32_t held = t - armSince_, need = (z && z->fn == Fn::Disposal) ? tun.disposalHoldMs : tun.settleMs;
  bool latched = st_ == ACTIVE || st_ == CUP_FULL;
  bool blocked = z ? zoneBlocked(z->fn) : true;
  settle_ = (z && !blocked && !latched) ? fminf(1.0f, (float)held / need) : 0;
  if (!usable) flag_ = flag; else if (!z) flag_ = FLAG_NOT_SETTLED; else if (blocked && !latched) flag_ = FLAG_BLOCKED; else if (latched) flag_ = FLAG_NONE; else flag_ = held >= need ? FLAG_NONE : FLAG_NOT_SETTLED;
  if (!z || !usable) return snap();

  if (disposalUntil_ && z->fn != Fn::Disposal && held >= tun.settleMs) stopDisposal("zone");

  if (st_ == ARMING) {
    if (z->fn == Fn::Neutral) { if (held >= tun.cleanHoldMs && in.speed < tun.settleSpeed) startClean("neutral"); return snap(); }
    if (blocked || held < need) return snap();
    int lat = (int)(t - entryT_);
    if (z->fn == Fn::Soap) { soapUsed_ = true; entryT_ = t; armSince_ = t; lat_ = lat; Event e; e.ml = prof ? prof->soapMl : 0.8f; e.lat = lat; emit(Ev::Soap, e); }
    else if (z->fn == Fn::Disposal) { dispUsed_ = true; disposalUntil_ = t + tun.disposalRunMs; entryT_ = t; armSince_ = t; lat_ = lat; Event e; e.a = "start"; e.lat = lat; emit(Ev::Disp, e); }
    else { st_ = ACTIVE; fn_ = z->fn; cupMl_ = 0; lat_ = lat; Event e; e.fn = z->fn; e.lat = lat; emit(Ev::Latch, e); }
  }
  return snap();
}

}  // namespace ring
