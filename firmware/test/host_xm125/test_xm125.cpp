// Host-side check of lib/xm125 against a fake module that follows the Acconeer I2C Distance Detector register map.
// Build and run: tools/xm125_host_test.sh
#include "xm125.h"
#include <assert.h>
uint32_t g_ms = 0; SerialShim Serial; TwoWire Wire, Wire1;
static int fails = 0;
#define CHECK(c) do { if (!(c)) { printf("FAIL line %d: %s\n", __LINE__, #c); fails++; } } while (0)

int main() {
  // 1. normal flow: configure then measure, big-endian values, peaks
  { TwoWire& w = Wire; w = TwoWire();
    xm125::Sensor s(w, 8, 9, 6, "A"); s.beginBus(400000); s.hardReset();
    CHECK(s.present());
    char v[16]; xm125::Sensor::versionString(s.version(), v, sizeof v); CHECK(!strcmp(v, "1.2.3"));
    xm125::Settings st; st.startMm = 60; st.endMm = 850;
    CHECK(s.configure(st));
    CHECK(s.ok());
    CHECK(w.reg[0x0040] == 60 && w.reg[0x0041] == 850 && w.reg.count(0x0042) == 0 && w.reg[0x0044] == 25000 && w.reg[0x0046] == 2 && w.reg[0x0047] == 1);
    w.distResult = (24u << 16) | (1u << 8) | 2;       // 24 C, near-start flag, 2 peaks
    w.dist = { 412, 655 }; w.str = { (uint32_t)(int32_t)74000, (uint32_t)(int32_t)-12000 };
    xm125::Result r; CHECK(s.measure(r));
    CHECK(r.n == 2 && r.distMm[0] == 412 && r.distMm[1] == 655 && r.nearStart && !r.calNeeded && r.tempC == 24);
    CHECK(r.strengthDb1000[0] == 74000 && r.strengthDb1000[1] == -12000);
    float lin = xm125::Sensor::strengthLinear(r.strengthDb1000[0]); CHECK(lin > 4.9e6f && lin < 5.1e6f);   // 74 dB = 5000x
    CHECK(s.errors() == 0);
  }
  // 2. a slave that NACKs a repeated start: reads fall back to STOP and keep working
  { TwoWire& w = Wire; w = TwoWire(); w.stopOnlySlave = true;
    xm125::Sensor s(w, 8, 9, 6, "A"); s.beginBus(400000);
    uint32_t ver = s.version(); CHECK(ver == ((1u << 16) | (2u << 8) | 3u));
    xm125::Settings st; CHECK(s.configure(st));
  }
  // 3. error flag after apply: configure fails, ok() false (module would then need RESET_MODULE)
  { TwoWire& w = Wire; w = TwoWire(); w.calErrorBits = 1u << 23;   // CONFIG_APPLY_ERROR
    xm125::Sensor s(w, 8, 9, 6, "A"); s.beginBus(400000);
    xm125::Settings st; CHECK(!s.configure(st)); CHECK(!s.ok());
  }
  // 4. a write NACKed twice is retried and succeeds
  { TwoWire& w = Wire; w = TwoWire(); w.failNextWrites = 2;
    xm125::Sensor s(w, 8, 9, 6, "A"); s.beginBus(400000);
    CHECK(s.writeReg(0x0040, 60)); CHECK(w.reg[0x0040] == 60);
  }
  // 5. sensor absent: present() false, reads and measures fail cleanly
  { TwoWire& w = Wire; w = TwoWire(); w.absent = true;
    xm125::Sensor s(w, 8, 9, 6, "A"); s.beginBus(400000);
    CHECK(!s.present()); xm125::Result r; CHECK(!s.measure(r)); CHECK(s.errors() > 0);
  }
  // 6. more than 10 peaks claimed is clamped; the busy bit is honoured before the result is read
  { TwoWire& w = Wire; w = TwoWire(); xm125::Sensor s(w, 8, 9, 6, "A"); s.beginBus(400000);
    w.distResult = 15; w.dist.assign(10, 500); w.str.assign(10, 1000); w.busyPolls = 7;
    xm125::Result r; CHECK(s.measure(r)); CHECK(r.n == 10);
  }
  printf(fails ? "xm125 host test: %d FAILED\n" : "xm125 host test: all passed\n", fails);
  return fails ? 1 : 0;
}
