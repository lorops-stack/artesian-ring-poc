# 05 · Reflash the XM125s with the Distance Detector firmware

The boards ship with the **presence detector** firmware. This project needs the **distance detector** (`i2c_distance_detector.bin`). See review R4. Do this once per board, including every spare when it arrives, with the board **disconnected from the ESP32**.

## One-time setup (Windows)

1. Install **STM32CubeProgrammer** (free, from st.com; needs a free ST account).
2. Get `i2c_distance_detector.bin` for the XM125 from Acconeer's developer site (free account). Look for the XM125 / A121 software package, which contains the prebuilt `.bin` files.

## Flash each board

1. Label the boards **A** and **B** with a marker (spares: **S1**, **S2**, **S3**).
2. Plug the XM125's own USB-C port into the PC.
3. Enter bootloader mode: **hold BOOT, press and release RST, then release BOOT.**
4. Open STM32CubeProgrammer. In the connection panel on the right:
   - Interface: **UART**
   - Port: the COM port the board appears on (CH340). If it doesn't appear, install the CH340 driver.
   - Baudrate: 115200
   - Click **Connect**.
5. Go to **Erasing & Programming** (second icon on the left).
6. File path: browse to `i2c_distance_detector.bin`.
7. Start address: `0x08000000`
8. Click **Start Programming** and wait for "File download complete".
9. Click **Disconnect**, then press **RST** on the board.
10. Repeat for every other board.

## Check it worked
This gets verified in Phase 0: the firmware reads the detector's version and status registers over I2C and prints them. If CubeProgrammer won't connect over UART, the SparkFun hookup guide's "Flashing Firmware" section covers the alternative route through the Acconeer Exploration Tool.

Source: [SparkFun XM125 guide](https://docs.sparkfun.com/SparkFun_Qwiic_Pulsed_Radar_Sensor_XM125/single_page/)
