# 09 · Troubleshooting and Guided Fixes

This guide covers everything that can stop the ring working correctly, from a loose wire to a sensor aimed the wrong way. Ring Studio uses the same codes: when a check fails, it shows the code, what is wrong and these fix steps, with a **Test again** button.

- **Auto** checks run by themselves during setup and calibration. The studio measures the problem and tells you.
- **Symptom** entries are for things only you can see (a light off, a smell, the wrong zone). Find what you see in the symptom finder (section 1) and go to that entry.

Always fix problems **in the order of the sections below**: power, then wiring, firmware, sensor health, placement, background, calibration, accuracy. A problem early in the chain causes false failures further down, so fixing the first failure often clears the rest.

---

## 1. Symptom finder

| What you see | Go to |
|---|---|
| A sensor's PWR light is off | W6 |
| Something is hot, or smells of burning | **Unplug everything now**, then W7 |
| ESP32 doesn't appear in Device Manager | W8 |
| Studio says a sensor is "not found" | W1 |
| Readings stop and start, or "I2C error" lines appear | W2 |
| Left and right are swapped on screen | W3, A3 |
| "Sensor did not restart" after a reset | W4 |
| ESP32 restarts by itself | W5, L6 |
| "Wrong sensor firmware" | F1 |
| A sensor sees nothing at all, even a hand 20 cm away | S1 |
| Distances are off compared to a tape measure | S2, S3 |
| Numbers jump around with nothing moving | S4 |
| One sensor is much weaker than the other | S5, P4 |
| Calibration "fit error too high" | P2 |
| Studio says a sensor is far from where you measured it | P1 |
| Coverage map shows red areas | P4, P5, P6, P7 |
| Background capture complains | B1, B2 |
| "Recalibrate: something has changed" | B3, B8 |
| Water turns on with nobody at the sink | A9, B5, B6 |
| Water won't turn off | A8 |
| Water cuts off while a hand is in the sink | A7 |
| The wrong zone starts | A1 to A5 |
| Nothing starts, however long you hold still | A6 |
| Slow to respond | A10, N1 |
| LEDs dark, flickering, wrong colour, or dim at the far end | L1 to L5 |
| Can't join ArtesianRing, or the page won't load | U1, U2 |
| Forgotten Wi-Fi password or studio PIN | U4 |
| No sound | U5 |
| CubeProgrammer won't connect to a sensor, or programming fails | F4 |
| VS Code Upload fails | F5 |
| `git pull` refuses to update | U7 |

---

## 2. Three techniques used throughout

### The swap test (is it the sensor, or the wiring?)
1. Unplug the ESP32's USB.
2. At the **ESP32 end only**, swap sensor A's four bus wires with sensor B's:
   - W1 swaps with W2;
   - W5 and W6 swap with W7 and W8;
   - W9 swaps with W10.
3. Plug back in and run the check again.
4. **If the fault moves to the other sensor name,** it follows the ESP32 side: the ESP32 pins or the wires at that end.
5. **If the fault stays with the same physical board,** that board, or its end of the wires, is the problem. Try a spare board in its place.
6. Put the wires back where they were before continuing.

### The known-good target
A foil-wrapped ping-pong ball on a rod (the calibration wand, build guide Step 32). It gives the same echo every time, so when a hand gives odd results the wand tells you whether the sensor or the hand is the issue.

### Re-seat
Pull a jumper wire fully off its pin, look at the pin (straight, clean), push the wire back on firmly until it stops. Loose jumper wires cause more faults than anything else on a bench build.

---

## 3. Power and wiring (W)

### W1 · Sensor not found  (Auto: hardware check C0)
**You see:** "Sensor A not found" or "Sensor B not found". The ESP32 gets no answer at address 0x52 on that sensor's bus.

**Likely causes, most likely first:**
1. SDA and SCL wires swapped.
2. A wire on the wrong ESP32 pin (one position off on the header).
3. A loose wire.
4. No power to the sensor (3V3 or G wire off; PWR light out).
5. The sensor is stuck in loading mode (BOOT held down, or BOOT pressed when it powered up).
6. The sensor was never reflashed, or the reflash failed (see F1 if it answers but wrongly).
7. Damaged sensor.

**Fix, step by step:**
1. Look at the sensor's **PWR** light. If it's off, go to W6 first.
2. Unplug the ESP32. Check that sensor's four bus wires against the build guide table (Step 17), counting pins from the top of each header:
   - sensor A: W5 on GPIO8 (left pin 12) to SDA (right pin 9), and W6 on GPIO9 (left pin 15) to SCL (right pin 10);
   - sensor B: W7 on GPIO17 (left pin 10) to SDA, and W8 on GPIO18 (left pin 11) to SCL.
3. Re-seat all four of that sensor's wires at both ends (section 2).
4. Press the sensor's **RST** button once. Do not touch BOOT.
5. Plug in and click **Test again**.
6. Still failing: swap that sensor's SDA and SCL wires at the sensor end only, then **Test again**. If it now works, the labels were read the wrong way round. Leave it working and note which way.
7. Still failing: do the swap test (section 2).
   - If the fault moves, recheck the ESP32-side pins.
   - If it stays with the board, reflash it (build guide Step 13). If the reflash won't connect either, replace it with a spare.

### W2 · Intermittent bus errors  (Auto: counted all the time, shown in C12)
**You see:** "I2C errors: A 14/min". Readings freeze for a moment, or the studio shows a warning. More than 1 error per minute fails.

**Likely causes:**
1. A loose or worn jumper wire.
2. The sensor cable is too long (over 50 cm).
3. The sensor cable runs alongside the LED power wires.
4. A weak ground connection.
5. The bus speed is too high for the cable.

**Fix:**
1. Re-seat all four of that sensor's wires (section 2).
2. Measure the cable. Over 50 cm: shorten it, or go to step 5.
3. Move the sensor cable away from the LED power wires (at least 5 cm apart), and cross them at right angles if they must cross.
4. Twist the SDA wire together with the GND wire, and the SCL wire with the 3V3 wire, for the whole run.
5. Lower the bus speed: studio **Tuning (C10) → I2C speed → 100 kHz**, then **Test again**. The frame rate drops slightly, which is fine.
6. Still failing: swap test (section 2), then a spare sensor.

### W3 · Sensors A and B swapped  (Auto: C2 sensor identify)
**You see:** in C2 the studio says "Put your hand in front of the BACK-LEFT sensor". The reading jumps on sensor **B** instead of A. Left and right would be mirrored.

**Cause:** sensor A (back-left) is wired to sensor B's pins, or the boards are mounted in each other's corners.

**Fix (pick one):**
1. **Quick:** in C2, click **Swap A and B**. The studio treats them the other way round. Done.
2. **Tidy:** unplug, and swap the two boards' mounting positions (or all four bus wires and the RST wire at the ESP32 end), so the wiring matches the diagram. Then **Test again**.

### W4 · Reset line not working  (Auto: C0 hardware check)
**You see:** "Sensor A did not restart when reset", or "Resetting A restarted B".

**Causes:**
1. The RST wire is missing or loose (W9 or W10).
2. The RST header pin is badly soldered (dull ball, cracked).
3. W9 and W10 are swapped (the "restarted B" message).

**Fix:**
1. Check W9 runs from GPIO6 (left pin 6) to sensor A's **left-side bottom pin (RST)**, and W10 from GPIO7 (left pin 7) to sensor B's RST.
2. If the message said the other sensor restarted: swap W9 and W10 at the ESP32 end.
3. Look at the RST solder joint. It should be a shiny cone. If it isn't, reheat it for 3 seconds with a little fresh solder.
4. **Test again.**

### W5 · ESP32 restarts by itself  (Auto: the reset reason is logged; studio shows "Restarted: power dip")
**Causes:**
1. The USB cable or port can't supply enough power (long thin cables, laptop hubs).
2. The USB wall adapter is under 1 A.
3. The LED supply is wired to the ESP32's 5Vin or 3V3 (it must not be).
4. LEDs switching on make the ground bounce (no common ground, or a thin ground wire).

**Fix:**
1. Use a short, good USB-C cable straight into the PC or the wall adapter, with no hub.
2. Check the wall adapter's label says 5 V and at least 1 A.
3. Check that nothing from the LED supply touches the ESP32's 5Vin or 3V3 pins. Only its GND joins, and only through the GND rail.
4. If it only happens when the LEDs get bright: go to L6.

### W6 · A sensor's PWR light is off  (Symptom)
**Fix:**
1. Unplug. Check that sensor's 3V3 wire (W1 for A, W2 for B) runs from an ESP32 **3V3** pin (left pins 1 and 2) to the sensor's **3V3** (right-side pin 8).
2. Check its ground wire (W3 for A, W4 for B) runs from an ESP32 **GND** to the sensor's **G** (right-side pin 7).
3. Re-seat both. Plug in.
4. Still off: move that sensor's 3V3 and G wires onto the other sensor's board, the one that works. If the good board's light then goes off, the wires or the ESP32 pins are at fault. If it lights, the first board is faulty: use a spare.

### W7 · Heat or a burning smell  (Symptom)
1. **Unplug the USB and switch off the LED supply now.**
2. Wait 5 minutes. Don't touch hot parts.
3. Look for:
   - a 3V3 or 5V wire landing on a GND pin;
   - LED 5 V wired to a sensor or ESP32 pin;
   - a solder bridge between two pins.
4. Photograph both sides of every board and send the photos to me **before** powering up again. A board that got hot may be damaged, so it will be tested on its own first.

### W8 · ESP32 not in Device Manager  (Symptom)
1. Try the other USB-C port on the ESP32. Only the COM/UART port shows as "USB-SERIAL CH343".
2. Try another cable. Many USB-C cables charge only.
3. Try another USB port on the PC.
4. If it shows with a yellow triangle, install the CH343 driver (build guide Step 9).
5. If it shows up then vanishes every few seconds, the board is resetting: go to W5.

---

## 4. Firmware (F)

### F1 · Wrong sensor firmware  (Auto: C0 reads the sensor's firmware identity)
**You see:** "Sensor B is running the presence detector" (or "unknown firmware").

**Fix:** reflash that sensor with `i2c_distance_detector.bin` (build guide Step 13), then **Test again**. Every spare needs this when it arrives.

### F2 · Sensor reports a setup error  (Auto: the sensor's status register error flags)
**You see:** "Sensor A: configuration error" or "calibration error".

**Causes:**
1. Something was in front of the sensor, very close, while it calibrated (a hand, a cable, the foil shield on the wrong side).
2. A setting outside its limits.
3. The firmware update was interrupted.

**Fix:**
1. Clear everything within 30 cm of the sensor's front. Check the foil shield is **behind** the board, not in front of it.
2. Studio: **Tuning (C10) → Reset to defaults**.
3. Press the sensor's RST button, then **Test again**.
4. Still failing: reflash (Step 13). Then try a spare.

### F3 · ESP32 firmware and Ring Studio versions don't match  (Auto: on connect)
**You see:** "Ring Studio is newer than the ring's firmware" (or older).

**Fix:** `git pull`, then do both uploads (build guide Step 29: **Upload**, then **Upload Filesystem Image**). Or use **Settings → Update** once updates over Wi-Fi are in.

### F4 · Sensor reflash problems (CubeProgrammer)  (Symptom)
**Won't connect ("Unable to connect", "No response"):**
1. Interface must be **UART**, not ST-LINK or USB.
2. Put the sensor into loading mode again, **right before** clicking Connect: hold BOOT, press and release RST, release BOOT.
3. Port: pick the sensor's COM number (Device Manager, under Ports). If there is none, install the CH340 driver (build guide Step 9).
4. Baudrate 115200. Parity Even is the tool's default for this; leave the other settings as they are.
5. Close anything else using that COM port (VS Code Monitor, another CubeProgrammer window).
6. Try another cable or USB port.
7. The sensor must **not** be wired to the ESP32 while reflashing.

**Connects but programming fails:**
1. Start address must be `0x08000000`.
2. Check the file is `i2c_distance_detector.bin` for the **XM125** (not for another Acconeer module).
3. Click **Full chip erase** (the eraser icon), confirm, then program again.

### F5 · VS Code "Upload" to the ESP32 fails  (Symptom)
**"Could not open port" or "port busy":** close the Monitor (the trash-can icon on the terminal) and any other serial program, then Upload again.

**"Failed to connect to ESP32" or "Wrong boot mode":**
1. Hold the ESP32's **BOOT** button.
2. Press and release its **RST** button.
3. Release BOOT.
4. Click Upload again.
5. After the upload finishes, press RST once to start the new program.

**"No serial port found":** use the COM/UART USB-C port and a data cable (W8).

**Build errors (red text before uploading):** run `git pull` (you may have half an update), then click **Clean** and **Upload** again. If it still fails, copy the red text and send it to me.

---

## 5. Sensor health (S)

Run these checks with the **wand**, not a hand.

### S1 · Sensor sees nothing  (Auto: C0 "wave test" asks you to hold the wand 20 cm in front of each sensor)
**Likely causes:**
1. The module is facing away from the sink. The radar sends out of the **blue module's face**, not the board's edge or back.
2. Something is covering the module: foil, metal tape, a metal mount, a sticker with a metallic print, or the aluminium LED channel.
3. The wand is too close (nearer than 60 mm is ignored on purpose).
4. The start or end range in C10 has been changed.
5. The radar chip is damaged (static discharge, a dropped board, a solder bridge on the module).

**Fix:**
1. Look at the board. The blue module must face into the sink, with nothing in front of it. The foil shield goes **behind**.
2. Hold the wand 20 to 30 cm straight in front of the module and **Test again**.
3. C10 → **Reset to defaults**.
4. Swap test (section 2).
5. Try the board on a clear desk with nothing near it. Still nothing: replace it with a spare.

### S2 · Distance offset against the tape measure  (Auto: bench test T3; and C7 reports each sensor's offset)
**You see:** every reading is about the same amount off, for example 25 mm long at every distance.

**What's normal:** up to about 40 mm of offset is expected. The resin cover and the mounting add delay, and C7 measures and removes it. You only need to act if the offset is bigger, or different between runs.

**Fix:**
1. Measure from the front face of the blue module to the **near surface** of the ball, not its centre.
2. Remove anything between the sensor and the wand.
3. If the offset is over 60 mm, or changes by more than 10 mm between runs: check the mount is rigid, then go to S4.

### S3 · Error grows with distance  (Auto: T3; C7 per-hole errors grow with distance)
**You see:** close readings are right, but the far readings are wrong by more and more.

**Causes:**
1. The tape measure is not in a straight line to the module.
2. The wand is at the edge of the beam, so the reading comes off something else.
3. Wrong sensor firmware or settings.

**Fix:**
1. Re-measure in a straight line from the module face.
2. Place the wand straight in front of the sensor for this test.
3. Reset settings (C10), then reflash (Step 13) if it persists.
4. Swap in a spare to compare.

### S4 · Noisy readings  (Auto: C0/C7 hold the wand still 3 s; the spread must be under 5 mm)
**You see:** "Sensor A noise 11 mm (limit 5 mm)", or numbers jumping with nothing moving.

**Likely causes:**
1. The mount or the board wobbles (loose screw, board resting on wires).
2. The target is at the edge of the beam, giving a weak echo.
3. Something moving nearby: a fan, a curtain, a person behind the rig.
4. Another 60 GHz device nearby: another radar demo, some smart-home presence sensors (see N3).
5. A damaged sensor.

**Fix:**
1. Press gently on the sensor board. If it moves, tighten the mount.
2. Hold the wand straight in front of the module, 20 to 40 cm away, and **Test again**.
3. Turn off fans and stop people moving behind the rig. **Test again**.
4. Switch off any other radar or presence gadgets nearby.
5. Swap test (section 2). If the noise follows the board, use a spare.

### S5 · One sensor much weaker than the other  (Auto: C7 compares A and B on mirror-image holes; a gap over 6 dB fails)
**Likely causes:**
1. Different angles: one is aimed or tilted differently (P4, P5).
2. Something partly in front of one sensor: a cable, mount lip, tape.
3. Different cover thickness, if the sensors sit behind resin.
4. A damaged sensor.

**Fix:**
1. Look along each sensor's line of sight to the sink centre, and clear anything in the way.
2. Set both to the same angles: 45° inward, about 20° down.
3. **Test again.** Still weak: swap the two boards between corners. If the weakness moves with the board, replace that board.

---

## 6. Placement, angle and distance (P)

### P1 · Sensor is not where you measured it  (Auto: C7 compares its fitted position with what you typed in C2; over 30 mm fails)
**Likely causes:**
1. Typed in the wrong units (inches entered as mm, or the other way round). This is the most common cause.
2. Measured to the board's corner instead of the **centre of the blue module**.
3. Measured from the wrong corner or the wrong edge.
4. The template was placed crooked or shifted, so the fit is off rather than the sensor.

**Fix:**
1. In C1/C2, check the units switch, then re-enter the positions.
2. Re-measure the centre of each blue module: across from the sink's **left** edge, and forward from its **back** edge. Also measure its height relative to the ring top (above is +, below is −).
3. Re-lay the template (P2 steps 1 and 2), then re-run C7.

### P2 · Calibration fit error too high  (Auto: C7; the pass mark is below 12 mm RMS, with a per-hole list)
**You see:** "Fit error 21 mm (limit 12)". The studio highlights the worst holes in red.

**Likely causes:**
1. The template moved during the run, or is not square to the sink.
2. The wand was tilted, or not pushed exactly to its mark.
3. The wrong hole was used (the studio asked for hole 7 and the wand went into hole 6).
4. A hand or arm was in the beam while the wand was held.
5. The sensor mount moved during the run.
6. The ball foil is crumpled or loose.
7. The sensor positions typed in C2 are badly off (P1).

**Fix:**
1. Line the template's back edge up with the ring's back edge, and its left edge with the left edge. Tape it down at the corners.
2. Check the wand marks sit at 60 mm and 160 mm from the **ball's centre**.
3. If only 1 to 3 holes are red: click them and redo **only those holes**. Hold the wand vertical, keep your hand above the card, and wait for the beep.
4. If most holes are bad: check the mounts are tight (P10), fix the positions (P1), then **Redo all**.
5. Re-wrap the ball smoothly if the foil is crumpled.
6. Still over 12 mm after a careful full run: send me the exported C7 results (**Export** on the C7 screen).

### P3 · The same hole is always bad  (Auto: a C7 hole is the worst in 2 runs)
**Cause:** that hole is punched in the wrong place, or something near that spot gives a strong reflection (the drain, a basin seam).

**Fix:**
1. Measure the hole against the positions in build guide Step 31, and re-punch it if needed.
2. If it's right over the drain or a metal edge, that's expected. Click **Skip this hole**. Up to 2 holes can be skipped.

### P4 · Sensor aimed the wrong way (yaw)  (Auto: C7 maps each sensor's echo strength across the template and works out where the beam actually points)
**You see:** "Sensor A is aimed about 20° too far right. Rotate it left." The coverage map (C5) shows weak or red areas in the far corners.

**Fix:**
1. Loosen the mount and turn the sensor by the amount shown, in the direction shown. Viewed from above, sensor A should point at the sink centre (45° from the back edge) and so should sensor B (45° the other way).
2. Update the yaw in C3.
3. Re-run C7 and check the message has cleared.

### P5 · Sensor tilted too far down or too flat  (Auto: C7 compares echo strength at the 60 mm and 160 mm wand depths)
**You see:** "Sensor B is tilted too far down" (it sees the deep stop much better than the shallow one). Or "tilted too flat" (the other way round).

**Why it matters:**
- **Too far down:** it sees the basin floor strongly and loses hands held high.
- **Too flat:** it looks over the sink, sees people standing at it (R15), and loses hands held low.

**Fix:**
1. Adjust the tilt by about 5° in the direction shown.
2. Update the tilt in C3.
3. Re-run C7. Aim for the 60 mm and 160 mm strengths to be within 3 dB of each other.

### P6 · Zone too close to a sensor  (Auto: C5 and C7 flag holes nearer than 60 mm)
**Cause:** the sensor sits too far into the sink, so the corner zone is inside its blind distance.

**Fix:**
1. Move the sensor back into the ring, so the module sits at or just outside the sink's edge.
2. Update C2 and re-run C7.

### P7 · Mirror ambiguity  (Auto: C5 shows a red band)
**Cause:** the sensors are not both on the **back** edge, for example one on a side. Some positions then give the same pair of distances as another spot (R16).

**Fix:** put both sensors on the back edge, at the two back corners. Update C2 and check C5 shows no red band.

### P8 · Sensor spacing doesn't match the sink  (Auto: C2 compares the sensor spacing with the sink width; over 25 mm different warns)
**Fix:** check the sink width in C1 and both positions in C2 were entered in the same units. Re-measure if needed.

### P9 · Sensors at different heights  (Auto: C7 fitted heights differ by more than 20 mm)
**Fix:** adjust the mounts so both modules sit at the same height relative to the ring top. The fit copes with small differences, but a big one makes the corner zones less accurate. Re-run C7.

### P10 · Mount not rigid  (Auto: T29 runs C7 three times; positions must agree within 15 mm)
**Fix:** tighten the mounts and add a dab of hot glue or a second screw. The board must not move when pressed lightly. Re-run T29.

---

## 7. Background and surroundings (B)

### B1 · Something in the sink during background capture  (Auto: C6)
**You see:** "Echoes found inside the sink area during background capture."

**Fix:**
1. Remove everything from the sink: cups, the wand, tools, the template.
2. Step back at least 1 m. Nobody leans over the sink.
3. Wait 10 seconds, then **Capture again**.

### B2 · Strong reflections from the basin  (Auto: C6 measures the background echo strength; high values warn)
**You see:** "Strong background at 310 mm on sensor A". It usually comes from the drain, a seam, a metal edge, or the basin wall right in front of the sensor.

**Why it matters:** a hand at the same distance as a strong fixed echo is harder to pick out.

**Fix:**
1. Tilt that sensor up about 5° (P5), so it looks less at the basin floor.
2. Check for metal objects, clips or tools near the sink edge.
3. **Capture again.** If the warning stays but the calibration passes, you can continue: the background is recorded and ignored.

### B3 · Background has drifted  (Auto: C12 compares live readings with the last capture)
**You see:** "Recalibrate: the background has changed."

**Causes:**
1. Something moved, or was put down in the sink.
2. The rig was bumped.
3. Water or drops in the basin (on a wet rig).
4. A large temperature change (B8).

**Fix:**
1. Clear and dry the sink.
2. **C6 capture again.**
3. If the rig was bumped, also re-run C7 (P10).

### B4 · Metal near the sensors  (Symptom; also shows as S1, S5 or B2)
Metal near or in front of the sensor blocks or bends the radar: a metal table, the aluminium LED channel, foil on the wrong side, a metal mount, a steel backsplash right next to the module.

**Fix:**
1. Nothing metal within 5 cm **in front of** or beside the blue module.
2. The foil shield goes **behind** the board.
3. If the rig stands on a metal table, put a wooden board under it.
4. Re-run C6 and C7.

### B5 · Movement behind the sink shows as a hand  (Auto: C12 counts triggers with no hand confirmed; Symptom: water starts when someone walks behind)
**Cause:** two back-edge sensors can't tell "behind the sink" from "in it" (R16).

**Fix:**
1. The rig's back edge goes against a wall or a solid backboard.
2. Fit the foil shields behind both sensors.
3. Keep people from walking behind the rig.
4. Test with bench test T8.

### B6 · A person at the sink is seen as a hand  (Auto: C12 counts echoes just outside the front edge; Symptom: water starts when someone leans on the counter)
**Cause:** the sensors are tilted too flat, or someone is leaning over the front edge (R15).

**Fix:**
1. Tilt both sensors down by about 5° (P5).
2. Re-run C6 and C7.
3. Test with bench test T7.
4. If it persists, move the front row back in the zone editor (C9).

### B7 · Water or wet surfaces  (Symptom, wet rig only)
Water changes the echoes. Dry the basin and the sensor windows, then recapture the background (C6). On the wet product, keep water from running over the sensor windows (review P1).

### B8 · Temperature drift  (Auto: the sensor raises CALIBRATION_NEEDED)
**You see:** "Sensor A needs to recalibrate", often in the first 10 minutes, or in sun or near a heater.

**Fix:**
1. Before calibrating, let the rig **warm up for 10 minutes** after power-on.
2. Keep it out of direct sun and away from heaters or air-conditioning vents.
3. The ring recalibrates itself when the sink is empty. If the message repeats often, recapture C6.

---

## 8. Noise and interference (N)

### N1 · Frame rate too low  (Auto: always measured; under 20 per second per sensor fails)
**Causes:**
1. The bus speed was lowered to 100 kHz (W2): expect about 15% slower, still fine above 20.
2. Bus errors forcing retries (W2).
3. Too many screens connected over Wi-Fi.
4. Debug logging switched on.

**Fix:**
1. Fix any W2 errors first.
2. Close Ring Studio on every device except one.
3. **Settings → Logging → Off.**
4. **Test again.**

### N2 · Repeating ghost echoes at fixed distances  (Auto: C0/C12 look for echoes that repeat at the same place with nothing there)
**Causes:**
1. The two sensors transmitting at the same time. The firmware prevents this; if it happens, it's a bug for me.
2. Another radar nearby (N3).
3. A strong reflection bouncing between the basin walls.

**Fix:**
1. Switch other radar gadgets off.
2. Recapture C6.
3. If it persists, export the C12 log (**Export**) and send it to me.

### N3 · Another 60 GHz device nearby  (Symptom)
Some presence sensors, smart-home radars and other demos use 60 GHz.

**Fix:** switch them off, or move the rig 3 m or more away from them. Re-run C6.

### N4 · Bus errors when the LEDs are bright  (Auto: C12 compares the I2C error rate with LED brightness)
**Causes:**
1. The LED ground runs through the ESP32 instead of straight back to the supply.
2. LED power wires run beside the sensor cables.
3. The 1000 µF capacitor is missing.

**Fix:**
1. The LED supply's − goes straight to the GND rail, with a separate wire to the ESP32 GND (build guide Step 39).
2. Separate the sensor cables from the LED power wires.
3. Fit the capacitor at the strip's input end.
4. **Test again.**

### N5 · Wi-Fi keeps dropping  (Symptom)
**Fix:**
1. Keep the tablet within 5 m of the rig, with nothing metal between them.
2. **Settings → Wi-Fi channel**: try 1, 6 and 11.
3. Turn off the tablet's "switch to mobile data" or "smart network switch" setting.

---

## 9. Hand profile (H)

### H1 · Hand not detected at some points  (Auto: C8)
**Causes:**
1. The point is closer than 60 mm to a sensor (P6).
2. The hand is outside a sensor's beam (P4, P5).
3. A sleeve covering the hand. Wet or metallic sleeves reflect differently.
4. The hand is held too high, above the sensors' view.

**Fix:**
1. Roll sleeves back. Hold a flat, open hand, palm down, at the height the screen asks for.
2. Redo the point.
3. If the same points fail every time, check P4 and P5 with C7.

### H2 · Hand looks like an object  (Auto: C8 compares the hand's echo strength with the background objects)
**You see:** "Hand strength overlaps background." The ring could confuse a hand with a pot.

**Fix:**
1. Remove metal objects from around the sink.
2. Recapture C6.
3. Redo C8.

### H3 · Working hand depth looks wrong  (Auto: C8 result outside 20 to 200 mm)
**Fix:**
1. Redo C8, holding your hand the way you would really use the sink: "high" is just below the ring, "low" is about halfway down.
2. If it's still out of range, check the sensor heights in C2 (sign: above the ring top is +).

### H4 · A still hand looks like an object (stillness gap too small)  (Auto: C8 still hold and bench test T28)
**You see:** "Still-hand movement too close to a static object. Stillness rule held off."

**What it means:** the ring can't reliably tell a very still hand from an object, so the 10-second rule is switched off until this is fixed. Water still turns off 1 second after hands leave; only the "object left in the sink" protection is off.

**Fix:**
1. Check S4 first: a noisy sensor hides the difference.
2. Redo C8's still hold with a relaxed hand, not a rigid one.
3. Run T28 with 5 people. If there's still no clear gap, send me the export. The fix may need firmware changes.

### H5 · Hand samples inconsistent  (Auto: C8 per-point spread over 25 mm)
**Fix:** redo those points. Keep your arm relaxed and hold the position until the beep. Don't slide the hand as it settles.

---

## 10. Accuracy and behaviour (A)

Check with the quick check (C11) or the accuracy test (F16). The studio shows which zones fail.

### A1 · Back corner zones fail (Soap, Cup fill)  (Auto: C11/F16)
**Cause:** the known two-sensor limit (hand height), made worse by the corner being close to its sensor (R6).

**Fix, in order:**
1. Run C8 again, holding your hand at your normal height.
2. Check P5 (tilt) with C7.
3. In the zone editor (C9), move the back row's front edge forward by 10 to 20 mm, so the back zones are deeper.
4. Re-run C11.
5. If it's still under target after all of that, it's the case for the third sensor (R6).

### A2 · One zone always fails  (Auto: C11/F16)
**Fix:**
1. Check the nearest C7 holes to that zone for red marks, and redo them.
2. Look for something in the sink near that zone: the drain, a seam, an object.
3. Recapture C6 and re-run C11.

### A3 · Left and right mirrored  (Auto: C11 detects mirrored confusion)
**Cause:** sensors swapped (W3), or the A and B positions swapped in C2.

**Fix:** go to W3, then check C2 has A at the back-left (x near 0) and B at the back-right (x near the sink width).

### A4 · Zones shifted forward or back  (Auto: C11 detects a consistent front/back shift)
**Causes:** the sensors' forward (y) positions are wrong in C2, or the working hand depth is wrong.

**Fix:**
1. Re-measure each module's distance forward from the back edge, and correct C2.
2. Redo C8.
3. Re-run C7 and C11.

### A5 · A zone starts while the hand is still reaching  (Auto: T10 reach test)
**Cause:** the settle rule is too loose for this user or setup.

**Fix:** C10 → raise **Settle time** from 150 to 200 ms, or lower **Settle speed** from 250 to 200 mm/s. Re-run T10. Each change adds a little delay.

### A6 · Nothing starts  (Auto: the studio shows why, as "no hand", "frame flagged" or "not settled")
**Causes:**
1. **"No hand":** see H1.
2. **"Frame flagged: strength":** the hand's echo is outside the learned window. Redo C8.
3. **"Frame flagged: jump":** noisy readings (S4).
4. **"Not settled":** the hand never slows enough. Noise makes it look fast (S4), or the settle speed is too strict (C10, back to 250 mm/s).
5. **Zone blocked:** Soap already used this session, the Disposal already run, or Neutral. Take your hands out and try again.

### A7 · Water cuts off with a hand in the sink  (Auto: counted as a false-off, F4)
**Causes:**
1. The hand dropped out of view at one spot (H1).
2. The hand was held unusually still for 10 s (H4).
3. Bus errors (W2).

**Fix:**
1. Note where the hand was. Redo C8 points near there.
2. Check the false-off log in C12 for the reason shown.
3. If the stillness rule fired, redo T28.
4. C10 → raise **Gone frames** from 3 to 4 as a last resort (adds 50 ms before the off countdown).

### A8 · Water won't turn off  (Auto: C12 shows what the ring thinks is still there)
**Causes:**
1. An object left in the sink (it turns off within 10 s if the stillness rule is active; if not, see H4).
2. A person leaning over the front edge (B6).
3. Movement behind the sink (B5).
4. The disposal is running its fixed 15 s, which is normal.

**Fix:** look at the Operator view, where the dot shows where the ring thinks the hand is. Remove what is there, then work through B5 and B6.

### A9 · Water starts with nobody there  (Auto: C12 logs the trigger position)
**Causes:**
1. Movement behind the sink (B5).
2. A person or pet walking close past the front (B6).
3. A fan, curtain or plant moving near the sink.
4. A background change after recalibration (B3).

**Fix:** check the logged position.
- Behind or at the back edge: B5.
- At the front edge: B6.
- Mid-sink: B3.
- Stop moving things near the sink.

### A10 · Slow to respond  (Auto: F3 shows the response time; over 300 ms fails)
**Fix:**
1. N1 (frame rate).
2. S4 (noise stretches the settle).
3. C10 → check **Settle time** is 150 ms.

---

## 11. LED ring (L)

### L1 · LEDs stay dark  (Symptom; Auto: C0 lights the ring white at low brightness for 2 s)
**Causes, most likely first:**
1. Wired to the strip's **far** end. Data only goes in at the input end (the arrows point away from it).
2. No common ground between the LED supply and the ESP32 (build guide Step 39.3).
3. Level shifter pin 1 (1OE) not tied to GND, or pin 14 (VCC) not on 5V.
4. No 5 V reaching the strip: blown fuse, or a switched-off supply.
5. Wrong strip type: 12 V, or a plain RGB strip with R, G, B pads (see doc 03).
6. D1 not on GPIO4 (left pin 4), or D2 not on chip pin 3.

**Fix:**
1. Check the arrows: your green data wire must be on the end they point **away** from.
2. Check the ground wire from ESP32 right-header pin 21 to the GND rail.
3. Check chip pins 1 and 14 (build guide Step 37).
4. Check the fuse, and that the supply is on (most have a small light).
5. Check the strip's pad labels say 5V, DIN and GND.
6. **Test again.**

### L2 · Random colours or flicker  (Symptom)
**Causes:**
1. No level shifter (the direct-wire stopgap).
2. A long data wire (over 15 cm from the chip to the strip).
3. The 330 Ω resistor missing.
4. A weak ground.
5. The capacitor missing.

**Fix:** fit the 74AHCT125 and the resistor, keep the data wire short, check the ground, and fit the capacitor. **Test again.**

### L3 · Wrong colours (red shows as green)  (Auto: C0 shows red, green and blue in turn, and asks what you see)
**Fix:** answer the colour test, and the studio sets the strip's colour order automatically.

### L4 · Far end dim or yellowish  (Symptom)
**Fix:** feed 5V and GND at **both** ends with 18 AWG wire (build guide Step 40). **Test again** at full brightness.

### L5 · Only part of the ring lights  (Auto: C0 lights LEDs one at a time and you count)
**Causes:**
1. The LED count is set too low.
2. A bad solder joint or cut at a join.
3. A damaged LED stops everything after it.

**Fix:**
1. **Settings → LED count**: set the real number.
2. Find the last LED that lights. The joint or LED **just after** it is the fault: reflow that joint, or cut out that LED and bridge the gap.

### L6 · ESP32 restarts when the LEDs get bright  (Auto: reset reason plus brightness log)
**Fix:**
1. The ESP32 must be powered only by its own USB-C, never by the LED supply.
2. Check the grounds (N4).
3. **Settings → LED brightness cap**: lower it.
4. Check the LED supply is at least 4 A.

---

## 12. Wi-Fi and Ring Studio (U)

### U1 · Can't see or join ArtesianRing  (Symptom)
**Fix:**
1. Check the ESP32 is powered, and that its status LED shows green or blue (not red).
2. Stand within 5 m.
3. Use the password you set in build guide Step 30. The first-time temporary password is shown in the Monitor.
4. Unplug the ESP32 and plug it back in, then wait 20 seconds.
5. Still missing: open the Monitor (build guide Step 21, item 7) and send me the first 30 lines.

### U2 · Joined, but the page won't load  (Symptom)
**Fix:**
1. Type exactly `http://192.168.4.1` (http, not https).
2. If the phone or tablet says "no internet", choose **Stay connected** or **Use this network anyway**.
3. Turn off mobile data while using the ring.
4. Try another browser.

### U3 · Screen laggy  (Symptom)
**Fix:** use one device at a time, close other browser tabs, and turn off Engineering view when you don't need it.

### U4 · Forgotten Wi-Fi password or studio PIN  (Symptom)
**Fix (resets the password and PIN only; calibration is kept):**
1. Make sure the ESP32 is powered and has been running for at least 20 seconds. **Do not hold BOOT while plugging in**: that puts the chip into its built-in download mode and nothing runs (unplug and replug to get out of it).
2. Press and hold the ESP32's **BOOT** button for **10 seconds**. The status LED turns amber at 3 seconds (keep holding) and then flashes white 3 times at 10 seconds.
3. Release. The ring is back to the temporary password, which is shown in the Monitor (build guide Step 21, item 7).
4. Set a new password and PIN (build guide Step 30).

### U5 · No sound  (Symptom)
**Fix:**
1. Tap the screen once, since browsers only allow sound after a tap.
2. Check the Sound button in the bottom bar says **Sound on**.
3. Turn up the device volume, and turn off any silent or mute switch.

### U6 · Laptop backup can't find the ESP32 over USB  (Symptom)
**Fix:**
1. Use Chrome or Edge (Web Serial does not work in other browsers).
2. Open the backup at `http://localhost:8080` (build guide Step 46), not at 192.168.4.1.
3. Plug the ESP32's COM port into the laptop, click **Connect USB**, and pick the CH343 port.
4. Close the VS Code Monitor first, since only one program can use the port at a time.

### U7 · `git pull` refuses to update  (Symptom)
**You see:** "Your local changes would be overwritten".

**Fix:** you (or a tool) changed a project file. To keep my version and set yours aside:
```powershell
cd "$HOME\code\artesian-ring-poc"
git stash
git pull
```
Your changes are kept in the stash if you need them; tell me before using them.

---

## 13. When to send it to me

Send me the item's code, what you tried, and the **Export** file from the screen where it failed, when:
- a fix list is finished and the check still fails;
- a board got hot (W7);
- C7 is still over 12 mm after a careful full run (P2);
- T28 shows no stillness gap (H4);
- repeating ghost echoes won't go away (N2).
