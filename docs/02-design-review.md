# 02 · Design Review

Review of the whole approach before any build work. Issues are ranked by what they would do to the demo. Each one has a fix, and the fixes are already written into `01-design-spec.md` unless marked **DECISION**.

Geometry numbers come from `tools/geometry_sim.py` (run it: `python tools/geometry_sim.py`).

---

## Critical: these would break the demo if ignored

### R1. "First zone entered" latches the wrong function
Hands reach in from the front. To get to the soap (back-left), the hand crosses the Hot zone first. A literal first-zone latch turns on Hot every time someone reaches for soap or cup fill.
**Fix:** latch on *settle*. The hand must stay in one zone for ~150 ms and slow below ~250 mm/s. Passing through is ignored. This costs about 150 ms of latency, and total entry-to-on should still land under 300 ms. The thresholds get tuned on the bench.

### R2. A pot, cup or dish left in the sink looks like a hand
Radar sees any object. Put a pot in the sink and the system believes a hand is still there, so the water never turns off. In a real kitchen with a slow drain, that's a flood.
**Fix, three layers:**
1. Presence needs a live-hand signature (small continuous movement in the range data). A still object does not hold a function on by itself.
2. Any target that stays perfectly static for 5 s is absorbed into the background.
3. Hard max-run timers per function, reset only by hand movement.

These have to be balanced against fail-on: a person holding a cup perfectly still under cup fill must not be cut off, and cup fill ends on volume anyway. Investors *will* put things in the sink, so this gets tested on purpose.

### R3. The ADDR jumper on the XM125 does nothing yet
SparkFun's documentation says the address-change function is "to be implemented in the future". Both boards are fixed at **0x52**, so they cannot share one I2C bus.
**Fix:** each sensor gets its own I2C bus (the ESP32-S3 has two). This is already in the pin layout, and no soldering of jumpers is needed.

### R4. The boards ship with the wrong firmware for this job
SparkFun preloads the **presence detector**. It reports "someone is there" and a rough distance, and it can lose a hand held still. Trilateration needs the precise distance-to-nearest-object reading from the **distance detector** firmware.
**Fix:** reflash both boards with `i2c_distance_detector.bin` (about 10 minutes each, steps in `05-flash-xm125.md`). Presence is then derived from the distance data, which gives a single consistent signal.

### R5. Default sensor range starts at 250 mm, and the corner zones are closer than that
The centre of the Soap zone is **132 mm** from sensor A, and Cup fill is 132 mm from B. With the default settings, both zones are invisible to their nearest sensor.
**Fix:** configure the start range at 60 mm. Close-range leakage cancellation is on by default. The bench test in Phase 0 must confirm a clean reading from 60 mm.

### R6. Two range-only sensors cannot see hand height
Each sensor measures straight-line distance. Two distances pin down left/right and front/back only if hand height is known. People hold their hands at different depths in the basin. Simulation, 10 mm range noise, hand depth varying 30 to 200 mm, inner 70% of each zone:

| Zone | Geometry only | With calibration fingerprint |
|---|---|---|
| Back row (Soap, Disposal, Cup fill) | 90 to 91% | 96 to 97% |
| Middle row | 97 to 98% | 93 to 95% |
| Front row | ~99.8% | ~99% |

Range noise on its own is not the problem (under 25 mm position error everywhere, against zones 178 to 195 mm wide). **Hand depth is.**
**Fix:**
- Use both methods and latch only when they agree.
- Settle-based latching (R1) removes most transition errors.
- Tilt the sensors down so the beam covers a narrower depth band.

**DECISION:** replace the defective third board and mount it at front-centre, as originally planned. With a third range the height unknown disappears, and back-row accuracy should go above 99%. The firmware and pin layout reserve a third I2C device slot (on bus 0 via a multiplexer, or a software I2C bus), so adding it later is a config change. Recommended before any investor demo.

---

## Important: these would make the demo look unreliable

### R7. Metal basin reflections and multipath
A stainless basin is a mirror at 60 GHz. It creates strong static echoes and ghost echoes *behind* the real hand.
**Fix:**
- Record the empty-sink background (the detector's "recorded threshold") during calibration.
- Always use the **nearest** peak above the threshold, since ghosts are always further away.
- Recalibrate when the sensor raises its CALIBRATION_NEEDED flag (temperature drift).
- Re-record the background automatically after 30 s of empty sink.

### R8. Two hands, or hand plus forearm
Each sensor reports its own nearest point, and A and B may be looking at different hands. The pair of distances then describes a spot where no hand is.
**Fix:** a consistency check. The trilateration position must agree with the calibration match (the "residual" figure in the UI). Frames that fail are flagged and can never latch. Once latched, two hands don't matter.

### R9. The two radars can interfere with each other
**Fix:** measure A, then B, never at the same time. This halves the maximum frame rate, which is why Phase 0 must measure the real rate. The target is ≥ 20 Hz per sensor.

### R10. Rings, watches and different hands
Metal jewellery is a strong reflector, and investors will try it with their own hands.
**Fix:** calibrate on a bare hand, then run the accuracy test (F16) with at least 5 different people, including watches and rings, before the demo.

### R11. LED ring power
The ring perimeter is about 2.2 m. At 60 LEDs/m that is ~134 LEDs, up to ~8 A at full white. USB cannot supply that, and the ESP32 cannot drive 5 V data reliably from a 3.3 V pin.
**Fix:**
- A separate 5 V 4 A supply, with firmware capping brightness to stay under 3 A.
- A 74AHCT125 level shifter on the data line, a 330 Ω series resistor and a 1000 µF capacitor at the strip.
- A common ground with the ESP32.

### R12. Venue Wi-Fi and laptop dependency
Conference and office Wi-Fi is unreliable, and WebSerial only works in desktop Chrome or Edge (not on an iPad).
**Fix:** the ESP32 runs its own Wi-Fi access point and serves the UI itself. Any browser joins "ArtesianRing". USB WebSerial remains as the backup.

### R13. Something hangs mid-demo
**Fix:**
- The ESP32 watchdog restarts the firmware.
- A hung XM125 gets hard-reset through its RST pin (wired to an ESP32 GPIO).
- The UI reconnects automatically.
- Record and replay (F11) lets you show a genuine captured session if the hardware fails on the day.

### R14. Cloud dashboard (F17)
A cloud link needs internet at the venue, accounts and a backend. That is weeks of work, and it makes the demo depend on the network you are trying to avoid (R12).
**Fix:** the usage dashboard (F15) runs locally on the ESP32 and exports CSV. Cloud sync is Phase 3 and optional. The investor story does not need it.

---

## Product-level: not needed for the dry demo, but investors may ask

- **P1. Water film on the sensor window.** 60 GHz is strongly absorbed by water. In the wet product, a film of water sheeting over the sensor window will weaken or blind it. Put the sensors where spray does not run over them, and test this on the wet rig early. This is the biggest open technical risk for production.
- **P2. Radome design.** Resin over the sensor must be free of metallic pigment. Its thickness should be tuned to the radar wavelength in that resin: for a resin with a dielectric constant around 3, multiples of ~1.4 to 1.5 mm. That number must be verified against the actual resin.
- **P3. Scald risk.** An accidental Hot latch is a scald risk. The product needs a thermostatic cap (120 °F / 49 °C is the common anti-scald limit). The demo shows the cap on screen.
- **P4. Touchless disposal.** Expect regulatory and safety scrutiny. The demo's hold-to-start, fixed-run and stop-on-other-zone rules are the starting position.
- **P5. Reach.** The back row is 21 in away. For seated or shorter users, Soap and Cup fill are the hardest zones to reach. The layout options (F10) partly answer this, and accessibility is a strong selling point if addressed deliberately.
- **P6. Power loss.** The production valves must close when unpowered.
- **P7. Privacy as a selling point.** No camera and no optics. Radar sees distance, not faces. Put this in the pitch.

---

## Open decisions for Nathan

| # | Question | Recommendation |
|---|---|---|
| Q1 | Replace the defective third XM125 and mount it front-centre? | **Yes**, before any investor demo (R6) |
| Q2 | Disposal rules: 1 s hold, fixed 15 s run, stop if a hand settles elsewhere. Acceptable? It runs without a hand in the sink, which is an exception to the "all off 1 s after hands leave" rule | Yes |
| Q3 | Zones for the 3×2 and 3 back + 1 front layouts (spec section 3) | Confirm or change |
| Q4 | Design flow rate for simulated water (1.5 gpm assumed) | Confirm the Artesian product figure with Rod |
| Q5 | Temperatures shown in °F, °C or both | °F with a °C toggle (US investors) |
| Q6 | Existing Ring Studio UI in `lorops-stack/ring-prototype`: reuse its styling and assets, or rebuild fresh to match the screenshot? | Share access so the look carries over; the code is rebuilt either way |
