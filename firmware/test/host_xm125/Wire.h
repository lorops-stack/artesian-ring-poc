// Fake I2C bus with an XM125 distance-detector model behind it (register map from the Acconeer I2C Distance Detector User Guide).
#pragma once
#include "Arduino.h"
#include <map>
#include <vector>
class TwoWire {
 public:
  // model controls
  bool stopOnlySlave = false;      // NACKs a repeated start, accepts STOP
  bool absent = false;
  int busyPolls = 3;               // polls that read BUSY after a command
  uint32_t distResult = 0; std::vector<uint32_t> dist, str;   // what MEASURE returns
  uint32_t calErrorBits = 0;       // set to put an error flag in the status after APPLY
  std::map<uint16_t, uint32_t> reg; uint32_t status = 0; int busyLeft = 0; int writes = 0, failNextWrites = 0;
  bool begin(int, int, uint32_t) { return true; } void setClock(uint32_t) {} void setTimeOut(uint16_t) {}
  void beginTransmission(uint8_t a) { addr = a; tx.clear(); }
  size_t write(uint8_t b) { tx.push_back(b); return 1; }
  uint8_t endTransmission(bool stop = true) {
    if (absent || addr != 0x52) return 2;
    if (tx.empty()) return 0;                              // address-only ping
    if (tx.size() == 2) { if (!stop && stopOnlySlave) return 2; rd = (tx[0] << 8) | tx[1]; return 0; }
    if (tx.size() == 6) { if (failNextWrites > 0) { failNextWrites--; return 2; } writes++; uint32_t v = ((uint32_t)tx[2] << 24) | (tx[3] << 16) | (tx[4] << 8) | tx[5]; doWrite((tx[0] << 8) | tx[1], v); return 0; }
    return 4;
  }
  size_t requestFrom(int, int n) { if (absent || n != 4) return 0; uint32_t v = doRead(rd); out[0] = v >> 24; out[1] = v >> 16; out[2] = v >> 8; out[3] = v; pos = 0; return 4; }
  int read() { return out[pos++]; }
 private:
  uint8_t addr = 0; std::vector<uint8_t> tx; uint16_t rd = 0; uint8_t out[4]; int pos = 0;
  uint32_t doRead(uint16_t r) {
    if (r == 0x0003) { uint32_t s = status; if (busyLeft > 0) { busyLeft--; s |= 1u << 31; } return s; }
    if (r == 0x0000) return (1u << 16) | (2u << 8) | 3u;
    if (r == 0x0010) return distResult;
    if (r >= 0x0011 && r <= 0x001A) { size_t i = r - 0x0011; return i < dist.size() ? dist[i] : 0; }
    if (r >= 0x001B && r <= 0x0024) { size_t i = r - 0x001B; return i < str.size() ? str[i] : 0; }
    auto it = reg.find(r); return it == reg.end() ? 0 : it->second;
  }
  void doWrite(uint16_t r, uint32_t v) {
    if (r == 0x0100) {                                  // command
      if (busyLeft > 0) return;                          // "The Busy bit must not be set when a new command is written"
      busyLeft = busyPolls;
      if (v == 1) status = 0x1FF | calErrorBits;         // all OK bits (0..8, 9 set below)
      if (v == 1) status |= (1u << 9);
      if (v == 4) status |= (1u << 8) | (1u << 9);
    } else reg[r] = v;
  }
};
extern TwoWire Wire; extern TwoWire Wire1;
