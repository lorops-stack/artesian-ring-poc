// defaults.h - factory defaults. Every value here can be changed live in the
// Ring Studio calibration studio and is saved to flash (calibration JSON).
#pragma once
#include <stdint.h>

// ---- Sensing plane (spec 2, studio C1) ---------------------------------------
constexpr float PLANE_W_MM = 488.95f;  // 19.25 in, current bench sensor baseline
constexpr float PLANE_D_MM = 482.60f;  // 19.00 in, current bench sensor line to front edge

// ---- Sensor geometry (studio C2/C3), origin = back-left corner, y toward user
struct SensorPose { float x_mm, y_mm, z_mm, yaw_deg, tilt_deg; bool enabled; };
// Flat slot mount (production build): sensors in the gap between the undermount sink and the countertop, level with the plane, no tilt.
constexpr SensorPose DEFAULT_A = {   0.0f, 0.0f, 0.0f,  45.0f, 0.0f, true  };
constexpr SensorPose DEFAULT_B = { 488.95f, 0.0f, 0.0f, 135.0f, 0.0f, true  };
constexpr SensorPose DEFAULT_C = { 244.475f, 482.60f, 0.0f, 270.0f, 0.0f, false }; // reserved

// Hand depth is mm BELOW the sensor plane (negative = above it). Flat mount: the hand is about level with the sensors.
constexpr float HAND_DEPTH_MIN_MM = -30.0f;  // studio C4 (for the coverage prediction)
constexpr float HAND_DEPTH_MAX_MM = 60.0f;
constexpr float HAND_DEPTH_WORK_MM = 0.0f;   // set in the Aim screen's side view; C8 keeps it in the flat mount

// ---- XM125 distance detector (review R5, R7) ----------------------------------
constexpr uint32_t DET_START_MM = 60;     // default firmware value 250 would hide corner zones
constexpr uint32_t DET_END_MM   = 850;

// ---- Echo hold-over: reuse a sensor's last echoes for this many frames when it drops out (about 45 ms each)
constexpr uint8_t ECHO_HOLD_FRAMES = 2;

// ---- Latch state machine (spec 4, studio C10) -----------------------------------
constexpr uint16_t SETTLE_MS          = 150;
constexpr float    SETTLE_SPEED_MMPS  = 250.0f;
constexpr uint8_t  GONE_FRAMES        = 3;       // exit countdown is timed from the LAST frame seen
constexpr uint16_t EXIT_DELAY_MS      = 1000;
constexpr uint16_t STILL_OFF_MS       = 10000;   // perfectly still this long = an object, not a hand (spec 4.4, Q9)
// Still-hand threshold: measured in calibration (C7 static ball vs C8 still hand), not a fixed default.
constexpr uint16_t DISPOSAL_HOLD_MS   = 1000;
constexpr uint32_t DISPOSAL_RUN_MS    = 15000;
constexpr uint32_t BG_RELEARN_IDLE_MS = 30000;   // IDLE with no echoes only
constexpr uint32_t CLEAN_MODE_MS      = 60000;
constexpr uint16_t CLEAN_HOLD_MS      = 3000;    // still in Neutral (Kitchen) to start clean mode
constexpr uint8_t  PRESENT_FRAMES     = 2;       // frames of a MOVING target to start a session

// ---- Smart functions (spec 5) ---------------------------------------------------------
constexpr float FLOW_GPM        = 1.5f;    // decided 30 Sep 2026 (review Q4)
constexpr float BASELINE_GPM    = 2.2f;    // US federal max for kitchen faucets
constexpr float SOAP_DOSE_ML    = 0.8f;
constexpr float CUP_VOLUME_ML   = 350.0f;  // presets 350 / 750 / 2000 (F23); cup fill uses cold (mains) water
constexpr float HOT_SET_F       = 110.0f;
constexpr float HOT_CAP_F       = 120.0f;  // anti-scald limit, never exceeded
constexpr float WARM_F          = 100.0f;

// ---- LEDs (review R11) -----------------------------------------------------------------
constexpr uint16_t LED_COUNT          = 132;   // ~2.2 m at 60/m, set to actual
constexpr uint8_t  LED_MAX_BRIGHTNESS = 90;    // of 255, about 2.8 A worst case on a >= 4 A supply

// ---- Wi-Fi access point (review R12, R21) ----------------------------------------------------
constexpr const char* AP_SSID = "ArtesianRing";
// WPA2 password: set on first boot from Ring Studio and stored in flash (NVS).
// Never commit a password to this repo (review R21).
