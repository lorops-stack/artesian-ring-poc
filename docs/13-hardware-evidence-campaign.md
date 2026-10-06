# Hardware evidence campaign

This document turns bench work into repeatable evidence. Do not tune from theory when a raw capture can answer the question.

## Gate 0 — build and bring-up
- CI must pass the native core tests, JavaScript regression tests, Ring Studio build, and the exact `esp32s3` PlatformIO compile.
- Flash the same commit SHA being tested. Record firmware version, commit, board, XM125 firmware versions, supply voltage, sensor positions, radome/window material and sink/bench geometry.
- C0 hardware checks must pass before accuracy data is accepted.

## Gate 1 — two-XM125 baseline
For every condition below, use **Bench → Capture raw echoes (10 s)** before changing tuning. Save the JSON with a useful label and a bench snapshot.

Capture at least:
1. Empty sink/rig, dry.
2. Empty sink with normal nearby body movement but no hand over the plane.
3. Hand at each of the 16 calibration holes, low and high.
4. Slow sweeps front/back and left/right.
5. Fast entry/exit at zone boundaries.
6. Stationary hand for 10+ seconds.

Record: frame count, sensor alive rate, effective Hz, echo counts, selected peak indices, strengths, range residuals, tracked position, flags and any event/zone outcome.

## Gate 2 — dry accuracy
Run a balanced trial set across every zone; do not report only aggregate accuracy.
- Minimum 30 trials per zone for an engineering baseline; increase before product claims.
- Randomize prompted zone order.
- Report per-zone correct latch rate, no-latch rate, wrong-zone confusion, median/P95 latch latency, false-off rate and held-on events.
- Separate low-hand and high-hand trials.
- Preserve every failed trial's raw capture.

## Gate 3 — hostile-object / interference matrix
Repeat baseline captures and targeted accuracy trials with:
- metal cup, glass, ceramic mug and cookware in multiple positions;
- cutlery/utensils;
- rings, watch/bracelet and bare hand;
- one hand vs two hands;
- torso leaning over the sink and a person walking behind/alongside;
- objects entering before the hand, after the hand and remaining stationary;
- reflective foil target and intentionally difficult multipath positions;
- partial sensor obstruction and one degraded/dead sensor.

A failure is not fixed by hiding the capture. Add it to the permanent regression corpus and only then change association/calibration logic.

## Gate 4 — wet environment
After the dry gates are understood, repeat with droplets, continuous water film, splash/spray, steam/condensation, wet stainless and changing water level. This is a separate evidence set; dry simulation or dry bench results cannot substitute for it.

## Acceptance discipline
- Keep simulated, bench-measured and product-validated numbers separate.
- Any algorithm/tuning change must cite the capture(s) that motivated it and be replayed against the retained regression corpus.
- Prefer a third sensor when measured two-sensor geometry shows a repeatable physical ambiguity; do not bury a geometry limitation under increasingly fragile heuristics.
- Production actuator work remains fail-safe: reset, crash, brownout, boot and communications loss must leave water/disposal outputs de-energized unless a separately reviewed safety design says otherwise.
