# 07 · Test and Demo Plan

Every rule in spec section 4 has a bench test here and a unit-test twin in `firmware/test/`. Tests of hardware, power and security (T8, T13 to T15, T24 to T26) are bench-only.

## Bench tests

| ID | Phase | Test | Pass |
|---|---|---|---|
| T1 | 0 | Both XM125s answer on their own bus, report the distance detector firmware and calibrate. Also try the ADDR pad on one spare board: does the address change? (R3) | Both OK, no I2C errors in 10 min; ADDR result recorded |
| T2 | 0 | Frame rate with A and B measured one after the other | ≥ 20 Hz per sensor |
| T3 | 0 | Drink can at 60, 150, 300, 600 and 800 mm from each sensor (tape measure) | Reported distance within ±15 mm |
| T4 | 0 | Empty sink for 10 min after the background is recorded (C6) | No echoes reported inside the sensing area |
| T5 | 1 | Accuracy test (F16): 20 trials per zone, Nathan's hand, Kitchen layout | ≥ 95%, middle row reported separately (R6) |
| T6 | 1 | 30 entries straight to a zone. Measure entry-to-on and last-seen-to-off | ≤ 300 ms on, 1.0 s ± 0.1 s off, 0 false-off |
| T7 | 1 | **Body:** stand at the sink, lean over the front edge, reach across, arms crossed on the edge | No function starts without a hand in the sink |
| T8 | 1 | **Behind the sink:** walk behind the rig at 0.3, 0.6 and 1 m | No trigger (backboard and shields fitted) |
| T9 | 1 | **Objects:** pot, cup and plate put in the sink while idle; hand held perfectly still under Cup fill | Objects ignored after 5 s; the still hand is not cut off |
| T10 | 1 | **Reach path:** reach for Soap and Cup fill from the front, fast and slow | Latches the back zone, never Hot/Warm/Cold on the way |
| T11 | 1 | Two hands at once, hand plus forearm, watch and rings | No wrong latch; worst case, no latch |
| T12 | 2 | Accuracy test, 5+ people, all three layouts | ≥ 97% overall, no zone below 93% |
| T13 | 2 | LED ring at the brightness cap, 30 min | Supply, wires and strip warm, not hot; no colour shift at the far end; no flicker |
| T14 | 2 | Pull a sensor cable mid-run, then reconnect | UI shows the fault; the sensor recovers through RST; no crash |
| T15 | 2 | Cold boot on the wall adapter, no laptop; tablet joins the Wi-Fi | Ready in ≤ 10 s; UI loads on the tablet |
| T16 | 1 | **Disposal:** 1 s hold starts it; runs 15 s; a hand settling in Neutral stops it; a hand settling in Hot stops it and starts Hot; keeping the hand over Disposal after 15 s does not restart it; it keeps running after hands leave | All as spec 4.3 |
| T17 | 1 | **Soap:** one dose; then settle in Warm without leaving, and Warm starts; Soap zone blocked; the block clears after the exit countdown, including when the disposal is still running | All as spec 4.3 |
| T18 | 1 | **Max run:** a drink can left in the sink while Warm runs → Warm stops at 120 s (TIMED_OUT). A hand moving slowly keeps Warm on past 120 s | Both correct |
| T19 | 1 | **Hands out, person stays:** withdraw hands but keep standing at the sink | Off 1.0 s after the hands leave (R25) |
| T20 | 1 | **Returning hand:** out for 0.5 s, then back | The same function continues, no chime or restart |
| T21 | 1 | **Background:** leave the sink empty 30 s (refresh runs), then add a pot while idle; fill a 2 L pot under Cup fill holding it still; set a cup down under Cup fill and walk away | Pot ignored; the 21 s fill is not cut off; after the cup is full the session ends about 6 s later and the sink is usable again |
| T22 | 2 | **Clean mode:** start from the UI, from the BOOT button, and by 3 s still in Neutral | Water off, nothing latches for 60 s, disposal stopped |
| T23 | 2 | **Layout change** while Warm is running | All off, IDLE, new layout active |
| T24 | 2 | **OTA update** from Ring Studio | Update installs, device reboots, calibration kept |
| T25 | 2 | **Security:** join with a wrong Wi-Fi password; open the studio without the PIN | Both refused |
| T26 | 2 | **Power:** switch the power strip off and on 10 times | Clean boot each time; no stray LEDs while booting |
| T27 | 2 | **Demo loop:** leave it idle 8 s in each layout, then take over with a real hand | Ghost runs a sequence that fits the layout; no ghost activity in any metric or recording |

## Accuracy test protocol (F16)
1. Calibrate (studio C1 → C8).
2. The UI shows a random zone with a target dot at its centre. The tester reaches in naturally from the front, aims at the dot, and stops. No slow, careful placement.
3. 20 trials per zone per person: 180 trials for the Kitchen layout.
4. Record the latched zone, the latency and any false-off.
5. Export the confusion matrix and the CSV to a file straight away (browser storage can be cleared). These numbers go to the Project Collins evidence log and are the accuracy claim used with investors.

The quick on-site check (C11) is 5 trials per zone, all of which must pass. It confirms the calibration; it is not the accuracy claim.

## Pre-demo checklist (on site; allow 30 minutes)
- [ ] Rig's back edge against a wall or backboard, sensor shields fitted, nobody can walk behind it (R16)
- [ ] Sensors vertical, module face in, nothing metal in front (R17)
- [ ] ESP32 wall adapter and LED supply on one switched power strip (R23)
- [ ] Power on; tablet joined to the ArtesianRing Wi-Fi with the password
- [ ] Full calibration on site: plane, sensor positions, empty-sink background, reference target, the 16-point walkthrough (R20, about 15 min)
- [ ] Quick accuracy check: 5 trials per zone, all pass (about 5 min)
- [ ] Showcase screen on, studio PIN-locked, sound on (first tap)
- [ ] Laptop copy of Ring Studio open with a recorded good session imported from its exported file, ready to replay if the hardware fails (R29)

## Demo run sheet (about 5 minutes)
1. **The problem (30 s):** the faucet is the dirtiest thing in the kitchen, and touch-free faucets only do on/off.
2. **Show the ring (30 s):** no faucet, no camera, no buttons. The radar sits hidden in the ring.
3. **Live walk-through (2 min):** soap, then rinse in Warm without leaving the sink, cup fill stopping by itself, waterfall. Point out the ring colour, the 1-second off and the response time.
4. **Engineering view (1 min):** switch to the Operator view. Show the live echo traces from both sensors and the accuracy results.
5. **Hand it over (1 min):** the investor tries it. Switch to the Accessible layout live.
6. **Close:** water saved (both parts), accuracy figure, next steps.
