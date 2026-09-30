# 01 · Design Spec

Status: **DRAFT for review. No build work starts until this and `02-design-review.md` are signed off.**

## 1. What we are proving

A faucetless sink ring can tell which of 9 zones a hand is in, using radar only (no camera, no optics), fast and reliably enough that a person uses it without thinking. The ring then runs the matching water function and holds it safely until the hands leave.

The demo is **dry**: no pump and no water. The screen and the LED ring show what the water would be doing.

Success criteria for the live demo (measured with the built-in accuracy test, section 7):

| Metric | Target |
|---|---|
| Zone accuracy at latch, inner 70% of each zone, 5+ different people | ≥ 97% |
| Hand entry to function on (includes settle time) | ≤ 300 ms |
| False-off while a hand is in the sink | 0 in a 10 minute session |
| Off after hands leave | 1.0 s ± 0.1 s |
| Cold boot to ready, no laptop | ≤ 10 s |

## 2. Physical setup

- Sensing area: sink opening **584 × 533 mm (23 × 21 in)**. Origin = back-left corner, x to the right, y toward the user.
- **Sensor A:** back-left corner. **Sensor B:** back-right corner. Both sit in the ring at counter level, aimed at the sink centre (45° inward) and tilted down about 20° into the basin (tilt to be tuned on the bench).
- Two sensors only. The third board was defective. See the review, item R6, on replacing it.
- Controller: ESP32-S3-N8R2 dev board (VCC-GND YD-ESP32-S3 layout), in a dry spot under or behind the ring.
- Ring LEDs: WS2812B strip around the ring perimeter (~2.2 m).

## 3. Zone map (facing the sink)

| | Left | Centre | Right |
|---|---|---|---|
| **Back** | Foaming soap | Garbage disposal | Cup fill |
| **Middle** | Waterfall | Neutral | Waterfall |
| **Front** | Hot | Warm | Cold |

Alternative layouts, switchable live (zone assignment to be confirmed, see review Q3):

- **3 × 2:** back = Soap · Disposal · Cup fill, front = Hot · Warm · Cold. The waterfall is dropped.
- **3 back + 1 front:** back = Soap · Disposal · Cup fill, front = one wide Warm zone (temperature from the active profile).

## 4. Behaviour: the latch state machine

```
            hand detected                      settled in a function zone
  IDLE ─────────────────────▶ ARMING ─────────────────────────────▶ ACTIVE(fn)
   ▲                           │  ▲                                  │   ▲
   │                           │  └─ settled in Neutral: keep arming  │   │ hand back
   │             hand gone     │                                     │   │ within 1.0 s
   │◀──────────────────────────┘                     hand gone       ▼   │
   │                                              ┌──────────── EXIT_PENDING
   │◀──────────────── 1.0 s elapsed, all off ─────┘              (1.0 s countdown)
```

Rules:

1. **Latch on settle, not on first touch.** A zone latches when the hand has stayed inside it for `SETTLE_MS` (start at 150 ms) with speed below `SETTLE_SPEED` (start at 250 mm/s). This stops a hand that crosses the front row on its way to the soap from latching Hot. See review R1.
2. **Once latched, the function holds** while the hand moves anywhere in the sink. Crossing into other zones changes nothing.
3. **Hand leaves the sink:** a 1.0 s countdown starts, then everything turns off.
4. **Hand returns inside the 1.0 s:** the same function continues.
5. **To change function:** hands out, countdown ends, re-enter.
6. **Neutral zone** never latches. The system keeps arming until the hand settles in a function zone.
7. **Presence errors bias to "still present"** (fail-on). The countdown only starts when both sensors agree the hand has gone for `GONE_FRAMES` consecutive frames.
8. **Safety overrides**, which beat rules 2 to 4:
   - **Disposal:** needs a 1.0 s hold in its zone to start, runs a fixed 15 s, stops instantly if a hand settles in any other zone, and never restarts without a fresh hold.
   - **Max run timers** per function (hot/warm/cold 120 s, waterfall 120 s). A timer is reset by hand movement, not by a static object. This protects against a pot left in the sink (review R2).
   - **Cup fill** stops at the set volume even if the hand stays.
   - **Soap** gives one dose per latch.

## 5. Smart functions (simulated)

| Function | Demo behaviour | Default (editable per profile) |
|---|---|---|
| Foaming soap | One measured dose per latch | 0.8 ml |
| Cup fill | Fills to set volume, then stops and flashes | 350 ml (12 oz) |
| Hot | Flow at set temperature, anti-scald cap shown | 120 °F / 49 °C cap |
| Warm | Flow at set temperature | 100 °F / 38 °C |
| Cold | Flow at mains temperature | shows "mains" |
| Waterfall | Sheet flow from the back manifold | same temp as last used, default warm |
| Disposal | 15 s run, safety rules above | 15 s |

Design flow rate for the simulation: **1.5 gpm (5.7 L/min)**. This is an assumption to confirm with Rod.

## 6. System architecture

```
 XM125 A ──I2C bus 0──┐                                  ┌── WS2812 ring LEDs
                      ├─ ESP32-S3 ── fusion ── state ────┤
 XM125 B ──I2C bus 1──┘   (sequential    (trilat +       ├── onboard RGB (status)
                           A then B)      calibration)   └── Wi-Fi AP "ArtesianRing"
                                                               │ WebSocket JSON
                                                   Ring Studio UI (laptop / tablet / phone)
```

- **Sensor firmware:** Acconeer **I2C Distance Detector** on both XM125s. They ship with the presence detector, so they must be reflashed (see `05-flash-xm125.md`).
- **Sensor config:** start 60 mm, end 850 mm, recorded threshold (empty-sink background), close-range leakage cancellation on. Measurements run A then B so the two radars never transmit at the same time.
- **Fusion:** nearest valid peak from each sensor gives (rA, rB). Two estimates are computed:
  - **Trilateration** gives the live dot on screen.
  - **Calibration fingerprint** (nearest calibrated zone centroid in rA/rB space, with a confidence margin) decides the zone.

  If the two estimates disagree, or a sensor reports no peak, the frame is flagged, and a flagged frame can never latch.
- **Firmware:** C++ on Arduino-ESP32 via PlatformIO. Ring Studio is served from the ESP32's flash, so no laptop or venue Wi-Fi is needed. The same JSON stream is mirrored over USB serial as a fallback.
- **UI:** a single-page web app (vanilla JS, Canvas). It installs to a tablet home screen, so it works as the "app".

## 7. Feature list (approved 30 Sep 2026)

| # | Feature | Where |
|---|---|---|
| F1 | Live signal traces from A and B (scrolling distance chart, peaks, threshold) | UI |
| F2 | Visible state machine with a 1-second draining exit ring | UI + LEDs |
| F3 | Latency readout, entry to function on, in ms | FW + UI |
| F4 | False-off counter, plus a "held on" flag when a dropout was correctly bridged | FW + UI |
| F5 | 9-zone calibration walkthrough with a per-zone and overall quality score | UI + FW |
| F6 | Simulated water animation per function, in the ring's colour | UI |
| F7 | WS2812 LED ring: function colour, exit countdown flash, calibration guidance | FW |
| F8 | Smart functions: cup volume stop, soap dose, set temperatures | FW + UI |
| F9 | Water saved vs a conventional faucet (2.2 gpm US federal maximum), assumptions shown on screen | UI |
| F10 | Live layout switching: 3×3, 3×2, 3 back + 1 front | FW + UI |
| F11 | Record and replay of real sessions (JSON), for demo insurance and analysis | UI |
| F12 | Tablet or phone view over the ESP32's own Wi-Fi access point | FW + UI |
| F13 | Presentation mode: clean investor view, engineering panels on a toggle | UI |
| F14 | User profiles: temperatures, cup size, soap dose, LED colours; switch live | FW + UI |
| F15 | Usage dashboard: sessions, water used and saved, function mix, accuracy; CSV export | UI |
| F16 | Accuracy test mode: UI prompts a zone, records the result, builds a confusion matrix | UI |
| F17 | Cloud sync of the usage dashboard: **Phase 3, optional** (see review R14) | later |

F16 is new from the review. It produces the accuracy numbers that back up the investor pitch.

## 8. Setup and calibration studio (inside Ring Studio)

Nothing about the geometry is hard-coded in firmware. Every dimension, position and angle is entered or measured in the UI, saved to the ESP32's flash as a versioned JSON calibration file, and used live. The studio is behind a PIN in presentation mode so visitors can't change it.

| # | Feature | What it does |
|---|---|---|
| C1 | **Plane dimensions** | Width and depth of the sensing area (default 23 × 21 in). Inches or mm. Presets per sink model. |
| C2 | **Sensor placement** | x, y, height (z) for A, B and a reserved C slot. Type the values or drag the sensors on the plan view. Sensor spacing is calculated and shown. |
| C3 | **Sensor angles** | Yaw (inward aim) and tilt (down into the basin) per sensor. Angles do not change the distance maths. They drive the coverage overlay and the aim checks in C5. |
| C4 | **Hand depth band** | Expected hand depth below the ring (default 30 to 200 mm). Feeds the trilateration and the accuracy prediction. |
| C5 | **Coverage and accuracy heatmap** | Live prediction over the plane: each sensor's beam footprint, near-range blind spot (< 60 mm), and expected zone accuracy per cell (the `geometry_sim` maths running in the browser). Shows whether a placement is good *before* touching hardware. |
| C6 | **Empty-sink background capture** | One button. Records the static echoes of the basin for each sensor, shows them on the signal traces, and flags anything unusual (a forgotten cup). |
| C7 | **Reference target check** | Place a reference object (a can on a marked mat) at 3 to 5 known points. The studio fits a range offset per sensor (mounting and resin delay) and back-solves the sensor positions to check your tape-measure numbers. It warns if they disagree by more than 15 mm. |
| C8 | **Zone fingerprint walkthrough** | The 9-zone guided capture. The ring LEDs and screen show which zone to use, and prompt for a high hand, low hand and moving hand in each zone. Shows sample count and quality per zone. Any single zone can be redone. |
| C9 | **Zone editor** | Drag the grid lines for unequal zone sizes, assign a function to each zone, save layouts (3×3, 3×2, 3 back + 1 front, custom). |
| C10 | **Tuning panel** | Settle time and speed, gone frames, exit delay (1.0 s), static-object absorb time, max run timers, sensor start/end range, threshold sensitivity, frame rate. Changes apply live, with reset to defaults. |
| C11 | **Validation** | The accuracy test (F16): a confusion matrix, a heatmap of misses on the plane, and latency and false-off stats. A calibration is only marked "demo ready" when it passes the targets in section 1. |
| C12 | **Health and drift monitor** | Per-sensor frame rate, I2C errors, signal strength, noise floor, the sensor's CALIBRATION_NEEDED flag, and background drift since the last capture. Prompts a recalibration when something has moved. |
| C13 | **Save, load, compare** | Named calibration files with date and notes. Export and import JSON. Side-by-side comparison of two calibrations on the same accuracy test. |

Calibration order the studio walks you through: C1 → C2/C3/C4 → C5 check → C6 → C7 → C8 → C11 → save.

## 9. Build phases

| Phase | Output | Exit test |
|---|---|---|
| 0 | Reflash XM125s, wire bench rig, raw distance stream from A and B on USB serial | Both sensors stream at ≥ 20 Hz with a hand visible 60 to 800 mm |
| 1 | Fusion, state machine, calibration studio core (C1 to C8, C11), minimal UI over Wi-Fi | Accuracy test ≥ 95% with Nathan's hand |
| 2 | Full Ring Studio UI, remaining studio features (C9, C10, C12, C13), LEDs, smart functions, profiles, record/replay, dashboard | Full demo run-through with 5 people, targets in section 1 met |
| 3 | Optional: cloud sync, polish | n/a |
