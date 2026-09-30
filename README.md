# Artesian Ring PoC

Touchless control for a faucetless sink. Two 60 GHz pulsed radar sensors in the sink ring track a hand across a 23 × 21 in plane, split into a 3 × 3 grid of functions. The first zone the hand settles in picks the function, the function holds until the hands leave, and everything turns off 1.0 s later. No camera, no optics, no touch.

This repo holds the live proof-of-concept demo: sensor firmware for an ESP32-S3, and **Ring Studio**, a browser-based visualizer and calibration studio served by the ESP32 over its own Wi-Fi.

```
 XM125 A (back-left)  ──I2C 0──┐                      ┌── WS2812 LED ring
                               ├── ESP32-S3 ──────────┤
 XM125 B (back-right) ──I2C 1──┘   fusion · latch     └── Wi-Fi AP ── Ring Studio (laptop / tablet)
```

## Status

**Planning.** The design is written and under review. Build starts once it is signed off.

## Documents

| Doc | What's in it |
|---|---|
| [01 · Design spec](docs/01-design-spec.md) | Goals and targets, zone map, latch state machine, features, calibration studio, phases |
| [02 · Design review](docs/02-design-review.md) | Issues found, fixes, open decisions |
| [03 · Pin layout and wiring](docs/03-pinout-and-wiring.md) | Pin table, wiring diagram, sensor placement |
| [04 · Bill of materials](docs/04-bom.md) | Parts on hand and to buy |
| [05 · Reflash the XM125s](docs/05-flash-xm125.md) | Switch the sensors to the distance detector firmware |
| [06 · Setup on Windows](docs/06-setup-windows.md) | Tools, drivers, clone, build (copy-paste) |
| [07 · Test and demo plan](docs/07-test-and-demo-plan.md) | Bench tests, accuracy protocol, pre-demo checklist, run sheet |

## Layout

```
docs/          design documents and wiring diagram
firmware/      ESP32-S3 firmware (PlatformIO, Arduino framework)
  include/pins.h   pin layout, single source of truth
ui/            Ring Studio web app (built into the firmware image)
tools/         geometry simulation, diagram generator
```

## Hardware
- ESP32-S3-N8R2 dev board
- 2 × SparkFun XM125 (Acconeer A121 60 GHz pulsed coherent radar)
- WS2812B LED strip, 74AHCT125 level shifter, 5 V 4 A supply

Confidential: Artesian Streams internal. Do not make this repository public.
