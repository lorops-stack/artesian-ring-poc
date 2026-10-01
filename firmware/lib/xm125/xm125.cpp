#include "xm125.h"

namespace xm125 {

void Sensor::beginBus(uint32_t hz) {
  pinMode(rst_, OUTPUT_OPEN_DRAIN); digitalWrite(rst_, HIGH);   // released (floating high through the module's pull-up)
  w_.begin(sda_, scl_, hz); w_.setTimeOut(50);
}
void Sensor::hardReset() {
  digitalWrite(rst_, LOW); delay(20); digitalWrite(rst_, HIGH);
  delay(1200);   // the module boots and runs its own start-up; the first registers answer after ~1 s
  ok_ = false;
}
bool Sensor::present() { w_.beginTransmission(I2C_ADDR); return w_.endTransmission() == 0; }
bool Sensor::readReg(uint16_t reg, uint32_t& value) {
  w_.beginTransmission(I2C_ADDR); w_.write((uint8_t)(reg >> 8)); w_.write((uint8_t)(reg & 0xFF));
  if (w_.endTransmission(false) != 0) { errors_++; return false; }
  if (w_.requestFrom((int)I2C_ADDR, 4) != 4) { errors_++; return false; }
  uint32_t v = 0; for (int i = 0; i < 4; i++) v = (v << 8) | (uint8_t)w_.read();
  value = v; return true;
}
bool Sensor::writeReg(uint16_t reg, uint32_t value) {
  w_.beginTransmission(I2C_ADDR); w_.write((uint8_t)(reg >> 8)); w_.write((uint8_t)(reg & 0xFF));
  w_.write((uint8_t)(value >> 24)); w_.write((uint8_t)(value >> 16)); w_.write((uint8_t)(value >> 8)); w_.write((uint8_t)value);
  if (w_.endTransmission() != 0) { errors_++; return false; }
  return true;
}
bool Sensor::waitNotBusy(uint32_t timeoutMs) {
  uint32_t t0 = millis(); uint32_t st = 0;
  while (millis() - t0 < timeoutMs) { if (readReg(REG_DETECTOR_STATUS, st)) { lastStatus_ = st; if (!(st & ST_BUSY)) return true; } delay(1); }
  return false;
}
bool Sensor::configure(const Settings& s, uint32_t timeoutMs) {
  ok_ = false;
  if (!waitNotBusy(500)) return false;
  bool w = true;
  w &= writeReg(REG_START, s.startMm); w &= writeReg(REG_END, s.endMm); w &= writeReg(REG_THRESHOLD_METHOD, s.thresholdMethod);
  w &= writeReg(REG_NUM_FRAMES_RECORDED, s.numFramesRecorded); w &= writeReg(REG_THRESHOLD_SENSITIVITY, s.sensitivityX1000); w &= writeReg(REG_PEAK_SORTING, s.peakSorting);
  w &= writeReg(REG_CLOSE_RANGE_LEAKAGE, s.closeRangeLeakage); w &= writeReg(REG_MAX_PROFILE, s.maxProfile); w &= writeReg(REG_SIGNAL_QUALITY, s.signalQualityX1000); w &= writeReg(REG_REFLECTOR_SHAPE, s.reflectorShape);
  w &= writeReg(REG_MEASURE_ON_WAKEUP, 0);
  if (!w) return false;
  if (!writeReg(REG_COMMAND, CMD_APPLY_CONFIG_AND_CALIBRATE)) return false;
  delay(5);
  if (!waitNotBusy(timeoutMs)) return false;
  ok_ = (lastStatus_ & ST_ERROR_MASK) == 0 && !(lastStatus_ & ST_DETECTOR_ERROR) && (lastStatus_ & ST_CONFIG_APPLY_OK) && (lastStatus_ & ST_DETECTOR_CALIBRATE_OK);
  return ok_;
}
bool Sensor::calibrate(uint32_t timeoutMs) { if (!writeReg(REG_COMMAND, CMD_CALIBRATE)) return false; delay(5); if (!waitNotBusy(timeoutMs)) return false; return (lastStatus_ & ST_ERROR_MASK) == 0; }
bool Sensor::recalibrate(uint32_t timeoutMs) { if (!writeReg(REG_COMMAND, CMD_RECALIBRATE)) return false; delay(5); if (!waitNotBusy(timeoutMs)) return false; return (lastStatus_ & ST_ERROR_MASK) == 0; }
bool Sensor::measure(Result& r, uint32_t timeoutMs) {
  r.n = 0;
  if (!writeReg(REG_COMMAND, CMD_MEASURE_DISTANCE)) return false;
  if (!waitNotBusy(timeoutMs)) return false;
  uint32_t res = 0; if (!readReg(REG_DISTANCE_RESULT, res)) return false;
  uint8_t n = res & 0x0F; if (n > 10) n = 10;
  r.nearStart = res & (1u << 8); r.calNeeded = res & (1u << 9); r.measureError = res & (1u << 10); r.tempC = (int16_t)((res >> 16) & 0xFFFF);
  for (uint8_t i = 0; i < n; i++) {
    uint32_t d = 0, s = 0;
    if (!readReg(REG_PEAK0_DISTANCE + i, d) || !readReg(REG_PEAK0_STRENGTH + i, s)) return false;
    r.distMm[r.n] = d; r.strengthDb1000[r.n] = (int32_t)s; r.n++;
  }
  return true;
}

}  // namespace xm125
