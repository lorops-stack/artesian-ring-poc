# 04 · Bill of Materials

| # | Item | Qty | Status | Notes |
|---|---|---|---|---|
| 1 | ESP32-S3-N8R2 dev board (YD-ESP32-S3 layout) | 1 | have | |
| 2 | SparkFun XM125 A121 radar breakout (Qwiic) | 2 | have | third was defective |
| 3 | SparkFun XM125, replacement | 1 | future fix | review R6: front-centre sensor removes the hand-height error |
| 4 | Qwiic cable with female jumper ends, 4-pin (or 4-core cable + female jumpers) | 3 | buy | one per sensor, ≤ 50 cm |
| 5 | Female-female jumper wires | 10+ | have? | RST lines, shifter |
| 6 | Header pins (0.1 in) | 2 | have | one on each XM125's RST pad |
| 7 | Addressable LED strip, 5 V (WS2812B/SK6812) | 2.5 m | have (confirm pad labels) | cut to the ring perimeter (~2.2 m) |
| 8 | 5 V power supply, ≥ 3 A | 1 | have | LED power only |
| 9 | 74AHCT125 quad buffer (DIP-14) | 1 | buy before demo | 3.3 V → 5 V LED data. Stopgap for bench work: sacrificial pixel + 1N4001/1N5819 diode (see doc 03) |
| 10 | 330 Ω resistor | 1 | buy | LED data line |
| 11 | 1000 µF 10 V electrolytic capacitor | 1 | buy | across strip 5V/GND |
| 12 | Small breadboard or perfboard | 1 | have? | for the shifter |
| 13 | 3D-printed sensor wedge mounts (45° yaw, adjustable tilt) | 2 (3) | print | |
| 14 | Reference target: drink can + printed floor mat with marked points | 1 | make | calibration C7 |
| 15 | Tablet (optional) | 1 | have? | investor view over the ESP32 Wi-Fi |
| 16 | SparkFun XM125, spare (demo insurance) | 1 | recommended (Q8) | separate from item 3 |
| 17 | Backboard panel behind the rig (plywood or foam board) | 1 | make | review R16 |
| 18 | Foil tape or small metal plate behind each sensor | 2 | have? | kills rear sensitivity (R16) |
| 19 | 1N4001 or 1N5819 diode | 1 | buy/have | sacrificial-pixel stopgap |
| 20 | Switched power strip | 1 | have? | ESP32 and LEDs on together (R23) |
