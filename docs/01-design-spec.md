# 01 · Design Spec

Status: **DRAFT for review, revision 2 (30 Sep 2026).** No build work starts until this and `02-design-review.md` are signed off.

## 1. What we are proving

A faucetless sink ring can tell which zone a hand is in, using radar only (no camera, no optics), fast and reliably enough that a person uses it without thinking. The ring then runs the matching water function and holds it safely until the hands leave.

The demo is **dry**: no pump and no water. The screen and the LED ring show what the water would be doing.

Success criteria for the live demo, measured with the accuracy test (F16) and the bench tests in `07-test-and-demo-plan.md`:

| Metric | Target | How it is measured |
|---|---|---|
| Zone accuracy at latch | ≥ 97% overall, no single zone below 93% | F16: tester aims at the zone centre (the UI shows a target dot), reaching in naturally from the front; 5+ people |
| Hand entry to function on | ≤ 300 ms | From the first frame the hand is confirmed in the sink to the function starting, for a hand going straight to its zone and stopping |
| False-off while a hand is in the sink | 0 in a 10 minute session | T6 |
| Off after hands leave | 1.0 s ± 0.1 s | From the last frame the hand was seen to all water off |
| Cold boot to ready, no laptop | ≤ 10 s | T15 |

Known risk: with two sensors, simulation of calibrated installations (`tools/calibration_sim.py`) gives about 98% overall, but the **back row** is the weakest (about 96%). If people's hand heights vary widely, a single back-corner zone can fall below the 93% floor. See review R6 and R32.

## 2. Physical setup

- Sensing area: sink opening **584 × 533 mm (23 × 21 in)**. Origin = back-left corner, x to the right, y toward the user.
- **Sensor A:** back-left corner. **Sensor B:** back-right corner. Both sit in the ring at counter level, aimed at the sink centre (45° inward) and tilted down about 20° into the basin (tilt to be tuned on the bench).
- Sensor boards mount **vertically, module face toward the sink** (review R17). The back edge of the rig sits against a wall or backboard (review R16).
- Two sensors only. The third board was defective. A front-centre third sensor is logged as a future fix (review R6), and the pin layout reserves it. Spare boards are on order (review R19).
- Controller: ESP32-S3-N8R2 dev board (VCC-GND YD-ESP32-S3 layout), in a dry spot under or behind the ring. Demo power: a 5 V USB-C wall adapter. The laptop is only for programming.
- Ring LEDs: addressable 5 V strip (WS2812B type), 60 LEDs/m, about 2.2 m = **132 LEDs**, fed with power at both ends.

## 3. Layouts and zones (facing the sink)

Zone boundaries are fractions of the sensing area: x from left (0) to right (1), y from back (0) to front (1). All three layouts are decided (30 Sep 2026) and switch live. Hot, Warm and Cold appear in every layout.

**Kitchen (3 × 3).** Columns and rows are equal thirds.

| | Left (0–⅓) | Centre (⅓–⅔) | Right (⅔–1) |
|---|---|---|---|
| **Back (0–⅓)** | Foaming soap | Garbage disposal | Cup fill |
| **Middle (⅓–⅔)** | Waterfall | Neutral | Waterfall |
| **Front (⅔–1)** | Hot | Warm | Cold |

**Bathroom (3 × 2): no disposal, no Neutral.** Columns are equal thirds; rows split 50/50.

| | Left | Centre | Right |
|---|---|---|---|
| **Back (0–0.5)** | Foaming soap | Waterfall | Cup fill |
| **Front (0.5–1)** | Hot | Warm | Cold |

**Accessible (2 back + 3 front): no disposal, no waterfall, no Neutral.** The back row is 40% of the depth, split into two equal halves. The front row is 60% of the depth, split into thirds.

| | | | |
|---|---|---|---|
| **Back (0–0.4)** | Foaming soap (x 0–0.5) | | Cup fill (x 0.5–1) |
| **Front (0.4–1)** | Hot (0–⅓) | Warm (⅓–⅔) | Cold (⅔–1) |

The Accessible layout replaced the first idea of "3 back + 1 front". Four zones cannot hold the five required functions, and the most-used functions need to be nearest a seated user. Every zone is larger, which gives bigger targets.

## 4. Behaviour: the latch state machine

This section is the specification for the firmware state machine and its unit tests. The UI shows the states as:
- **Idle** = IDLE
- **Tracking** = ARMING
- **Active** = ACTIVE or CUP_FULL, or a running disposal with nothing else latched
- **Off in 1 s** = EXIT_PENDING
- **Cleaning** = CLEAN

### 4.1 Definitions

- **Hand present:** the fused target (section 6: one echo from A and one from B that together form a hand-sized target inside the sensing area) exists. Raw echoes from either sensor on their own never count. So a person standing at the sink with their hands out is "no hand".
- **Hand gone:** no fused target for `GONE_FRAMES` (3) consecutive frames. The off countdown is timed from the **last frame the hand was seen**, so the off time is not delayed by the confirmation frames.
- **Settled in a zone:** the hand has been inside the zone (20 mm inside its edges) for `SETTLE_MS` (150 ms), with speed below `SETTLE_SPEED` (250 mm/s) for that whole time. If speed goes above the limit, the settle timer restarts. The Disposal hold uses the same rule with 1000 ms.
- **Hand back:** during EXIT_PENDING, one frame with the hand present cancels the countdown (bias to staying on). From IDLE, a new session needs `PRESENT_FRAMES` (2).
- **Session:** from IDLE → ARMING until the exit countdown completes. Soap block and disposal lockout last for one session.

### 4.2 States

| State | Meaning | Water | LED ring |
|---|---|---|---|
| IDLE | No hand | Off | Slow idle chase |
| ARMING | Hand present, no function latched | Off | Fills outward in the zone colour as the hand settles |
| ACTIVE(fn) | fn is Hot, Warm, Cold, Waterfall or Cup fill | On | Solid function colour |
| CUP_FULL | Cup fill reached its volume; still latched | Off | Cup colour, slow pulse |
| EXIT_PENDING | Hand gone, 1.0 s countdown | As before | Retracts around the ring as the countdown |
| CLEAN | 60 s pause for wiping the sink | Off | White, slow breathe |
| DISPOSAL_RUN | Runs **in parallel** with the states above, on its own 15 s timer | n/a | Amber sweep at the back centre |

### 4.3 Transitions

| From | Event | To | Also |
|---|---|---|---|
| IDLE | A **moving** target present for 2 frames | ARMING | Session starts; entry time recorded for F3. A target that appears without moving never starts a session |
| ARMING | Settled in Hot, Warm, Cold, Waterfall or Cup fill | ACTIVE(fn) | |
| ARMING | Settled in Soap, soap not yet used this session | ARMING | One dose; Soap blocked for the rest of the session |
| ARMING | Hand held still 1.0 s in Disposal, disposal not yet used this session | ARMING | Starts DISPOSAL_RUN; disposal locked for the rest of the session |
| ARMING | Settled in Neutral (Kitchen only) | ARMING | Nothing. Held still 3 s in Neutral starts CLEAN |
| ACTIVE(fn) | Hand moves anywhere in the sink | ACTIVE(fn) | The latch holds; other zones are ignored |
| ACTIVE(cup) | Volume reached | CUP_FULL | |
| ARMING, ACTIVE, CUP_FULL | Target perfectly still for `STILL_OFF_MS` (10 s) | IDLE | It is an object, not a hand: learned as background, all water off, session ends (locks clear). A running disposal finishes its 15 s |
| ARMING, ACTIVE, CUP_FULL | Hand gone | EXIT_PENDING | Countdown from the last frame seen |
| EXIT_PENDING | Hand present again within 1.0 s | Back to the state it left | |
| EXIT_PENDING | 1.0 s elapsed | IDLE | All water off. Session ends: soap block and disposal lockout clear. A running disposal is **not** stopped |
| Any except CLEAN | Clean started (UI button, a short press of the ESP32 BOOT button while running, or 3 s still in Neutral) | CLEAN | Water off, disposal stopped, session ends (locks clear) |
| CLEAN | 60 s elapsed, or ended from the UI | IDLE | Nothing latches during CLEAN |
| Any | Layout changed in the UI | IDLE | All water off, disposal stopped, session ends |

**DISPOSAL_RUN rules** (the one function that runs without a hand in the sink; decided 30 Sep 2026, review Q2):
- Starts only from ARMING. If a water function is already latched, holding over the Disposal zone does nothing.
- Runs a fixed 15 s, then stops.
- **Stops immediately** if a hand settles in any zone other than Disposal, Neutral included. The Neutral zone sits over the drain, so a hand resting there must stop it. The same settle then starts that zone's function as normal: water latches, and Soap doses.
- Never restarts in the same session, even after its 15 s ends. A new run needs the hands to leave the sink and a new 1 s hold.
- A disposal still running from the previous session behaves the same for the new session: a hold over Disposal is ignored (no restart, no extension), and a settle in any other zone stops it.

### 4.4 Presence and background rules

- **Fail-on:** while any function is latched, a missing frame never turns water off. Only "hand gone" as defined above starts the countdown.
- **Stillness rule (decided 30 Sep 2026, review Q9):** a real hand is never perfectly still. A target with no movement above the still-hand threshold for `STILL_OFF_MS` (10 s) is an object, not a hand. It is learned as background, all water turns off and the session ends. This is also the flood protection: a pot left in the sink with the water running stops it within 10 s. A hand holding a pot or cup under Cup fill keeps moving slightly, so a 21 s pot fill is not cut off.
- **The threshold is measured, not guessed:** calibration records a still hand's small movements (C8) and a truly static object (the wand ball in C7). The threshold is set between the two. Bench test T28 must show a clear gap before the rule is relied on.
- **Objects never start water:** a session only starts on a moving target, so an object already sitting in the sink cannot start a function. Known limit: an object *set down* in a zone as the hand leaves could briefly latch that zone. It stops within 10 s by the stillness rule (tested in T9).
- **Background learning when idle:** echoes that appear without moving and stay still for 10 s are added to the background, the same as any still object.
- **Sensor recalibration** (the detector's CALIBRATION_NEEDED flag, and re-recording the empty-sink background after 30 s idle) only runs in IDLE with no echoes present. It is never run while a hand is in the sink.

## 5. Smart functions (simulated)

| Function | Demo behaviour | Default (editable per profile) |
|---|---|---|
| Foaming soap | One measured dose, then the latch releases (4.3) | 0.8 ml |
| Cup fill | Fills to the set volume, then CUP_FULL | 350 ml (12 oz); presets 750 ml bottle, 2 L pot (F23). **Cold (mains) water** |
| Hot | Flow at the set temperature, never above the cap | 110 °F / 43 °C set point, 120 °F / 49 °C cap |
| Warm | Flow at the set temperature | 100 °F / 38 °C |
| Cold | Flow at mains temperature | "Mains" |
| Waterfall | Wide sheet flow from the back manifold | Warm |
| Disposal | 15 s run, rules in 4.3 | 15 s |

- Design flow rate: **1.5 gpm (5.7 L/min, 94.6 ml/s)** (decided 30 Sep 2026). At that rate, 350 ml takes 3.7 s, 750 ml 7.9 s and 2 L 21 s.
- Temperatures show in °F by default with a °C toggle.
- **Water saved (F9)** is shown split into its two sources, so the claim holds up to questions:
  1. **Off when hands are out:** a conventional faucet is assumed to run for the whole session, including soaping and cup-full time, while the ring flows only while a function is actually running.
  2. **Flow rate:** 1.5 gpm against the 2.2 gpm US federal maximum for kitchen faucets.

  Both assumptions are printed on screen.

## 6. System architecture

```
 XM125 A ──I2C bus 0──┐                                  ┌── WS2812 ring LEDs
                      ├─ ESP32-S3 ── fusion ── state ────┤
 XM125 B ──I2C bus 1──┘   (sequential    (association +  ├── onboard RGB (status)
                           A then B)      calibrated      └── Wi-Fi AP "ArtesianRing" (WPA2)
                                          geometry)
                                                               │ WebSocket JSON
                                                   Ring Studio UI (laptop / tablet / phone)
```

- **Sensor firmware:** Acconeer **I2C Distance Detector** on both XM125s. They ship with the presence detector, so they must be reflashed (`05-flash-xm125.md`). Over I2C this firmware reports **up to 10 echoes per measurement, each as a distance and a strength**. It does not report the raw radar sweep or its internal threshold. Everything below is designed on those echo lists. (Getting the raw sweep would need different sensor firmware. That is a scope change and is not planned.)
- **Sensor config:** start 60 mm, end 850 mm, recorded threshold (captured during sensor calibration with an empty sink), close-range leakage cancellation on. Measurements run A then B, so the two radars never transmit at the same time.
- **Echo association (one rule):** from A's and B's echo lists, pick the pair that forms a hand-sized target inside the sensing area. When two pairs qualify, take the nearer one (ghost echoes from the steel basin are always further away than the real hand). This rejects the torso, forearm, basin reflections and objects already learned as background (R7, R8, R15).
- **Position and zone:**
  - **Trilateration** of the chosen echo pair, using the **calibrated sensor geometry** (C7: each sensor's measured position and distance offset) and the **working hand depth** measured in C8.
  - The **zone** is that position looked up in the active layout, with 20 mm hysteresis at the edges. Because calibration corrects the geometry rather than the zones, one calibration serves every layout.
  - **No position-correction map.** The first design learned a correction map from hand placements. Simulation showed it made accuracy worse, because human placement errors are as large as the errors being corrected (review R32).
  - **A frame is flagged, and a flagged frame never latches,** when any of these is true:
    - a sensor has no echo inside the hand's echo-strength range (learned in C8);
    - the position falls outside the sensing area;
    - the position jumps further than a hand can move in one frame.
- **Tracking:** an alpha-beta filter per sensor distance smooths the readings and gives a hand speed for the settle rule.
- **Plane gating (F19):** a target outside the sensing area never counts as a hand. This handles the user's torso. It **cannot** reject something behind the sink, because two back-edge sensors see that as a mirror image inside the sink; that is handled physically (R16).
- **Firmware structure:** sensing, fusion and the state machine run on core 1; Wi-Fi, the web server and LEDs on core 0, so Wi-Fi traffic cannot delay a latch. Hardware watchdog on both cores. The fusion and state machine code is plain C++ with no Arduino headers, so it also builds on a PC.
- **Tests without hardware:** `pio test -e native` runs unit tests covering every transition in 4.3, plus recorded real sessions (F11) replayed as regression tests. Test recordings live in `firmware/test/fixtures/` and are committed.
- **Status and recovery:** the onboard RGB LED shows green (running OK), blue (a device connected), red (a check failing), amber (BOOT button held) and three white flashes (password reset). BOOT button presses are read only while running, because holding it at power-up enters the chip's download mode. A short press starts clean mode, 3 to 8 s starts calibration, and 10 s resets the Wi-Fi password and studio PIN (calibration kept). On first boot, or after a reset, the Wi-Fi uses a temporary password printed on the USB serial monitor until a new one is set.
- **Config:** calibration, layouts and profiles are stored in the ESP32 flash as JSON with a schema version (migrated on firmware updates) and a factory reset.
- **UI hosting:** Ring Studio is served by the ESP32 at `http://192.168.4.1` on its own WPA2 network. Two limits follow from plain http:
  1. It cannot install as an offline app, so tablets use an "Add to Home Screen" bookmark.
  2. Web Serial is blocked.

  So a **laptop copy of Ring Studio** (run locally from `ui/`) is the fallback. It connects over USB (Web Serial) and plays recorded sessions (F11) even if the ESP32 is down.
- **Data storage:** recordings (F11), dashboard history (F15) and accuracy results (F16) are kept in the viewing browser's storage. Browser storage can be cleared, and each browser (tablet, laptop copy) keeps its own. So every session and every accuracy run is **exported to a JSON/CSV file** straight after it finishes. Files are then imported where they are needed: the laptop copy (for replay), `firmware/test/fixtures/` (as regression tests) or the Project Collins evidence log. The ESP32 keeps only config and a small running total of sessions and water.

## 7. Feature list

| # | Feature | Where | Phase |
|---|---|---|---|
| F1 | Live echo traces from A and B: distance and strength of each echo, with the chosen pair highlighted (Phase 0 prints the same echo lists on USB serial) | UI | 1 |
| F2 | Visible state machine, including the 1 s exit countdown | UI + LEDs | 1 |
| F3 | Latency readout: hand confirmed in sink → function on, in ms | FW + UI | 1 |
| F4 | False-off counter, plus a "held on" flag when a dropout was correctly bridged | FW + UI | 1 |
| F5 | Guided calibration: wand geometry (C7) and hand profile (C8), with a quality score per point and overall | UI + FW | 1 |
| F6 | Simulated water animation per function | UI | 2 |
| F7 | WS2812 LED ring: function colour, countdown, calibration guidance | FW | 2 |
| F8 | Smart functions: cup volume stop, soap dose, set temperatures | FW + UI | 2 |
| F9 | Water saved, split into "off when hands out" and "flow rate", assumptions on screen | UI | 2 |
| F10 | Live layout switching: Kitchen, Bathroom, Accessible | FW + UI | 2 |
| F11 | Record and replay of real sessions | UI | 2 |
| F12 | Tablet or phone view over the ESP32's Wi-Fi | FW + UI | 1 |
| F13 | Presentation mode (the Showcase screen), engineering panels on a toggle | UI | 2 |
| F14 | User profiles: temperatures, cup size, soap dose, LED colours | FW + UI | 2 |
| F15 | Usage dashboard: sessions, water, function mix, accuracy; CSV export | UI | 2 |
| F16 | Accuracy test mode: prompts a zone, records the result, builds a confusion matrix | UI | 1 |
| F17 | Cloud sync of the dashboard (optional, review R14) | later | 3 |
| F18 | Over-the-air firmware update from Ring Studio | FW + UI | 2 |
| F19 | Plane gating (section 6) | FW | 1 |
| F20 | Hover preview: ring and zone glow in the zone colour while the hand settles | FW + UI | 2 |
| F21 | Clean mode (4.3) | FW + UI | 2 |
| F22 | Sound: chimes, water, soap, disposal, cup full, off. Synthesized in the browser | UI | 2 |
| F23 | Fill presets: cup, bottle, pot | FW + UI | 2 |
| F24 | Hand heatmap per layout, as R&D evidence for zone sizing | UI | 2 |
| F25 | Demo loop: a ghost hand runs a scripted sequence after 8 s idle; excluded from every metric | UI | 2 |
| F26 | Test runner: walks through the bench tests in doc 07 one by one, records pass, fail and notes, and exports the results | UI | 1 |

## 8. Setup and calibration studio (inside Ring Studio)

Nothing about the geometry is hard-coded in firmware. Every dimension, position and angle is entered or measured in the UI, saved to the ESP32's flash, and used live. The studio is PIN-locked in presentation mode.

| # | Feature | What it does |
|---|---|---|
| C0 | Hardware check | Runs first, and again on request. It checks, with the matching troubleshooting codes (doc 09): each sensor answers on its bus (W1); firmware identity (F1); the sensor's status error flags (F2); each RST line restarts the right sensor (W4); a wand "wave test" in front of each sensor (S1); still-wand noise under 5 mm (S4); and, once the LEDs are fitted, a white test, a red/green/blue colour-order test and an LED count (L1, L3, L5). Prompts a 10-minute warm-up after power-on (B8) |
| C1 | Plane dimensions | Width and depth of the sensing area (default 23 × 21 in). Inches or mm. Presets per sink model |
| C2 | Sensor placement | x, y and height (z) for A, B and a reserved C slot, typed or dragged on the plan view, with a units switch (in/mm). Sensor spacing is shown and checked against the sink width (P8). **Identify:** you hold a hand in front of the back-left sensor, and if sensor B reacts, the studio offers **Swap A and B** (W3) |
| C3 | Sensor angles | Yaw and tilt per sensor. Angles do not change the distance maths; they drive the coverage overlay in C5 |
| C4 | Hand depth band | Expected hand depth below the ring (default 30 to 200 mm) |
| C5 | Coverage and accuracy heatmap | Live prediction over the plane: beam footprint, near-range blind spot (< 60 mm), mirror ambiguity, and position error from hand depth plus range noise, turned into expected zone accuracy for the active layout |
| C6 | Empty-sink background capture | Runs the sensor calibration with the sink empty, records the echoes present (basin reflections), and flags anything unusual, such as a forgotten cup |
| C7 | Wand geometry calibration | A card template with 16 holes (a 4 × 4 grid at 1/8, 3/8, 5/8 and 7/8 of the width and depth) is laid across the sink opening. A 40 mm foil-covered ball on a rod is pushed through each hole to two depth marks, 60 mm and 160 mm below the ring: 32 readings per sensor, each confirmed by a beep when steady. The fit solves each sensor's x, y, z and distance offset, with the C2 values as a soft guide. **Pass:** fit error below 12 mm RMS. It also reports: per-hole errors, with redo-one-hole and skip up to 2 holes (P2, P3); each sensor's distance offset (S2); fitted vs typed position, failing over 30 mm (P1); estimated aim error from the strength map (yaw, P4); strength at 60 vs 160 mm (tilt, P5); A-vs-B strength on mirror-image holes, failing over 6 dB (S5); a height difference over 20 mm (P9); holes nearer than 60 mm (P6). The still ball also gives the static-object reading for the stillness threshold. Results export to a file |
| C8 | Hand profile | The ring LEDs and screen guide a real hand to the same 16 points, held naturally high and low, plus one 5 s still hold. It measures three things: the **working hand depth** used in every position fix, the **echo strength of a real hand** (the "hand-sized" window), and a still hand's **small movements** (the stillness threshold). Any point can be redone. It does not build a correction map (R32) |
| C9 | Zone editor | Drag zone edges, assign functions, save layouts (Kitchen, Bathroom, Accessible, custom) |
| C10 | Tuning panel | Settle time and speed, gone frames, exit delay, stillness time and threshold, sensor range, threshold sensitivity, working hand depth, I2C speed (400 or 100 kHz), logging on/off, Wi-Fi channel, LED count, LED brightness cap, LED colour order. Applies live, with reset to defaults |
| C11 | Validation | Full: the F16 accuracy test against section 1 (the "demo ready" mark). Quick on-site check: 5 trials per zone, all must pass, about 5 minutes |
| C12 | Health and drift monitor | Always running. It tracks: per-sensor frame rate (N1) and I2C error rate (W2), including against LED brightness (N4); echo strength and the CALIBRATION_NEEDED flag (B8); background drift since C6 (B3); repeating ghost echoes (N2); echoes just outside the front edge (B6); triggers with no hand confirmed, and their position (A9, B5); a false-off log with its reason (A7); the ESP32's last reset reason (W5, L6). It prompts the fix for each |
| C13 | Save, load, compare | Named calibrations with date and notes; export and import; compare two on the same accuracy test |
| C14 | Diagnostics and guided fixes | Every failed check shows its code from `09-troubleshooting.md`: what is wrong, the likely causes (most likely first), the step-by-step fix, and a **Test again** button. A symptom finder covers things only a person can see. The Operator view always shows why nothing is latching (no hand, frame flagged: strength or jump, not settled, zone blocked; A6). Anything unresolved exports a file to send |

Calibration order: warm-up 10 min → C0 → C1 → C2/C3/C4 → C5 → C6 → C7 → C8 → C11 → save. Fix any failed check (C14) before moving on. Realistic time: about 15 minutes for a full calibration, plus about 5 minutes for the quick check. The full F16 validation (180 trials per person) is done on the bench, not at a venue.

## 8b. UI design language (Ring Studio)

Reference: the "Ring Studio UI" design canvas (Showcase, Operator view, Calibration studio, Hand marker options), 30 Sep 2026. The canvas screens are prototypes. They use the cursor as the hand and model the main section 4 rules: settle, latch, soap release, the disposal rules, cup full and the 1 s exit. They model the 10 s stillness rule as "cursor not moved for 10 s". They do not model clean mode, GONE_FRAMES, the 20 mm hysteresis or the sensor maths, and they show a running disposal as the active function. Copies are kept in `ui/prototype/`.

- **Showcase screen** (presentation mode, F13): a full-screen rendered top-down scene. It shows a speckled stone countertop, a lit resin ring bezel, and a brushed stainless basin with a drain. It is drawn live on an HTML canvas at 60 fps with no libraries.
  - **Ring LEDs** are drawn as 132 individual pixels with bloom, matching the real strip. They chase slowly when idle, fill outward from the manifold as a hand settles, shimmer while active, and retract around the ring during the off countdown.
  - **Water** is a particle stream from the back manifold with splashes and ripples.
    - Waterfall is a wide sheet.
    - Hot shows steam, and cold shows glints.
    - Cup fill draws a filling cup.
    - Soap bursts into foam, and the disposal spins a vortex into the drain.
  - **Radar pulses** ripple from sensors A and B and "ping" the hand where they meet.
  - **Hand marker:** no literal hand. Five switchable styles: Focus lock (default), Precision reticle, Glass droplet, Presence bloom and Radar range.
  - **Sound (F22):** synthesized in the browser with no audio files, so it works offline. It includes:
    - a two-note chime per function;
    - running water shaped per function (cup fill rises in pitch as it fills);
    - soap pops, a disposal rumble, a cup-full ding and a falling tone at off.

    It starts on the first tap or click, as browsers require.
  - **Demo loop (F25):** after 8 s idle, a ghost hand runs a sequence matched to the active layout. Ghost activity never counts toward sessions, water saved, latency or any recorded data.
- **Look:** dark, calm, premium consumer-device feel. Near-black ground (#07090C), frosted translucent cards with hairline borders, 24 to 36 px corners, one big number or word per card.
- **Type:** Geist (SIL Open Font License) with tabular numerals. The prototypes load it from Google Fonts. The build bundles the font files and the licence into the ESP32 flash.
- **Function colours** (always paired with a label and icon, never colour alone): soap lilac #B69CFF, disposal amber #F2B44B, cup fill cyan #4FD1E8, waterfall teal #3FC7A6, hot #FF6B4A, warm #FFB27A, cold #6FB6FF, neutral grey #AEB7C2.
- **Operator view:**
  - A right-hand column holds a "Now" card, four metric tiles and the state strip (Idle, Tracking, Active, Off in 1 s).
  - An Engineering toggle swaps the tiles for live sensor distances and range circles.
- **Motion:** springs under 400 ms, and all motion off when the device asks for reduced motion.
- **Controls:** layout switch, °F/°C, Engineering, Calibrate, Radar, Sound, marker style. Touch targets at least 38 px.

## 9. Build phases

| Phase | Output | Exit test |
|---|---|---|
| 0 | Reflash XM125s, wire the bench rig, echo lists from A and B printed on USB serial | T1 to T4 |
| 1 | Fusion (association, calibrated geometry, plane gating, stillness rule), the full state machine with unit tests, calibration studio core (C1 to C8, C11), minimal UI over Wi-Fi: F1 to F5, F12, F16, F19, F26, and the C0 and C14 diagnostics. Soap doses, cup fills and the disposal run fire as state-machine events using the defaults; their F8 settings come in Phase 2 | T5 to T11, T16 to T21, T28 to T30; accuracy ≥ 95% with Nathan's hand |
| 2 | Full Ring Studio (Showcase and Operator view), remaining studio features (C9, C10, C12, C13), and F6 to F11, F13 to F15, F18, F20 to F25 | T12 to T15, T22 to T27; section 1 targets met with 5 people |
| 3 | Optional: F17 cloud sync; a learned zone classifier trained on recorded sessions, compared head to head against the rule-based fusion | n/a |
