# 03 · Pin Layout and Wiring

![Wiring diagram](wiring.svg)

The source of truth in code is `firmware/include/pins.h`. The diagram is generated from `tools/make_wiring_svg.py`.

## Why two I2C buses
Both XM125 boards are fixed at I2C address **0x52**. The ADDR jumper is not implemented in the sensor firmware yet (SparkFun docs), so the boards cannot share a bus. The ESP32-S3 has two hardware I2C controllers, and each sensor gets one. No jumpers to solder.

## Connection table

Every ESP32 pin used is on the board's **left header** (the side labelled 3V3, 3V3, RST, 4, 5, 6, 7 ...).

| ESP32-S3 pin | Goes to | Wire colour | Notes |
|---|---|---|---|
| 3V3 (top pin) | Sensor A **3V3** | red | |
| 3V3 (2nd pin) | Sensor B **3V3** | red | |
| GND (bottom pin) | Sensor A **G**, Sensor B **G**, level shifter GND, 5 V supply GND | black | one common ground for everything |
| GPIO8 | Sensor A **SDA** | blue | I2C bus 0 |
| GPIO9 | Sensor A **SCL** | yellow | I2C bus 0 |
| GPIO17 | Sensor B **SDA** | blue | I2C bus 1 |
| GPIO18 | Sensor B **SCL** | yellow | I2C bus 1 |
| GPIO6 | Sensor A **RST** | purple | recommended: lets firmware hard-reset a hung sensor |
| GPIO7 | Sensor B **RST** | purple | recommended |
| GPIO4 | 74AHCT125 **1A** → **1Y** → 330 Ω → strip **DIN** | green | LED ring data |
| GPIO15 / GPIO16 | Sensor A / B **INT** | n/a | optional, not wired for now |
| GPIO10 / 11 / 12 | reserved: Sensor C SDA / SCL / RST | n/a | for the replacement third sensor |
| GPIO48 | onboard RGB LED | n/a | status light, no wiring |
| GPIO0 | onboard BOOT button | n/a | long-press = start calibration |

**Sensor pins NOT to connect:**
- **WU:** you soldered a header pin here on one board. Leave it unconnected. The WU jumper on the board already ties it to 3V3 so the sensor stays awake. Wiring it to a GPIO would fight the jumper.
- **ADDR, INT, IO0, IO1, TX, RX, BOOT, VU, 1V8, SIO, CLK:** leave unconnected.
- **RST** is on the XM125's *other* header strip (left side, bottom). Solder one header pin there on each board.

**Level shifter (74AHCT125):** VCC to 5 V, GND to common ground, **1OE tied to GND** (enables the channel). Tie unused inputs 2A, 3A and 4A to GND.

**LED power:** the 5 V supply feeds the strip's 5V and GND directly, with a 1000 µF capacitor across 5V/GND at the strip end. The strip does **not** draw power through the ESP32. Firmware caps brightness to keep current under 3 A.

## Power
- The ESP32 board is powered over USB-C from the laptop. Use the port marked **COM / UART** (CH343 chip) for programming and serial.
- The XM125 boards take 3.3 V from the ESP32 3V3 pins. Do **not** plug USB into an XM125 while it is wired to the ESP32. Their USB ports are only for reflashing.

## Cable runs
- I2C is designed for short runs. Keep each sensor cable **under 50 cm** at 400 kHz. If a run has to be longer (up to about 1 m), set `I2C_FREQ_HZ` to 100000 in `pins.h`.
- Twist SDA with GND and SCL with 3V3 on each run, or use a 4-core Qwiic cable with a female-jumper end.

## Sensor placement (plan view, facing the sink)

```
      back edge of sink opening (ring)
  A ●──────────────────────────────────────● B
    │ ↘ aim 45° in, tilt ~20° down   ↙     │
    │  Soap     │  Disposal  │  Cup fill   │  back
    │───────────┼────────────┼─────────────│
    │ Waterfall │  Neutral   │  Waterfall  │  middle
    │───────────┼────────────┼─────────────│
    │   Hot     │   Warm     │    Cold     │  front
    └──────────────────────────────────────┘
      front edge (user stands here)          23 in wide × 21 in deep
      reserved: sensor C at front-centre
```

Measure and enter the real positions, height and angles in the calibration studio (spec section 8). Firmware never assumes them.
