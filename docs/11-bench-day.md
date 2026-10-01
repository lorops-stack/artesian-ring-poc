# 11 · Bench day: flash, wire, power up

One page to follow on the day. Everything before "Wire it" can be done tonight with no hardware. Fix codes (W1, F1, S1 ...) are in `09-troubleshooting.md`, and Ring Studio shows the same codes with guided steps.

## A. Tonight, no hardware (about 40 minutes)

Run in PowerShell. Skip any tool you already have.

```powershell
winget install --id Git.Git -e
winget install --id Microsoft.VisualStudioCode -e
winget install --id Python.Python.3.12 -e
```

Close PowerShell, open a new one, then:

```powershell
code --install-extension platformio.platformio-ide
New-Item -ItemType Directory -Force "$HOME\code" | Out-Null
cd "$HOME\code"
git clone https://github.com/lorops-stack/artesian-ring-poc.git
cd artesian-ring-poc
python tools\build_ui.py
cd firmware
```

In VS Code: **File, Open Folder**, choose the `firmware` folder. Wait for PlatformIO to finish installing (bottom bar, a few minutes the first time). Then in the PlatformIO panel: **esp32s3, General, Build**.

- **Build succeeds:** done. Run **native, Advanced, Test** too (7 tests pass).
- **Build fails:** copy the red text from the terminal and send it to me. The firmware has been compile-checked against stub headers only, so a first-build fix is likely. Do this tonight, not on bench day.

Also download:
- STM32CubeProgrammer (st.com, free account) and `i2c_distance_detector.bin` (Acconeer developer site, free account, XM125 / A121 software package).
- CH343 driver (wch-ic.com, "CH343SER") if Windows does not recognise the ESP32. CH340 driver ("CH341SER") for the XM125s.

## B. Mount the sensors (wood blocks)

Plan view, facing the sink. y runs from the back edge (0) to the front (533 mm).

| Item | Value |
|---|---|
| Plane | 584 mm (23 in) wide by 533 mm (21 in) deep |
| Sensor A | back-left corner. Ring Studio default position x 0, y 0 |
| Sensor B | back-right corner. x 584 mm, y 0 |
| Spacing A to B | 584 mm between the sensor centres. Mark each module's centre and measure from the marks |
| Yaw | A aims 45° into the plane, B aims 135° (a mirror image of A) |
| Tilt | about 20° down toward the hand |
| Height | both modules at the same height, within 20 mm (P9) |
| Hand level | the default assumes the hand is about 115 mm below the sensor. Keep the hand at one steady height for the first tests |
| Clear space | nothing metal within 600 mm of the beam paths. Put a flat cardboard or wood backboard behind the sensors |
| Rigidity | tighten the blocks so they cannot swing. Wobble shows up as P10 |

Tape the blocks down once positioned. Take a tape-measure reading of: A to B, A to the front-left corner, B to the front-right corner. Keep these numbers; Ring Studio C2 and C3 ask for them, and the fit (C7) corrects small errors.

The 16-hole wand template and foil-ball wand (40 mm ball on a stick, marks at 60 and 160 mm) are in the Calibrate screen, step C7.

## C. Flash the two sensors (one at a time, disconnected from the ESP32)

Follow `05-flash-xm125.md`. Exact settings: UART, 115200, parity **Even**, address `0x08000000`, file `i2c_distance_detector.bin`. Bootloader entry: hold BOOT, press and release RST, release BOOT. Label the boards A and B with a marker when done.

## D. Wire it (stage 1: sensors only, no LED ring)

ESP32 USB unplugged while wiring. Use the table in `03-pinout-and-wiring.md` and the picture `wiring-stage1-sensors.png`:

| ESP32 | Sensor A | Sensor B |
|---|---|---|
| 3V3 | 3V3 | 3V3 |
| GND | G | G |
| GPIO8 / GPIO9 | SDA / SCL | |
| GPIO17 / GPIO18 | | SDA / SCL |
| GPIO6 | RST | |
| GPIO7 | | RST |

Do not plug anything into the sensors' own USB-C ports while they are wired to the ESP32.

## E. Flash the ESP32 and read the first output

1. Plug a data-capable USB-C cable into the ESP32 port marked **COM** or **UART** (CH343). Windows should show "USB-SERIAL CH343" under Ports.
2. In VS Code: **esp32s3, General, Upload**. If it sits at "Connecting....", hold the BOOT button on the ESP32 until it starts, then release.
3. **esp32s3, Platform, Upload Filesystem Image** (this puts Ring Studio on the board).
4. **esp32s3, General, Monitor**. The speed is 921600, already set. Press the board's RST button to see the start-up lines.

Good output looks like this (the numbers will differ; the shape is what matters):

```
[ring] Artesian Ring PoC firmware 0.1.0 · protocol 1 · <date>
[fs] LittleFS 280 kB used of 1500 kB
[cfg] no saved configuration, using defaults
[A] distance detector 1.x.x
[A] configure OK (status 0x...)
[B] distance detector 1.x.x
[B] configure OK (status 0x...)
[wifi] AP ArtesianRing up on channel 6, http://192.168.4.1
[wifi]  TEMPORARY Wi-Fi password: xxxxxxxx
[web] server started
[ring] running. Echo lists print here until Ring Studio connects.
A: 1 echo  412 mm (str 5300)   B: 2 echos  405 mm (str 6100) ...   24.1 Hz  IDLE
```

Move your hand in front of each sensor and watch its distance change (that is test T3). Wave at A only: only A's numbers should change.

| You see | Meaning | Go to |
|---|---|---|
| `[A] not found on the bus` | no I2C answer: wiring or power | W1 |
| `[A] distance detector ...` then `configure FAILED` | the module is still on the presence firmware, or a setup error | F1, F2 (reflash per section C) |
| `(no answer)` after the line above | measurements time out | W2, W1 |
| Board restarts in a loop | brown-out or cable | W5 |
| Nothing in the monitor | wrong COM port or charge-only cable | W8 |
| Upload stuck at "Connecting" | hold BOOT while it starts | F5 |

## F. Ring Studio

1. On the phone or laptop, join Wi-Fi **ArtesianRing** with the temporary password from the monitor.
2. Open `http://192.168.4.1`. The Setup screen asks for your own Wi-Fi password and a studio PIN. Write them down; they are never stored in the repo.
3. Open **Calibrate** and run C0 (hardware check), then C2 and C3 with your tape-measure numbers, then C6 (empty-sink background, keep hands and tools out), then C7 (wand) and C8 (hand profile).
4. Run tests T1 to T4 from the **Tests** screen.

## G. Last: the LED ring

Only after section F passes. Follow `wiring-stage2-leds.png`. Use the separate 5 V supply for the strip, and join its ground to the ESP32 ground. Checkpoint photos of the strip's pads and the supply label first (build guide step with the photo checkpoint).

## H. Things that can still surprise us on the day

- Sensor distances look wrong but steady: normal before C7. The wand fit corrects the offset and small angle errors.
- Changing range or sensitivity in Settings makes the firmware reset and re-configure both sensors. Keep the sink empty for about 3 seconds afterwards.
- If the monitor shows garbage characters, the monitor speed is not 921600.
