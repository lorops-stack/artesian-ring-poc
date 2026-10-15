# 02 · Design Review

Review of the whole approach before any build work, revision 3 (30 Sep 2026). There were four passes:
1. The first review (R1–R14).
2. A final gap review (R15–R24).
3. An independent review of every document and prototype (R25–R31). This pass also corrected earlier items in place.
4. A simulation check of the calibration (R32).

Every fix below is already written into `01-design-spec.md` or the other docs. The open actions at the end are the only things not yet done.

Geometry numbers come from `tools/geometry_sim.py` (run it: `python tools/geometry_sim.py`).

---

## Critical: these would break the demo if ignored

### R1. "First zone entered" latches the wrong function
Hands reach in from the front. To get to the soap (back-left), the hand crosses the Hot zone first. A literal first-zone latch turns on Hot every time someone reaches for soap or cup fill.
**Fix:** latch on *settle* (spec 4.1). The hand must stay in one zone for 150 ms, below 250 mm/s for that whole time. Passing through is ignored. The thresholds get tuned on the bench.

### R2. A pot, cup or dish left in the sink looks like a hand
Radar sees any object. Leave a pot in the sink and the system could believe a hand is still there, so the water never turns off. In a real kitchen with a slow drain, that is a flood.
**Fix (spec 4.4), decided by Nathan (Q9):** a real hand is never perfectly still. Anything perfectly still for 10 s is an object: the water turns off and the session ends. That covers a pot left under running water, a cup set down after Cup fill, and a plate left in the sink. A session can only start on a moving target, so an object already in the sink never starts water. The still-hand threshold is measured in calibration, and T28 must show a clear gap between a still hand and a real object before the rule is trusted.

Investors *will* put things in the sink, so this is tested on purpose (T9, T18, T21).

### R3. Both XM125 boards answer at the same I2C address
SparkFun's documentation says the ADDR jumper's function is "to be implemented in the future", so both boards sit at **0x52** and cannot share one I2C bus.
**Fix:** each sensor gets its own I2C bus (the ESP32-S3 has two). No jumper soldering.
**Bench check (T1):** Acconeer's own I2C guide may document address selection through an address pin (not yet confirmed). If SparkFun's ADDR pad turns out to work with the distance detector firmware, the third sensor gets simpler. Until that is proven, the two-bus design stands.

### R4. The boards ship with the wrong firmware for this job
SparkFun preloads the **presence detector**. It reports "someone is there" and a rough distance, and it can lose a hand held still. Trilateration needs the precise echo distances from the **distance detector** firmware.
**Fix:** reflash every board with `i2c_distance_detector.bin`, including the spares on arrival (`05-flash-xm125.md`).

### R5. Default sensor range starts at 250 mm, and the corner zones are closer than that
The centre of the Soap zone is **132 mm** from sensor A, and Cup fill is 132 mm from B. With the default settings, both zones are invisible to their nearest sensor.
**Fix:** set the start range to 60 mm, with close-range leakage cancellation on. T3 must confirm a clean reading from 60 mm.

### R6. Two range-only sensors cannot see hand height
Each sensor measures straight-line distance. Two distances pin down left/right and front/back only if hand height is known, and people hold their hands at different depths in the basin. Range noise alone is not the problem: under 25 mm of position error everywhere, against zones 178 to 195 mm wide (`tools/geometry_sim.py`). **Hand height is.**

Calibration reduces this but cannot remove it (R32). The best two sensors can do, with perfect calibration and hands anywhere from 40 to 160 mm below the ring, is about 96% in the back row and 99.7% or better in the other two.

**Fix:**
- The hand profile (C8) measures the working hand height for this sink and these users.
- The settle rule (R1) removes most errors during movement.
- A downward sensor tilt narrows the range of heights the sensors see.
- Zone edges can be moved in the zone editor (C9).

**Risk this leaves open:** the **back row** is the weakest (about 96%), and in some installations a single back-corner zone falls below the 93% floor. Test the back row first (T5). If it falls short, widen the back row in C9 before a demo.

**FUTURE FIX (logged 30 Sep 2026):** a front-centre third sensor removes the height unknown and should take every row above 99%. The pins are reserved (GPIO10/11/12). It will be read by switching one hardware I2C controller between pin pairs (all sensors are read one after another anyway), or through a TCA9548A I2C switch. Bit-banged I2C is not used, because the XM125 stretches the clock.

---

## Important: these would make the demo look unreliable

### R7. Metal basin reflections and multipath
A stainless basin is a mirror at 60 GHz. It creates strong static echoes and ghost echoes *behind* the real hand.
**Fix:**
- The sensor's recorded threshold is captured during calibration with an empty sink (C6).
- Echo association (spec section 6) picks the A/B pair that forms a hand-sized target inside the sink. When two pairs qualify it takes the nearer one, since ghosts are always further away.
- Sensor recalibration (the CALIBRATION_NEEDED flag, temperature drift) and the 30 s background refresh run only in IDLE with no echoes present.

### R8. Two hands, or hand plus forearm
A and B may each report a different hand, and the pair of distances then describes a spot where no hand is.
**Fix:** echo association checks every A/B pair, not just the nearest from each. A frame is flagged, and can never latch, if either echo is outside a real hand's echo-strength range (measured in C8) or the position jumps further than a hand can move in one frame. Once latched, two hands don't matter.

### R9. The two radars can interfere with each other
**Fix:** measure A, then B, never at the same time. This halves the maximum frame rate, so Phase 0 measures the real rate (T2). Target ≥ 20 Hz per sensor.

### R10. Rings, watches and different hands
Metal jewellery is a strong reflector, and investors will try it with their own hands.
**Fix:** calibrate on a bare hand, then run the accuracy test (F16) with at least 5 people, including watches and rings.

### R11. LED ring power
About 2.2 m at 60 LEDs/m is **132 LEDs**, up to about 8 A at full white. USB cannot supply that, and the ESP32's 3.3 V data signal is marginal for a 5 V strip.
**Fix:**
- A separate 5 V supply of **at least 4 A**, with firmware capping brightness (90/255, about 2.8 A worst case).
- Power fed in at **both ends** of the strip with 18 AWG wire, and a 5 A inline fuse on the supply's 5 V lead.
- A 74AHCT125 level shifter on the data line, a 330 Ω series resistor and a 1000 µF capacitor at the strip.
- A common ground with the ESP32.

### R12. Venue Wi-Fi and laptop dependency
Conference Wi-Fi is unreliable.
**Fix:** the ESP32 runs its own WPA2 access point and serves Ring Studio itself, so tablets and phones join "ArtesianRing" directly. See R29 for what plain http cannot do.

### R13. Something hangs mid-demo
**Fix:**
- The ESP32 watchdog restarts the firmware.
- A hung XM125 is hard-reset through its RST pin, which is **required wiring** (GPIO6 and GPIO7).
- The UI reconnects automatically.
- If the ESP32 itself fails, the laptop copy of Ring Studio replays a recorded session (R29).

### R14. Cloud dashboard (F17)
A cloud link needs internet at the venue, accounts and a backend. That is weeks of work, and it makes the demo depend on the network you are trying to avoid.
**Fix:** the dashboard (F15) keeps its history in the viewing browser and exports CSV. Cloud sync is Phase 3 and optional.

---

## Final gap review

### R15. The user's own body is inside sensor range (critical)
The sensors look out to 850 mm. Someone standing at the sink puts their torso about 670 to 780 mm from each sensor, so the radar sees them.
- **Standing upright:** the torso sits outside the sink area and plane gating ignores it (F19). "Hand gone" is defined on the fused, gated target, not on raw echoes. Without that, a person standing at the sink would keep the water on forever (R25).
- **Leaning over the counter is the danger.** A chest just over the front edge lands inside the front row and could trigger Hot, Warm or Cold. The defences are:
  - the downward sensor tilt;
  - latching only on a settled, hand-sized target;
  - testing it deliberately (T7).

  The future third sensor solves it properly.

### R16. Anything behind the sink mirrors into the sink (critical for an island-style demo table)
Two sensors on the back edge cannot tell "in front of the back edge" from "behind it". A person walking 400 mm behind the rig appears as a hand in the **Warm** zone. Plane gating cannot catch this.
**Fix:**
- Put the rig's back edge against a wall or a solid backboard, which is then just background.
- Fit a foil-backed shield behind each sensor.
- Keep people from walking behind the rig.

### R17. Sensor board orientation
The A121 radiates out of the **top face** of the module (the side with the XM125 can), not the board edge.
**Fix:** mount each board vertically, module face toward the sink, then yaw 45° inward and tilt down. Nothing metal in front of the module.

### R18. Soap is a one-shot
**Decided (Q7):** a single dose, then the latch releases, so the next settled zone starts the rinse without leaving the sink. Soap stays blocked for the rest of the session (until the exit countdown completes, even if the disposal is still running).

### R19. Only two sensors
If one XM125 fails on demo day, live tracking is gone.
**Fix:** 2 to 3 spare boards are on order (Q8), each reflashed on arrival. The laptop replay (R29) is the last fallback.

### R20. Venue setup changes the calibration
A different table, a metal stand or a different room changes the background echoes.
**Fix:** recalibrate on site every time. A full calibration takes about 15 minutes, plus a 5 minute quick check (C11). It is on the pre-demo checklist, so allow 30 minutes of setup.

### R21. Wi-Fi access point security
**Fix:**
- The access point uses WPA2.
- The password is set on first boot from Ring Studio and stored on the ESP32. It is never committed to the repo.
- The calibration studio is PIN-locked in presentation mode.

### R22. Firmware updates without crawling under the sink
**Fix:** over-the-air update from Ring Studio (F18).

### R23. Power sequencing
With the LED supply on and the ESP32 unpowered, the strip's data line can back-feed the ESP32 pin.
**Fix:** the ESP32's 5 V USB-C wall adapter and the LED supply plug into **one switched power strip**, so they come on and off together.

### R24. No toolchain setup or test plan existed
**Fix:** `06-setup-windows.md` and `07-test-and-demo-plan.md`.

---

## Independent review

### R25. When the hands leave, and when "off" is measured from
Two problems:
- Counting "gone" on raw echoes would never fire while a person stands at the sink, because the torso keeps echoes in range.
- Confirming "gone" over 3 frames adds about 150 ms, which breaks the 1.0 s ± 0.1 s target.

**Fix (spec 4.1):** "gone" is defined on the fused, plane-gated target. The 1.0 s countdown is timed from the last frame the hand was seen. T19 checks this with the person still standing at the sink.

### R26. The sensor firmware reports echoes, not the raw radar signal
Over I2C, the distance detector gives up to 10 echoes (distance and strength) per measurement. It does not give the raw sweep or its internal threshold. Several features first assumed the raw signal.
**Fix:** F1, C6, the background learning and R2 are all rewritten on echo lists (spec sections 4.4, 6 and 7). Getting the raw signal would need different sensor firmware. That is a scope change, and it is not planned.

### R27. The state machine had gaps, and the prototypes had bugs from them
- The disposal restarted by itself when its 15 s ran out with a hand still over it.
- The soap block leaked into the next person's session when the disposal was running as they left.
- The state diagram did not cover cup full, the disposal, objects left in the sink, clean mode or layout changes, and it disagreed with the rules on what happens when a hand leaves while tracking.

**Fix:** spec section 4 now defines every state and transition in tables. The key points:
- The disposal never restarts in the same session.
- Settling in **any** other zone, Neutral included (it sits over the drain), stops it.
- Soap and disposal locks clear when the session ends.

A second check closed the remaining gaps:
- A cup set down under Cup fill, or a pot left in the sink, used to lock the sink until removed. The 10 s stillness rule (Q9) now ends the session.
- A disposal left running from the last session follows the same rules.
- Clean mode ends the session.

The prototype bugs are fixed, including the demo loop cutting a real disposal short. These tables are the spec for the firmware unit tests.

### R28. Calibration only covered the Kitchen layout
A 9-zone fingerprint cannot serve the Bathroom (6 zones) or Accessible (5 zones) layouts.
**Fix:** calibration now measures the **sensor geometry and the working hand height** (C7, C8), not zones. Positions are then worked out the same way for any layout. Exact zone boundaries for every layout are in spec section 3. Neither Bathroom nor Accessible has a Neutral zone, so clean mode there starts from the UI or the BOOT button.

### R29. What plain http cannot do
Ring Studio is served from `http://192.168.4.1`, which browsers do not treat as secure. As a result:
- It cannot install as an offline app, so tablets use an "Add to Home Screen" bookmark instead.
- Web Serial is blocked.
- If the ESP32 fails, there is no UI at all.

**Fix:** a laptop copy of Ring Studio, run locally from the repo's `ui/` folder, is the backup. It has USB Web Serial and plays recorded sessions.

### R30. The water-saved number has to survive a sceptical investor
Most of the simple "saved" figure comes from choosing 1.5 gpm, which any low-flow faucet also achieves.
**Fix:** F9 shows two parts: water saved by turning off when hands are out, and water saved by the flow rate, with both assumptions on screen. The demo loop never adds to it (F25).

### R31. The accuracy target has to be measurable as defined
The first target ("inner 70% of each zone") could not be controlled in a natural-reach test, and the on-site check could not meet the full bar.
**Fix:**
- Section 1 now defines the target on trials aimed at a target dot at the zone centre: ≥ 97% overall, no zone below 93%.
- The quick on-site check (5 trials per zone, all pass) is separate from the full bench validation.

---

### R32. Does the calibration actually correct what we intend? (simulation check)
`tools/calibration_sim.py` simulates 40 installations. Each one has sensors mounted up to about 15 mm off their measured positions (in x, y and z), a 10 to 35 mm distance offset per sensor (deliberately generous; a bare sensor or thin cover will usually be smaller), 8 mm reading noise, and real hands at varying heights. Zone accuracy (Kitchen layout):

| Calibration applied | Back row | Middle | Front | Overall | Worst zone in any install |
|---|---|---|---|---|---|
| None | 83.4% | 94.0% | 98.9% | 92.1% | 23% |
| Wand only (C7) | 95.9% | 99.1% | 99.9% | 98.3% | 87% |
| Wand + hand profile (C7 + C8) | 95.7% | 99.6% | 99.9% | 98.4% | 84% |
| Old plan: + position-correction map | 76.0% | 99.1% | 99.9% | 91.7% | 0% |
| Physical limit (perfect calibration) | 96.2% | 99.7% | 100% | 98.6% | 88% |

With hands held high (20 to 80 mm below the ring), the default height guess is wrong. There the wand alone gives 96.0%, and adding the hand profile lifts it to **99.6%** (limit 99.7%).

What this showed:
1. **Calibration is essential.** Without it, the back row fails.
2. **The original reference check (a drink can at 3 to 5 points on the basin floor) could not work.** Too few points at one height cannot separate a sensor's position from its distance offset. The basin floor is curved, and a can reflects from its near surface, not its centre. It is replaced by the wand and template (C7). With the tape-measured positions as a soft guide, the fit finds each sensor to within about 12 mm (median).
3. **The planned position-correction map made things worse.** It learned from human hand placement, which is off by about as much as the errors it was meant to fix. It is removed.
4. **The hand profile matters most when hands sit at an unusual height.** It is kept, but it measures the working hand height, a real hand's echo strength and a still hand's small movements, not a map.
5. **Calibration cannot fix hand-height ambiguity.** The back-row limit of about 96% is physics with two sensors (R6).

**Check on the real rig:** the C7 fit error must be below 12 mm RMS (T29), and the accuracy test (T5) must land near these figures. A big gap means the sensor model is wrong, and it must be found before any demo.

## Product-level: not needed for the dry demo, but investors may ask

- **P1. Water film on the sensor window.** 60 GHz is strongly absorbed by water. A film of water sheeting over the sensor window will weaken or blind it. Put the sensors where spray does not run over them, and test on the wet rig early. This is the biggest open technical risk for production.
- **P2. Radome design.** Resin over the sensor must be free of metallic pigment. Its thickness should be tuned to the radar wavelength in that resin: about 1.4 to 1.5 mm multiples for a dielectric constant around 3, to be verified on the actual resin.
- **P3. Scald risk.** The product needs a thermostatic limit. The demo uses a 110 °F set point with a 120 °F / 49 °C cap, the common anti-scald limit.
- **P4. Touchless disposal.** Expect regulatory scrutiny. The demo's hold-to-start, fixed-run, stop-on-any-zone and no-restart rules are the starting position.
- **P5. Reach.** The back row is 21 in away. The Accessible layout answers this for seated users.
- **P6. Power loss.** The production valves must close when unpowered.
- **P7. Privacy as a selling point.** No camera and no optics. Radar sees distance, not faces.

---

## Decisions (resolved 30 Sep 2026)

| # | Question | Decision |
|---|---|---|
| Q1 | Third XM125 at front-centre | Two sensors for now; third logged as a future fix |
| Q2 | Disposal rules | 1 s hold, fixed 15 s, stops if a hand settles in any other zone, no restart in the same session, keeps running after hands leave (the one exception to the 1 s off rule) |
| Q3 | Layouts | Kitchen 3×3, Bathroom 3×2 without disposal, Accessible 2+3 without disposal or waterfall; Hot/Warm/Cold in every layout |
| Q4 | Simulated flow rate | 1.5 gpm |
| Q5 | Temperature units | °F default with a °C toggle |
| Q6 | UI look | Fresh build to the Ring Studio UI design canvas (spec 8b) |
| Q7 | Soap | Single dose; the latch releases after the dose |
| Q8 | Spare XM125s | Ordering 2 to 3 spares |
| Q9 | Objects left in the sink | Anything perfectly still for 10 s is not a hand: water off, session ends (replaces the 2-minute max-run timer) |

## Open actions before build

| # | Action | Owner |
|---|---|---|
| A1 | Read the pad labels on both LED strips (`03-pinout-and-wiring.md`). If neither is a 5 V addressable strip, add one to the buy list | Nathan |
| A2 | Confirm the LED supply's label says 5 V and at least 4 A | Nathan |
| A3 | Pick the standard hand marker style (default: Focus lock) | Nathan |
| A4 | Create the private repo and push the history | **Done 30 Sep 2026** (`lorops-stack/artesian-ring-poc`, private) |
| A5 | Order the parts marked "buy" in `04-bom.md` | Nathan |
| A6 | Follow `08-build-guide.md` from Step 1 | Nathan |
