# 08 · Build Guide: every step, start to finish

Follow the steps in order. If anything goes wrong at any step, open `09-troubleshooting.md`: its symptom finder (section 1) takes you to the fix. Ring Studio shows the same fix codes on screen.

Each step says **who** does it:

- **YOU**: you do it, exactly as written.
- **CLAUDE**: I do it (code, docs, fixes). You wait for my message, then carry on.
- **CHECKPOINT**: stop and send me what it asks for. Do not go past a checkpoint until I reply.

The software (firmware and the Ring Studio live site) is built by Claude in three phases. Your job in those steps is to download each new version, load it onto the ESP32 and check it works.

**Starting early:** Ring Studio's screens (Showcase, Operator view, calibration studio, sound, demo loop) can be built before the hardware arrives, because they already run on a simulated hand. If you want that, tell me "start the UI now" and Part 11 runs alongside Parts 1 to 10.

---

## Part 1: What you have and what to buy (desk, about 30 min)

### Step 1 (YOU): Lay out what you already have
Put these on the bench and tick each one:
- [ ] ESP32-S3 board (black, two USB-C ports)
- [ ] Sensor board 1 (red, SparkFun XM125)
- [ ] Sensor board 2 (red, SparkFun XM125)
- [ ] 5 V LED strip coil
- [ ] 12 V LED strip coil
- [ ] LED power supply
- [ ] A USB-C cable that carries **data**, not just charging. A cable that came with a phone or a laptop usually does. If a cable doesn't make Windows show a new device in Step 9, it is charge-only; swap it.
- [ ] Female-to-female jumper wires (at least 10)
- [ ] Soldering iron, solder, 2 spare header pins

### Step 2 (YOU): Read the LED strip labels
1. Unroll about 30 cm of the **5 V** coil.
2. Find a cut point: a pair of copper pads with a small scissors symbol, every 3 LEDs or so.
3. Read the tiny letters printed on the pads. You will see three or four labels, for example `5V DIN GND` or `+5V DO GND`.
4. Photograph the pads close up, with the letters readable.
5. Do the same for the **12 V** coil.

### Step 3 (YOU): Read the power supply label
1. Find the sticker on the LED power supply (usually on the bottom or the back).
2. Find the line that starts with **OUTPUT**. It reads like `OUTPUT: 5V ⎓ 4A`.
3. Photograph the sticker.

### CHECKPOINT 1
Send me the three photos: the 5 V strip pads, the 12 V strip pads and the supply sticker. I'll tell you which strip to use and whether the supply is big enough.

### Step 4 (YOU): Order the parts
Order these now. Nothing in Parts 2 to 5 needs them, so keep going while they ship.

| # | Search for | Qty | Why |
|---|---|---|---|
| 1 | "SparkFun Qwiic cable female jumper 4-pin" | 3 | Neat sensor cables for mounting later |
| 2 | "74AHCT125 DIP-14" | 2 | LED data level shifter (one spare) |
| 3 | "330 ohm resistor" (a small pack) | 1 pack | LED data line |
| 4 | "1000uF 16V electrolytic capacitor" | 1 pack | Smooths LED power |
| 5 | "inline blade fuse holder 18 AWG" plus "5A blade fuse" | 1 + 2 | Protects the LED power |
| 6 | "18 AWG red black wire" | 3 m | LED power |
| 7 | "half size breadboard" | 1 | Holds the level-shifter chip |
| 8 | "SparkFun XM125" (spares) | 2 to 3 | Demo insurance |
| 9 | "ping pong balls" and a "1/4 inch wooden dowel" 16 in or longer | 1 each | Calibration wand (Part 8) |
| 10 | Poster board, at least 24 × 22 in | 1 sheet | Calibration template (Part 8) |

---

## Part 2: Set up your computer (about 45 min)

### Step 5 (YOU): Open PowerShell
1. Click **Start**.
2. Type `PowerShell`.
3. Click **Windows PowerShell**. A blue or black window opens.

### Step 6 (YOU): Install Git, VS Code and Python
1. Click inside the PowerShell window.
2. Copy this line, paste it (right-click pastes) and press **Enter**:
   ```powershell
   winget install --id Git.Git -e
   ```
3. If it asks to agree to terms, type `Y` and press Enter. Wait for "Successfully installed".
4. Do the same with each of these lines, one at a time:
   ```powershell
   winget install --id Microsoft.VisualStudioCode -e
   ```
   ```powershell
   winget install --id Python.Python.3.12 -e
   ```
5. If PowerShell says `winget` is not recognized: open the **Microsoft Store**, search **App Installer**, click **Update** (or Get), then repeat this step.

### Step 7 (YOU): Check the installs
1. **Close** PowerShell and open a new one (Step 5). New programs are only found in a new window.
2. Paste each line and press Enter:
   ```powershell
   git --version
   python --version
   code --version
   ```
3. Each one should print a version number. If any prints an error, stop and send me a screenshot.
4. Install the PlatformIO add-on and a maths library:
   ```powershell
   code --install-extension platformio.platformio-ide
   python -m pip install numpy
   ```

### Step 8 (YOU): Download the project
Paste these lines one at a time:
```powershell
New-Item -ItemType Directory -Force "$HOME\code" | Out-Null
cd "$HOME\code"
git clone https://github.com/lorops-stack/artesian-ring-poc.git
```
A GitHub sign-in window opens. Sign in as **lorops-stack** and click **Authorize**. When it finishes, you have a folder `C:\Users\<you>\code\artesian-ring-poc`.

**Getting my updates later:** whenever I tell you "pushed", run:
```powershell
cd "$HOME\code\artesian-ring-poc"
git pull
```

### Step 9 (YOU): Check the USB drivers
1. Press **Windows key + X**, then click **Device Manager**.
2. Click the arrow next to **Ports (COM & LPT)** to open it. Leave the window open.
3. Plug the ESP32 into the PC with your data cable. Try the **left** USB-C port first (the one marked COM or UART on the back of the board).
4. A new line should appear under Ports, like `USB-SERIAL CH343 (COM5)`. Write down the COM number.
   - If a new line appears but it doesn't say CH343, unplug and try the ESP32's other USB-C port. Use the port that shows CH343.
   - If nothing appears, try another cable (yours may be charge-only).
   - If the line has a yellow warning triangle: go to wch-ic.com, search `CH343SER`, download it, run it and click **INSTALL**. Then unplug and replug.
5. Unplug the ESP32. Plug in **sensor A** by its own USB-C port. A line like `USB-SERIAL CH340 (COM6)` should appear. If it has a yellow triangle, download and install `CH341SER` from wch-ic.com the same way.
6. Unplug the sensor.

### Step 10 (YOU): Install STM32CubeProgrammer (the sensor flashing tool)
1. In your browser, search `STM32CubeProgrammer download` and open the st.com page.
2. Click **Get Software**, then the Windows version. It asks you to log in: create a free account (you'll get a confirmation email).
3. Unzip the download, run the `.exe` inside, and click **Next** through the installer with the default choices.

### Step 11 (YOU): Get the sensor firmware file
1. Go to Acconeer's developer site (search `Acconeer developer site`) and create a free account.
2. Find the **XM125** software download (it may be called "XM125 software" or "A121 SDK for XM125"). Download it.
3. Right-click the downloaded zip, then **Extract All**.
4. Open the extracted folder. In the search box at the top right of File Explorer, type `i2c_distance_detector`. The file `i2c_distance_detector.bin` should appear. Right-click it, then **Open file location**, and note where it is.

### CHECKPOINT 2
Tell me:
- Steps 7 to 11 worked;
- the ESP32 shows as CH343 on a COM port, and which USB-C port (left or right) did it;
- you found `i2c_distance_detector.bin`.

If you can't find the file, send a screenshot of the extracted folder.

---

## Part 3: Prepare the sensors (about 45 min)

### Step 12 (YOU): Label the sensors
With a permanent marker, write **A** on the back of one sensor board and **B** on the other.

### Step 13 (YOU): Reflash sensor A
The sensors ship with the wrong program. This replaces it (review R4).
1. Nothing else plugged in. Plug **sensor A** into the PC by its own USB-C port.
2. Put it into loading mode. The two buttons are at the bottom of the board:
   1. Press and **hold BOOT**.
   2. While holding BOOT, press and release **RST**.
   3. Release **BOOT**.
3. Open **STM32CubeProgrammer** from the Start menu.
4. On the right side of the window, in the blue connection panel:
   1. Click the drop-down that says **ST-LINK** and change it to **UART**.
   2. **Port**: pick the COM number sensor A had in Step 9. If the list is empty, click the small refresh icon next to it.
   3. **Baudrate**: 115200.
   4. Click the green **Connect** button. The log at the bottom should say "Data read successfully" or show the device, and the button turns into **Disconnect**.
   5. If it fails, redo the button sequence in step 2, then click Connect again. Still failing: troubleshooting **F4**.
5. On the far left, click the second icon down (a down arrow into a chip: **Erasing & Programming**).
6. Next to **File path**, click **Browse** and pick `i2c_distance_detector.bin`.
7. **Start address**: type `0x08000000` (zero, x, zero, eight, then six zeros).
8. Click **Start Programming**. Wait. A box saying **File download complete** appears. Click OK.
9. Click **Disconnect** (top right). Press **RST** on the sensor once. Unplug it.

### Step 14 (YOU): Reflash sensor B
Repeat Step 13 exactly with **sensor B**.

### CHECKPOINT 3
Tell me both boards showed "File download complete". If either failed, send a screenshot of the whole CubeProgrammer window.

### Step 15 (YOU): Solder one pin into each sensor's RST hole
1. Hold sensor A as in your photo: USB-C at the top, buttons at the bottom.
2. Find the **left** row of holes (the row without pins). The **bottom** hole is labelled **RST**.
3. Push one header pin into that hole, so the long end points the **same way** as the pins you already soldered on the right side.
4. Tip: push the pin into a breadboard first, then lay the sensor over it. That keeps it straight.
5. Heat the joint for 2 to 3 seconds and feed a little solder. A good joint is a shiny cone. A ball means it needs more heat.
6. Do the same on sensor B.
7. Do **not** add anything to the WU pin you already have. It stays unconnected.

---

## Part 4: Stage 1 wiring and first power-up (about 30 min)

Keep open: `docs/wiring-stage1-sensors.png` (the stage 1 diagram).

### Step 16 (YOU): Set up
1. Unplug **everything** from the PC.
2. Lay the ESP32 on the table **component side up** (the silver module at the top, USB-C ports at the bottom). This is the view in the diagram.
3. **Watch out:** the ESP32's pins stick out underneath. Plug the jumper wires on from below, but **do not flip the board over** to do it. Flipped, its left and right sides swap, and every pin count would be wrong. If you must flip it, put a strip of tape on the underside marking "LEFT" first.
4. Lay sensor A above-left of the ESP32 and sensor B below-left, both with the USB-C at the top, as in the diagram.

### Step 17 (YOU): Connect the 10 wires, one at a time
For each wire:
- count the pin position down from the **top** of that header;
- use the suggested colour where you can;
- push it on firmly.

| Tick | Wire | ESP32 end | Sensor end | Colour |
|---|---|---|---|---|
| ☐ | W1 | left header, **pin 1** (3V3) | sensor A, right side, **pin 8** (3V3) | red |
| ☐ | W2 | left header, **pin 2** (3V3) | sensor B, right side, **pin 8** (3V3) | red |
| ☐ | W3 | left header, **pin 22**, the very bottom (GND) | sensor A, right side, **pin 7** (G) | black |
| ☐ | W4 | **right** header, **pin 1**, the very top (GND) | sensor B, right side, **pin 7** (G) | black |
| ☐ | W5 | left header, **pin 12** (GPIO8) | sensor A, right side, **pin 9** (SDA) | blue |
| ☐ | W6 | left header, **pin 15** (GPIO9) | sensor A, right side, **pin 10** (SCL) | yellow |
| ☐ | W7 | left header, **pin 10** (GPIO17) | sensor B, right side, **pin 9** (SDA) | blue |
| ☐ | W8 | left header, **pin 11** (GPIO18) | sensor B, right side, **pin 10** (SCL) | yellow |
| ☐ | W9 | left header, **pin 6** (GPIO6) | sensor A, **left** side, **pin 9**, the bottom (RST) | purple |
| ☐ | W10 | left header, **pin 7** (GPIO7) | sensor B, **left** side, **pin 9**, the bottom (RST) | purple |

On the sensors, the right side counts down from BOOT (pin 1): BOOT, IO1, IO0, TX, RX, ADDR, **G (7)**, **3V3 (8)**, **SDA (9)**, **SCL (10)**, WU (11). **WU (11) gets no wire.**

### Step 18 (YOU): Check every wire
1. Go down the table again, wire by wire. Follow each wire with your finger from end to end.
2. The most common mistakes are SDA and SCL swapped (W5/W6, W7/W8), and one pin out on the ESP32's left header.
3. Check that no bare metal from two wires touches.

### Step 19 (YOU): First power-up
1. Plug the ESP32's **COM** port (the one that showed CH343 in Step 9) into the PC.
2. Look at each sensor: the small **PWR** light (top left) should be on.
3. Touch each board lightly after 10 seconds. Warm is fine. **Hot, or any smell: unplug immediately** and follow troubleshooting **W7**. A PWR light that stays off: troubleshooting **W6**.
4. In Device Manager, the CH343 COM port should appear as before.
5. Look at the small RGB light near the ESP32's USB ports. It may stay dark with no firmware yet; that is fine for now. On YD boards it only works if the tiny solder pads marked **RGB** (next to the light) are bridged. If they are open, add a small blob of solder across them now, with the board unplugged (troubleshooting **U1**).
6. Leave it plugged in.

### CHECKPOINT 4
Send me:
- a clear photo from above showing all 10 wires;
- whether both PWR lights are on.

---

## Part 5: Phase 0, reading the sensors (CLAUDE, then YOU)

### Step 20 (CLAUDE): Write the Phase 0 firmware
I write the sensor driver and a test program that prints both sensors' echoes 20+ times a second. I push it and message you.

### Step 21 (YOU): Load it onto the ESP32
1. Get my update (Step 8, "Getting my updates later").
2. Open **VS Code**. Click **File**, then **Open Folder**, and pick `C:\Users\<you>\code\artesian-ring-poc\firmware`. Click **Select Folder**. If it asks whether you trust the authors, click **Yes**.
3. Wait 1 to 3 minutes the first time while PlatformIO downloads the ESP32 tools (progress shows in the bottom bar).
4. Click the **alien-head icon** in the left bar (PlatformIO).
5. Under **PROJECT TASKS**, open **esp32s3**, then **General**.
6. Click **Upload**. A terminal opens at the bottom. Wait for `SUCCESS`.
   - If it fails, see troubleshooting **F5**. The usual fix: hold **BOOT** on the ESP32, press and release **RST**, release BOOT, then click Upload again.
7. Click **Monitor** (same list). Text scrolls in the terminal.

### Step 22 (YOU): Read the output
You should see lines similar to:
```
A: 1 echo  412 mm (str 1840)   B: 1 echo  388 mm (str 1520)   21.6 Hz
```
1. With nothing near the sensors, most lines should show few or no echoes.
2. Hold your hand about 30 cm from sensor A. A's distance should read about 300 mm.
3. Move your hand closer and further. The number should follow smoothly.
4. Do the same for B.

### Step 23 (YOU): Bench tests T1 to T4
1. **T1:** leave it running 10 minutes and watch for any line with `ERROR` or `I2C`.
2. **T2:** read the Hz number. It should be 20 or more.
3. **T3:** stand a ping-pong ball wrapped in foil on a book at 60, 150, 300, 600 and 800 mm from sensor A (tape measure from the front of the sensor module to the near side of the ball). Note each reading. Repeat for B.
4. **T4:** clear the area in front of the sensors and let it run for 10 minutes. Note any echoes that appear.
5. To copy the output: click in the terminal, press **Ctrl+A**, then **Ctrl+C**, paste into a text file and save it.

If a sensor shows nothing, jumpy numbers or "I2C" errors, see troubleshooting **S1**, **S4** or **W2**.

### CHECKPOINT 5
Send me the saved output and your T3 readings. I check the sensors are healthy before any mounting.

---

## Part 6: Mount the sensors on the rig (about 1 to 2 hours)

### Step 24 (CLAUDE): Mount design
I send a 3D-print file for the sensor mounts. Each mount holds the board **upright** with the module facing into the sink, 45° inward and adjustable tilt (review R17). I need two measurements from you first: the ring's width and height at the back corners, and the sink depth. I'll ask when we get here.

### Step 25 (YOU): Print and fit the mounts
1. Print two mounts.
2. Fit sensor A at the **back-left** corner and B at the **back-right**, with the module (the blue part) facing the sink.
3. Set the tilt to about 20° down.

### Step 26 (YOU): Shield and backboard (review R16)
1. Stick a piece of foil tape (or glue a small piece of kitchen foil onto card) **behind** each sensor, covering the back of the board. The foil must not touch any pins.
2. Put the rig with its back edge against a wall, or stand a board (plywood or foam board, at least 60 × 40 cm) behind it.

### Step 27 (YOU): Route the cables
1. Replace the loose jumpers with the Qwiic cables (or longer jumpers) so the ESP32 sits in a dry spot behind or under the ring.
2. Keep each sensor cable under 50 cm.
3. Re-check all 10 connections against the Step 17 table.

---

## Part 7: Phase 1, the brain and first screens (CLAUDE, then YOU)

### Step 28 (CLAUDE): Build Phase 1
I build:
- the position maths;
- the full latch state machine with its unit tests;
- the calibration studio (C1 to C8, C11);
- a first live Ring Studio page served by the ESP32 over its own Wi-Fi.

### Step 29 (YOU): Load the firmware and the website
1. Get my update (`git pull`).
2. In PowerShell, build the website files:
   ```powershell
   cd "$HOME\code\artesian-ring-poc"
   python tools\build_ui.py
   ```
3. In VS Code: alien-head icon, then **PROJECT TASKS**, **esp32s3**, **General**, then **Upload**. Wait for SUCCESS.
4. Then, under **Platform**, click **Upload Filesystem Image**. Wait for SUCCESS.

### Step 30 (YOU): Connect a laptop or tablet to the ring
1. On your laptop, tablet or phone, open Wi-Fi settings and join **ArtesianRing**.
2. The first time, it has a temporary password that the Monitor prints at boot (Step 21, item 7). If the text has scrolled away, keep the Monitor open and press **RST** on the ESP32 to reprint it.
3. Open a browser and go to `http://192.168.4.1`
4. Ring Studio asks you to set a new Wi-Fi password and a studio PIN. The Wi-Fi password must be **8 to 63 characters**. Choose them, write them down and keep them private. Forgotten later: troubleshooting **U4**.
5. On a tablet: browser menu, then **Add to Home Screen**.

---

## Part 8: Calibrate (about 30 min the first time)

### Step 31 (YOU): Make the calibration template
1. Cut the poster board to exactly **23 × 21 in** (the sink opening).
2. Mark the **back edge** (the edge that goes against the sensors).
3. Draw 16 dots on a 4 × 4 grid:
   - across, from the **left** edge: **2⅞, 8⅝, 14⅜, 20⅛ in**;
   - down, from the **back** edge: **2⅝, 7⅞, 13⅛, 18⅜ in**.
4. Punch a hole about 10 mm (⅜ in) wide at each dot.
5. Number the holes 1 to 16, left to right, back row first.

### Step 32 (YOU): Make the calibration wand
1. Wrap a ping-pong ball tightly and smoothly in kitchen foil.
2. Glue it onto the end of the wooden dowel.
3. Measure from the **centre of the ball** up the dowel. Mark it clearly at **60 mm** (mark 1) and at **160 mm** (mark 2).

### Step 33 (YOU): Run the calibration in Ring Studio
Ring Studio walks you through each screen. If a check fails, the screen shows a fix code (for example **P2**) with step-by-step instructions and a **Test again** button. Work through it before moving on; the same fixes are in `09-troubleshooting.md`.

0. **Warm-up and hardware check (C0):** power on and wait 10 minutes (the sensors settle as they warm). Then run C0 and follow its prompts: the wand wave test, holding the wand still, and the LED tests once the LEDs are fitted.
1. **Plane (C1):** check 23 × 21 in.
2. **Sensors (C2 to C4):** type your tape-measured positions (to the **centre of each blue module**) and angles. Check the units switch shows the units you measured in. Then do **Identify**: hold your hand in front of the back-left sensor when asked.
3. **Coverage (C5):** look at the heatmap. Tell me if large red areas show.
4. **Background (C6):** empty the sink, step back, click **Capture**.
5. **Wand (C7):** lay the template on top of the ring, back edge to the sensors. For each hole it asks for: push the wand down until **mark 1** is level with the card, hold still until it beeps, then down to **mark 2**, hold, beep. After 32 readings it shows a **fit error**: it must be **below 12 mm**. Remove the template.
6. **Hand profile (C8):** hold your hand where the screen and the ring lights show, naturally high and low, then hold it as still as you can for 5 s.
7. **Quick check (C11):** 5 tries per zone. All must pass.
8. **Save:** name it (for example "Bench 1") and click **Save**.

### CHECKPOINT 6
Send me screenshots of the C5 heatmap, the C7 fit error and the C11 result.

---

## Part 9: Phase 1 tests (about 2 hours)

### Step 34 (YOU): Run the tests
`docs/07-test-and-demo-plan.md` lists them. Ring Studio has a **Tests** screen that walks through each one and records the results. Run T5 to T11, T16 to T21 and T28 to T30 in order. T30 deliberately causes faults, to prove the studio diagnoses them correctly. For each, follow the on-screen instruction, then press **Pass** or **Fail** and add a note.

### Step 35 (YOU): Export the results
In Ring Studio, go to **Tests**, then **Export**. Save the file.

### CHECKPOINT 7
Send me the exported file. I fix anything that failed before Phase 2.

---

## Part 10: Stage 2, the LED ring (about 2 hours, once the parts arrive)

Keep open: `docs/wiring-stage2-leds.png`. **Everything unplugged while wiring.**

### Step 36 (YOU): Fit the chip in the breadboard
1. The breadboard has two long rails along each edge. Mark one rail **5V** (red line) and the one next to it **GND** (blue or black line).
2. Push the 74AHCT125 chip across the **centre gap**, with the **notch pointing up**. Pin 1 is top-left, next to the dot.

### Step 37 (YOU): Tie off the chip's pins
Use short jumper wires from each pin's breadboard row to the rail named:

| Chip pin | Goes to |
|---|---|
| 1 | GND rail |
| 4 | 5V rail |
| 5 | GND rail |
| 7 | GND rail |
| 9 | GND rail |
| 10 | 5V rail |
| 12 | GND rail |
| 13 | 5V rail |
| 14 | 5V rail |
| 6, 8, 11 | nothing |

### Step 38 (YOU): Prepare the strip
1. Cut the 5 V strip at a cut point so it fits around the ring (about 2.2 m, 132 LEDs). Cut exactly across the middle of the copper pads.
2. Find the **input end**: the printed arrows point **away** from it.
3. Solder three wires to the input end's pads:
   - red 18 AWG to **5V**;
   - black 18 AWG to **GND**;
   - a thin green wire to **DIN**.
4. At the **far end**, solder red to **5V** and black to **GND**. Leave **DO** empty.
5. Solder the **1000 µF** capacitor across the input end's 5V and GND pads: the **striped** leg to **GND**, the other leg to **5V**.

### Step 39 (YOU): Make the data connections
1. **D1:** ESP32 **left header pin 4 (GPIO4)** to chip **pin 2**.
2. **D2:** chip **pin 3** to one leg of the **330 Ω** resistor. The other resistor leg goes to the strip's **green DIN** wire. Put the resistor as close to the strip as you can.
3. **Pull-down:** one leg of the **10 kΩ** resistor to chip **pin 2**, the other leg to the **GND rail**.
4. ESP32 **right header pin 21 (GND)**, the second pin from the bottom on the right, to the **GND rail**. The board has four GND pins, all connected inside it: W3 uses left pin 22 and W4 uses right pin 1, so this one is free.

### Step 40 (YOU): Make the power connections
1. Supply **+** (5 V) → **fuse holder** → the **5V rail**.
2. Supply **−** → the **GND rail**.
3. From the 5V rail, run the red 18 AWG wires to **both** strip ends' 5V.
4. From the GND rail, run the black 18 AWG wires to **both** strip ends' GND.
5. Plug the LED supply and the ESP32's USB wall adapter into **one switched power strip**.

### Step 41 (YOU): Check, then power up
1. Check every connection against the stage 2 diagram.
2. Turn the power strip on. The LEDs should stay dark or show a soft idle chase, not full white.
3. After 1 minute, feel the supply, the wires and the strip. Warm is fine; hot is not. **Hot: switch off** and send me a photo.

If the LEDs stay dark, flicker or show the wrong colours: troubleshooting **L1** to **L6**.

### CHECKPOINT 8
Send a short video of the ring lighting up.

---

## Part 11: Phase 2, the full live site (CLAUDE, then YOU)

### Step 42 (CLAUDE): Build the full Ring Studio
I build everything in the approved design (spec sections 7, 8 and 8b):
- the **Showcase** screen (rendered sink, LED ring, water, radar pulses, hand markers, sound, demo loop);
- the **Operator view**;
- the full **calibration studio**;
- smart functions, profiles, all three layouts and water saved;
- **record and replay**, the usage dashboard and the accuracy test;
- clean mode, over-the-air updates and the laptop backup copy.

I push it in stages, and each stage tells you what to check.

### Step 43 (YOU): Load each stage
Same as Step 29: `git pull`, `python tools\build_ui.py`, **Upload**, then **Upload Filesystem Image**. Later stages can update over Wi-Fi from Ring Studio's **Settings** screen, then **Update**.

### Step 44 (YOU): Check each stage
Work through the checklist I send with each stage. Tick each item as working or not working.

### CHECKPOINT 9 (after each stage)
Send me the ticked checklist and any screenshots of problems.

---

## Part 12: Record the pre-recorded demo (about 1 hour)

A recording is a real session captured from the sensors. It plays back through the same screens, so it looks exactly like live use. It is your backup if the hardware fails on the day (review R29).

### Step 45 (YOU): Record 3 good sessions
1. In Ring Studio, go to **Record**, then **Start**.
2. Do a clean run: soap, then rinse in **Warm** without leaving the sink; hands out; **Cup fill** until full; hands out; **Waterfall**; hands out.
3. Click **Stop**, name it (for example "Demo run 1") and click **Export**. A file downloads. Save it.
4. Record two more: one in the **Accessible** layout, and one with a guest's hands.

### Step 46 (YOU): Load the recordings into the laptop backup
1. In PowerShell:
   ```powershell
   cd "$HOME\code\artesian-ring-poc"
   python -m http.server 8080 --directory ui\dist
   ```
2. In Chrome, go to `http://localhost:8080`
3. Go to **Replay**, then **Import**, and pick the saved files.
4. Play one to check it. Press **Ctrl+C** in PowerShell to stop the laptop server when done.

### Step 47 (YOU): Keep the recordings safe
Copy the three files to a USB stick and to OneDrive. Send one to me: I add it to the project as a regression test (`firmware/test/fixtures/`).

---

## Part 13: Final testing with other people (about 2 hours)

### Step 48 (YOU): Accuracy test with 5 people
1. In Ring Studio, go to **Tests**, then **Accuracy test**.
2. Each person does 20 tries per zone: the screen shows a target dot, they reach in naturally and stop. This takes about 10 minutes per person.
3. Include at least one person wearing a watch or rings.
4. Export the results after each person.

### Step 49 (YOU): Run tests T12 to T15 and T22 to T27
Same as Step 34.

### CHECKPOINT 10
Send me all the exported results. I confirm the demo is ready or tell you exactly what to fix.

---

## Part 14: Demo day

### Step 50 (YOU): The day before
1. Charge the tablet and laptop.
2. Pack everything, plus: the calibration template, the wand, the backboard, foil tape, the switched power strip, spare jumper wires, the spare sensors and a USB stick with the recordings.

### Step 51 (YOU): Set up on site (allow 30 minutes)
Follow the pre-demo checklist in `docs/07-test-and-demo-plan.md`, item by item:
1. Rig's back edge against a wall or the backboard.
2. Sensors upright with the module facing in, nothing metal in front.
3. Power strip on; tablet joined to ArtesianRing.
4. Full calibration (Step 33).
5. Quick check: 5 tries per zone.
6. Showcase screen on; tap once to turn sound on.
7. Laptop open on the backup copy with a recording loaded.

### Step 52 (YOU): Run the demo
Follow the 5-minute run sheet at the end of `docs/07-test-and-demo-plan.md`. If anything goes wrong with the hardware, switch to the laptop and play "Demo run 1".
