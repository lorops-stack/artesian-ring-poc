# 06 · Setup on Windows (one time)

Run these in **PowerShell** (Start → type PowerShell → Enter). Copy each block exactly.

## 1. Install the tools

```powershell
winget install --id Git.Git -e
winget install --id Microsoft.VisualStudioCode -e
winget install --id Python.Python.3.12 -e
```

Close PowerShell and open a new one so the new commands are found, then run:

```powershell
code --install-extension platformio.platformio-ide
python -m pip install numpy
```

## 2. USB drivers
- **ESP32 board (CH343 chip):** plug the ESP32 into the USB-C port marked **COM** / **UART**. Windows 10/11 usually installs the driver itself. Check Device Manager → Ports (COM & LPT) for "USB-SERIAL CH343". If it shows a yellow warning, install the CH343 driver from wch-ic.com (search "CH343SER").
- **XM125 boards (CH340 chip):** same check with an XM125 plugged in. The driver is "CH341SER" from wch-ic.com.

## 3. Sensor flashing tools
Install **STM32CubeProgrammer** from st.com and create a free Acconeer developer account for the firmware file. Then follow `05-flash-xm125.md`.

## 4. Get the code

The repo is private, so the first `git clone` opens a GitHub sign-in window. Sign in as **NathanTaylorOps**.

```powershell
New-Item -ItemType Directory -Force "$HOME\code" | Out-Null
cd "$HOME\code"
git clone https://github.com/NathanTaylorOps/artesian-ring-poc.git
cd artesian-ring-poc
code .
```

## 5. Build and flash the ESP32 (once Phase 0 code is in the repo)

In VS Code: **Terminal → New Terminal**. The terminal opens in the repo folder. Then:

```powershell
python tools\build_ui.py
cd firmware
pio run -t upload
pio run -t uploadfs
pio device monitor
cd ..
```

- `build_ui.py` packs Ring Studio (including the Geist font files) into `ui\dist`, which `uploadfs` copies to the ESP32. It arrives in Phase 1; skip that line until then.
- If `pio` is not recognised, use the PlatformIO toolbar (alien-head icon on the left) → **Upload**, then **Upload Filesystem Image**.
- Press **Ctrl+C** to leave the monitor before running `cd ..`.

## 6. Run the tests without hardware (from Phase 1)

```powershell
cd firmware
pio test -e native
cd ..
```

## 7. Laptop copy of Ring Studio (backup, R29)

Serves the UI from the laptop, so USB Web Serial and session replay work even if the ESP32 is down. Run from the repo folder:

```powershell
python -m http.server 8080 --directory ui\dist
```

Then open `http://localhost:8080` in Chrome or Edge.

## 8. Check the geometry maths yourself

From the repo folder:

```powershell
python tools\geometry_sim.py
```
