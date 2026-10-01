# Firmware

ESP32-S3 firmware for the ring. Build and upload with PlatformIO (VS Code: the alien-head icon, then **esp32s3 → General → Upload**; the UI with **Platform → Upload Filesystem Image** after `python tools/build_ui.py`). Tests without hardware: **native → Advanced → Test**, or `tools/native_tests.sh` with plain g++.

| Where | What |
|---|---|
| `include/pins.h`, `include/defaults.h` | the pin layout and factory defaults (single source of truth, also mirrored in the UI) |
| `lib/core/` | geometry (zones with hysteresis, trilateration, echo association, tracker), the configuration model and its JSON, the latch state machine (spec section 4). Plain C++17; runs on the host |
| `lib/xm125/` | register-level driver for the Acconeer I2C Distance Detector on the SparkFun XM125 (one per I2C bus, RST line) |
| `src/sensing.cpp` | core 1: measure A then B, associate, track, run the state machine, publish the frame. Prints echo lists on USB serial while no Ring Studio is connected (Phase 0 view) |
| `src/protocol.cpp` | JSON frames, events, status, health and the command dispatcher (docs/10-protocol.md) |
| `src/net.cpp` | Wi-Fi access point `ArtesianRing`, Ring Studio static files from LittleFS, WebSocket `/ws`, HTTP API, over-the-air update |
| `src/calib.cpp` | calibration steps on the device: C0 hardware check, identify, C6 background capture, C7 and C8 readings (the fits run in the browser) |
| `src/leds.cpp` | the WS2812 ring patterns, LED tests, calibration guidance; the onboard status LED |
| `src/button.cpp` | BOOT button while running: short = clean mode, 3 to 8 s = calibration, 10 s = reset the Wi-Fi password and PIN |
| `src/storage.cpp` | LittleFS `/cfg.json` and `/cals/*.json`; NVS for the Wi-Fi password, PIN and running totals |
| `test/test_core/` | Unity tests: geometry, config JSON, and the state machine against `test/fixtures/scenarios.json`, which the UI's JavaScript machine also runs |

First boot: the access point uses a **temporary password printed on the serial monitor**; Ring Studio asks for the real password and the studio PIN (`setup` command). Hold BOOT for 10 s while running to reset both.

Threads: the Arduino `loop()` (core 1) is sensing only. `ringTask` on core 0 runs the web server housekeeping, LEDs, the button, storage and calibration steps. A FreeRTOS mutex (`app::Lock`) guards the configuration and the state machine; never call `net::sendCfg()` while holding it.
