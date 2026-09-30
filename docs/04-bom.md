# 04 · Bill of Materials

| # | Item | Qty | Status | Notes |
|---|---|---|---|---|
| 1 | ESP32-S3-N8R2 dev board (YD-ESP32-S3 layout) | 1 | have | |
| 2 | SparkFun XM125 A121 radar breakout (Qwiic) | 2 | have | third was defective |
| 3 | SparkFun XM125, front-centre third sensor | 1 | future fix | review R6 |
| 4 | Qwiic cable with female jumper ends, 4-pin (or 4-core cable + female jumpers) | 2 + spares | buy | one per sensor, ≤ 50 cm |
| 5 | Female-female jumper wires | 10+ | have? | RST lines, level shifter |
| 6 | Header pins (0.1 in) | 2 | have | one on each XM125's RST pad |
| 7 | Addressable LED strip, 5 V, WS2812B type, 60 LED/m | 2.5 m | have? (action A1) | cut to the ring perimeter, about 2.2 m = 132 LEDs. Confirm the pad labels first |
| 8 | 5 V LED power supply, **≥ 4 A** | 1 | have (action A2: confirm the label) | LED power only |
| 9 | 5 A inline fuse holder and fuse | 1 | buy | on the LED supply's 5 V lead |
| 10 | 18 AWG two-core wire | 3 m | buy/have | LED power to both ends of the strip |
| 11 | 74AHCT125 quad buffer (DIP-14) | 1 | buy before demo | 3.3 V → 5 V LED data |
| 12 | 330 Ω resistor | 1 | buy | LED data line |
| 13 | 1000 µF 10 V electrolytic capacitor | 1 | buy | across the strip's 5V/GND at the input |
| 14 | 1N4001 or 1N4148 silicon diode | 1 | buy/have | bench stopgap only (sacrificial pixel). Not a Schottky |
| 15 | Small breadboard or perfboard | 1 | have? | for the level shifter |
| 16 | 5 V USB-C wall adapter, ≥ 1 A | 1 | have? | powers the ESP32 at demos (no laptop) |
| 17 | Switched power strip | 1 | have? | ESP32 adapter and LED supply switch together (R23) |
| 18 | 3D-printed sensor mounts: vertical, 45° yaw, adjustable tilt | 2 (+1 for C) | print | |
| 19 | Backboard panel behind the rig (plywood or foam board) | 1 | make | review R16 |
| 20 | Foil tape or a small metal plate behind each sensor | 2 | have? | kills rear sensitivity (R16) |
| 21 | Reference target: drink can + printed mat with marked points | 1 | make | calibration C7 |
| 22 | SparkFun XM125 spares (demo insurance) | 2 to 3 | ordering | reflash each with the distance detector on arrival |
| 23 | Tablet (optional) | 1 | have? | investor view over the ESP32 Wi-Fi |
