// echo_hold.h - bridges short dropouts in one sensor's echo list.
// A moving hand fades in and out of the radar return. The position fix needs an echo from BOTH sensors in the same
// frame, so if each sensor misses one frame in three, a fix is lost about half the time. When a live sensor reports no
// echo, this reuses its last echo list for up to maxHold frames. It is used only for the association; the published
// echo lists and the sensor health are unchanged. Plain C++, so it is unit-tested natively.
#pragma once
#include <stdint.h>
#include "geometry.h"

namespace ring {

class EchoHold {
 public:
  explicit EchoHold(uint8_t maxHold = 2) : maxHold_(maxHold) {}
  void setMax(uint8_t m) { maxHold_ = m; }
  void reset() { n_ = 0; age_ = 0; }
  // cur/n: this frame's echoes. alive: the sensor answered this frame. Returns the list to associate with, its count in nOut,
  // and held = true when it is the saved list from an earlier frame.
  const Echo* update(const Echo* cur, int n, bool alive, int& nOut, bool& held) {
    held = false;
    if (!alive) { reset(); nOut = 0; return cur; }
    if (n > 0) { n_ = n > MAXN ? MAXN : n; for (int i = 0; i < n_; i++) saved_[i] = cur[i]; age_ = 0; nOut = n; return cur; }
    if (n_ > 0 && age_ < maxHold_) { age_++; held = true; nOut = n_; return saved_; }
    reset(); nOut = 0; return cur;
  }
 private:
  static constexpr int MAXN = 10;
  Echo saved_[MAXN]; int n_ = 0; uint8_t age_ = 0, maxHold_;
};

}  // namespace ring
