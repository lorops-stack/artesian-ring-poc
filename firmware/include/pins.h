// pins.h - single source of truth for the Artesian Ring PoC pin layout.
// Board: ESP32-S3-N8R2 dev board (VCC-GND YD-ESP32-S3 layout, two USB-C ports).
// Every signal below is on the LEFT header of the ESP32 board, so all sensor
// and LED wiring leaves from one side. See docs/03-pinout-and-wiring.md.
//
// Pins deliberately NOT used:
//   GPIO0            BOOT button (read as the physical "calibrate" button only)
//   GPIO3, 45, 46    strapping pins, affect boot
//   GPIO19, 20       native USB D-/D+
//   GPIO43, 44       UART0 TX/RX (USB serial via the CH343 port)
//   GPIO35, 36, 37   reserved by PSRAM on octal-PSRAM variants; kept free for safety
//   GPIO48           onboard RGB LED (used as the status LED)
#pragma once

// ---- Sensor A: XM125, back-left corner, hardware I2C bus 0 ----------------
constexpr int PIN_A_SDA = 8;
constexpr int PIN_A_SCL = 9;
constexpr int PIN_A_RST = 6;    // to XM125 "RST" pad. Open-drain use: LOW = reset
constexpr int PIN_A_INT = 15;   // OPTIONAL, XM125 "INT". Not needed while WU jumper is closed

// ---- Sensor B: XM125, back-right corner, hardware I2C bus 1 ---------------
constexpr int PIN_B_SDA = 17;
constexpr int PIN_B_SCL = 18;
constexpr int PIN_B_RST = 7;
constexpr int PIN_B_INT = 16;   // OPTIONAL

// ---- Sensor C: RESERVED for a replacement third XM125 (front-centre) -------
// Software (bit-banged) I2C bus, because the ESP32-S3 has only two hardware buses
// and every XM125 is fixed at address 0x52.
constexpr int PIN_C_SDA = 10;
constexpr int PIN_C_SCL = 11;
constexpr int PIN_C_RST = 12;

// ---- XM125 bus settings ------------------------------------------------------
constexpr uint8_t  XM125_I2C_ADDR = 0x52;     // fixed; ADDR jumper not implemented in firmware
constexpr uint32_t I2C_FREQ_HZ    = 400000;   // drop to 100000 if a cable run exceeds ~50 cm

// ---- Outputs -------------------------------------------------------------------
constexpr int PIN_LED_RING_DATA = 4;   // WS2812B data, via 74AHCT125 level shifter + 330R
constexpr int PIN_STATUS_RGB    = 48;  // onboard WS2812, status colour
constexpr int PIN_CAL_BUTTON    = 0;   // onboard BOOT button, long-press = start calibration
