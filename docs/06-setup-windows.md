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

```powershell
cd $HOME\code
git clone https://github.com/NathanTaylorOps/artesian-ring-poc.git
cd artesian-ring-poc
code .
```

## 5. Build and flash the ESP32 (once Phase 0 code is in the repo)

In VS Code: **Terminal → New Terminal**, then:

```powershell
cd firmware
pio run -t upload
pio run -t uploadfs
pio device monitor
```

If `pio` is not recognised, use the PlatformIO toolbar (alien-head icon on the left) → **Upload**, then **Upload Filesystem Image**.

## 6. Check the geometry maths yourself

```powershell
python tools\geometry_sim.py
```
