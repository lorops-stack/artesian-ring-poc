// xm125.h - register-level driver for the Acconeer I2C Distance Detector firmware on the SparkFun XM125.
// One instance per TwoWire bus (both boards answer at 0x52). Reference: Acconeer "I2C Distance Detector" register
// map (also used by SparkFun's Qwiic XM125 library). Registers are 16-bit addresses with 32-bit big-endian values.
#pragma once
#include <Arduino.h>
#include <Wire.h>

namespace xm125 {

// Register addresses
constexpr uint16_t REG_VERSION = 0x0000, REG_PROTOCOL_STATUS = 0x0001, REG_MEASURE_COUNTER = 0x0002, REG_DETECTOR_STATUS = 0x0003;
constexpr uint16_t REG_DISTANCE_RESULT = 0x0010, REG_PEAK0_DISTANCE = 0x0011, REG_PEAK0_STRENGTH = 0x001B;
constexpr uint16_t REG_START = 0x0040, REG_END = 0x0041, REG_MAX_STEP_LENGTH = 0x0042, REG_CLOSE_RANGE_LEAKAGE = 0x0043, REG_SIGNAL_QUALITY = 0x0044;
constexpr uint16_t REG_MAX_PROFILE = 0x0045, REG_THRESHOLD_METHOD = 0x0046, REG_PEAK_SORTING = 0x0047, REG_NUM_FRAMES_RECORDED = 0x0048;
constexpr uint16_t REG_FIXED_AMPLITUDE_THRESHOLD = 0x0049, REG_THRESHOLD_SENSITIVITY = 0x004A, REG_REFLECTOR_SHAPE = 0x004B, REG_FIXED_STRENGTH_THRESHOLD = 0x004C;
constexpr uint16_t REG_MEASURE_ON_WAKEUP = 0x0080, REG_COMMAND = 0x0100;
// Commands
constexpr uint32_t CMD_APPLY_CONFIG_AND_CALIBRATE = 1, CMD_MEASURE_DISTANCE = 2, CMD_APPLY_CONFIGURATION = 3, CMD_CALIBRATE = 4, CMD_RECALIBRATE = 5;
constexpr uint32_t CMD_ENABLE_UART_LOGS = 32, CMD_DISABLE_UART_LOGS = 33, CMD_LOG_CONFIGURATION = 34, CMD_RESET_MODULE = 1381192737UL;
// Detector status bits
constexpr uint32_t ST_RSS_REGISTER_OK = 1u << 0, ST_CONFIG_CREATE_OK = 1u << 1, ST_SENSOR_CREATE_OK = 1u << 2, ST_DETECTOR_CREATE_OK = 1u << 3;
constexpr uint32_t ST_CONFIG_APPLY_OK = 1u << 7, ST_SENSOR_CALIBRATE_OK = 1u << 8, ST_DETECTOR_CALIBRATE_OK = 1u << 9;
constexpr uint32_t ST_ERROR_MASK = 0x03FF0000u;      // bits 16..25: the *_ERROR flags (Acconeer I2C Distance Detector User Guide)
constexpr uint32_t ST_DETECTOR_ERROR = 1u << 28, ST_BUSY = 1u << 31;
// Threshold methods, peak sorting
constexpr uint32_t THRESH_FIXED_AMPLITUDE = 1, THRESH_RECORDED = 2, THRESH_CFAR = 3, THRESH_FIXED_STRENGTH = 4;
constexpr uint32_t SORT_CLOSEST = 1, SORT_STRONGEST = 2;
constexpr uint8_t I2C_ADDR = 0x52;

struct Settings { uint32_t startMm = 60, endMm = 850, thresholdMethod = THRESH_RECORDED, numFramesRecorded = 100, sensitivityX1000 = 500, peakSorting = SORT_CLOSEST, closeRangeLeakage = 1, maxProfile = 5, signalQualityX1000 = 15000, reflectorShape = 1; };
struct Result { uint8_t n = 0; bool nearStart = false, calNeeded = false, measureError = false; int16_t tempC = 0; uint32_t distMm[10]; int32_t strengthDb1000[10]; };

class Sensor {
 public:
  Sensor(TwoWire& wire, int sda, int scl, int rstPin, const char* name) : w_(wire), sda_(sda), scl_(scl), rst_(rstPin), name_(name) {}
  // Starts the bus; the RST line is open-drain and only ever pulled low.
  void beginBus(uint32_t hz);
  void setBusSpeed(uint32_t hz) { w_.setClock(hz); }
  void hardReset();                              // pull RST low 20 ms, release, wait for the module to boot
  bool present();                                // answers at 0x52
  bool readReg(uint16_t reg, uint32_t& value);
  bool writeReg(uint16_t reg, uint32_t value);
  bool waitNotBusy(uint32_t timeoutMs);
  // Configure and run APPLY_CONFIG_AND_CALIBRATE (needs an empty scene when the threshold method is "recorded").
  bool configure(const Settings& s, uint32_t timeoutMs = 6000);
  bool calibrate(uint32_t timeoutMs = 6000);     // CMD_CALIBRATE: re-record the threshold (C6)
  bool recalibrate(uint32_t timeoutMs = 3000);   // CMD_RECALIBRATE: sensor-only (temperature drift)
  bool measure(Result& r, uint32_t timeoutMs = 120);
  uint32_t version() { uint32_t v = 0; readReg(REG_VERSION, v); return v; }
  uint32_t status() { uint32_t v = 0; readReg(REG_DETECTOR_STATUS, v); return v; }
  uint32_t measureCounter() { uint32_t v = 0; readReg(REG_MEASURE_COUNTER, v); return v; }
  uint32_t errors() const { return errors_; }
  uint32_t lastStatus() const { return lastStatus_; }
  const char* name() const { return name_; }
  bool ok() const { return ok_; }
  static float strengthLinear(int32_t db1000) { return 1000.0f * powf(10.0f, db1000 / 1000.0f / 20.0f); }   // dB x1000 -> linear amplitude
  static void versionString(uint32_t v, char* out, int n) { snprintf(out, n, "%lu.%lu.%lu", (unsigned long)(v >> 16), (unsigned long)((v >> 8) & 0xFF), (unsigned long)(v & 0xFF)); }
 private:
  TwoWire& w_; int sda_, scl_, rst_; const char* name_; uint32_t errors_ = 0, lastStatus_ = 0; bool ok_ = false;
};

}  // namespace xm125
