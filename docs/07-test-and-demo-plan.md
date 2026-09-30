# 07 · Test and Demo Plan

## Bench tests

| ID | Phase | Test | Pass |
|---|---|---|---|
| T1 | 0 | Both XM125s answer on their own bus, report the distance detector firmware, and calibrate | Both OK, no I2C errors in 10 min |
| T2 | 0 | Frame rate with A and B measured one after the other | ≥ 20 Hz per sensor |
| T3 | 0 | Hand at 60, 150, 300, 600 and 800 mm from each sensor (tape measure) | Reading within ±15 mm |
| T4 | 0 | Empty sink, 10 min, background recorded | No peaks above threshold |
| T5 | 1 | Accuracy test (F16): 20 trials per zone, Nathan's hand, 3×3 layout | ≥ 95% (Phase 1), back row reported separately |
| T6 | 1 | Latch and exit: 30 entries, measure entry-to-on and exit-to-off | ≤ 300 ms on, 1.0 s ± 0.1 s off, 0 false-off |
| T7 | 1 | **Body tests:** stand at the sink, lean over the front edge, reach across, arms crossed at the edge | No function triggers without a hand in the sink |
| T8 | 1 | **Behind-the-sink test:** walk behind the rig at 0.3, 0.6 and 1 m | No trigger (with backboard fitted) |
| T9 | 1 | **Object tests:** pot, cup and plate left in the sink; hand held perfectly still under cup fill | Pot doesn't hold water on past the static rules; still hand is NOT cut off |
| T10 | 1 | Reach path: reach for soap and cup fill from the front, fast and slow | Latches the back zone, never Hot/Cold on the way |
| T11 | 1 | Two hands in at once, hand plus forearm, watch and rings | No wrong latch; worst case, no latch |
| T12 | 2 | Accuracy test with 5+ people, all three layouts | ≥ 97% overall |
| T13 | 2 | LED ring: full brightness cap, 30 min run | Supply and strip warm, not hot; no flicker |
| T14 | 2 | Pull a sensor cable mid-run, then reconnect | UI shows fault, sensor auto-recovers via RST, no crash |
| T15 | 2 | Cold boot with no laptop connected, tablet joins Wi-Fi | Ready in ≤ 10 s, UI loads on tablet |

## Accuracy test protocol (F16)
1. Calibrate (studio C1 → C8).
2. The UI shows a random zone. The tester places their hand there **naturally from the front** (no slow careful placement), then removes it.
3. 20 trials per zone per person: 180 trials for 3×3.
4. Record the latched zone, latency and any false-off.
5. Save the confusion matrix and CSV. These numbers go to the Project Collins evidence log and are the accuracy claim used with investors.

## Pre-demo checklist (on site)
- [ ] Back edge against a wall or backboard, nobody able to walk behind (R16)
- [ ] Sensors vertical, module face in, nothing metal in front (R17)
- [ ] ESP32 USB and LED supply on one switched power strip (R23)
- [ ] Power on, tablet joined to ArtesianRing Wi-Fi
- [ ] Full calibration on site: plane, positions, background, fingerprints (R20)
- [ ] Quick accuracy check: 5 trials per zone, all pass
- [ ] Presentation mode on, studio PIN-locked
- [ ] A recorded good session loaded, ready to replay if hardware fails (R19)

## Demo run sheet (about 5 minutes)
1. **The problem (30 s):** the faucet is the dirtiest thing in the kitchen, and touch-free faucets only do on/off.
2. **Show the ring (30 s):** no faucet, no camera, no buttons. The radar sits hidden in the ring.
3. **Live walk-through (2 min):** soap, rinse warm, cup fill auto-stop, waterfall. Point out the LED colour, the 1-second off, and the latency number.
4. **Engineering view (1 min):** flip presentation mode off. Show the live radar traces and the accuracy results.
5. **Hand it over (1 min):** the investor tries it. Switch to the Accessible layout live.
6. **Close:** water saved figure on screen, accuracy figure, next steps.
