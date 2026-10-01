# Artesian Ring PoC

Touchless control for a faucetless sink. Two 60 GHz pulsed radar sensors in the sink ring track a hand across a 23 × 21 in plane, split into zones (Kitchen 3 × 3, Bathroom 3 × 2, Accessible 2 + 3). The first zone the hand settles in picks the function, and the function holds until the hands leave. Everything turns off 1.0 s after the hands leave; the disposal is the one exception, running a fixed 15 s. No camera, no optics, no touch.

This repo holds the live proof-of-concept demo: sensor firmware for an ESP32-S3, and **Ring Studio**, a browser-based visualizer and calibration studio served by the ESP32 over its own password-protected Wi-Fi.

```
 XM125 A (back-left)  ──I2C 0──┐                      ┌── WS2812 LED ring
                               ├── ESP32-S3 ──────────┤
 XM125 B (back-right) ──I2C 1──┘   fusion · latch     └── Wi-Fi AP ── Ring Studio (laptop / tablet)
```

## Status

**Software built, hardware bench pending (30 Sep 2026).**

- **Ring Studio** (`ui/`) is complete and runs on its built-in simulator with no hardware: `python tools/build_ui.py`, then open `ui/dist/index.html` in Chrome. Showcase, Operator view, calibration studio C0 to C14 with the troubleshooting codes built in, test runner, dashboard, settings.
- **Firmware** (`firmware/`) covers Phase 0 and Phase 1 (XM125 driver, fusion, state machine, Wi-Fi, Ring Studio server, calibration steps, LEDs, button). It type-checks and its core passes the shared fixtures, but it has not yet run on the ESP32: that is build guide Steps 21 to 23.
- **Hardware**: Parts 1 to 4, 6 and 10 of the build guide are Nathan's bench work (`docs/08a-hands-on-instructions.docx`).

Checks: `node --test ui/test/*.test.js` (34), `node ui/test/smoke.js` (headless browser), `tools/native_tests.sh` or `pio test -e native` (C++ core against the same fixtures).

## Documents

| Doc | What's in it |
|---|---|
| [01 · Design spec](docs/01-design-spec.md) | Targets, layouts, the full state machine, architecture, features, calibration studio, UI design (8b), phases |
| [02 · Design review](docs/02-design-review.md) | Issues found and their fixes, decisions, open actions |
| [03 · Pin layout and wiring](docs/03-pinout-and-wiring.md) | Pin table, wiring diagram, sensor placement |
| [04 · Bill of materials](docs/04-bom.md) | Parts on hand and to buy |
| [05 · Reflash the XM125s](docs/05-flash-xm125.md) | Switch the sensors to the distance detector firmware |
| [06 · Setup on Windows](docs/06-setup-windows.md) | Tools, drivers, clone, build (copy-paste) |
| [07 · Test and demo plan](docs/07-test-and-demo-plan.md) | Bench tests, accuracy protocol, pre-demo checklist, run sheet |
| [08 · Build guide](docs/08-build-guide.md) | **Start here.** Every step from parts to demo day, marked YOU or CLAUDE, with checkpoints |
| [09 · Troubleshooting](docs/09-troubleshooting.md) | Every fault code, from wiring to calibration to LEDs, with step-by-step fixes. Ring Studio shows the same codes |
| [10 · Protocol](docs/10-protocol.md) | The JSON messages between the ring and Ring Studio (also what the simulator speaks) |
| [11 · Bench day](docs/11-bench-day.md) | One page for the day: mount, flash, wire, first serial output, Ring Studio (Hardware check, Aim screen, Bench log), LED ring |
| [08a · Hands-on instructions (.docx)](docs/08a-hands-on-instructions.docx) | Parts 1, 2, 3, 4, 6 and 10 of the build guide, fully broken down, for the bench |

## Layout

```
docs/          design documents and wiring diagram
firmware/      ESP32-S3 firmware (PlatformIO, Arduino framework)
  include/pins.h      pin layout, single source of truth
  include/defaults.h  factory defaults for every tunable value
  test/               native unit tests and recorded-session fixtures
ui/            Ring Studio web app (built to ui/dist, uploaded to the ESP32)
tools/         geometry simulation, diagram generator
```

## Hardware
- ESP32-S3-N8R2 dev board
- 2 × SparkFun XM125 (Acconeer A121 60 GHz pulsed coherent radar)
- WS2812B LED strip (132 LEDs), 74AHCT125 level shifter, 5 V ≥ 4 A LED supply, 5 V USB-C adapter for the ESP32

Confidential: Artesian Streams internal. Do not make this repository public.
