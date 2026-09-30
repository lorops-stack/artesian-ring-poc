// defaults.h - factory defaults. Every value here can be changed live in the
// Ring Studio calibration studio and is saved to flash (calibration JSON).
#pragma once
#include <stdint.h>

// ---- Sensing plane (spec 2, studio C1) ---------------------------------------
constexpr float PLANE_W_MM = 584.2f;   // 23 in
constexpr float PLANE_D_MM = 533.4f;   // 21 in

// ---- Sensor geometry (studio C2/C3), origin = back-left corner, y toward user
struct SensorPose { float x_mm, y_mm, z_mm, yaw_deg, tilt_deg; bool enabled; };
constexpr SensorPose DEFAULT_A = {   0.0f, 0.0f, 0.0f,  45.0f, -20.0f, true  };
constexpr SensorPose DEFAULT_B = { 584.2f, 0.0f, 0.0f, 135.0f, -20.0f, true  };
constexpr SensorPose DEFAULT_C = { 292.1f, 533.4f, 0.0f, 270.0f, -20.0f, false }; // reserved

constexpr float HAND_DEPTH_MIN_MM = 30.0f;   // studio C4
constexpr float HAND_DEPTH_MAX_MM = 200.0f;

// ---- XM125 distance detector (review R5, R7) ----------------------------------
constexpr uint32_t DET_START_MM = 60;     // default firmware value 250 would hide corner zones
constexpr uint32_t DET_END_MM   = 850;

// ---- Latch state machine (spec 4, studio C10) -----------------------------------
constexpr uint16_t SETTLE_MS          = 150;
constexpr float    SETTLE_SPEED_MMPS  = 250.0f;
constexpr uint8_t  GONE_FRAMES        = 3;
constexpr uint16_t EXIT_DELAY_MS      = 1000;
constexpr uint16_t STATIC_ABSORB_MS   = 5000;
constexpr uint32_t MAX_RUN_WATER_MS   = 120000;
constexpr uint16_t DISPOSAL_HOLD_MS   = 1000;
constexpr uint32_t DISPOSAL_RUN_MS    = 15000;
constexpr uint32_t BG_RELEARN_IDLE_MS = 30000;

// ---- Smart functions (spec 5) ---------------------------------------------------------
constexpr float FLOW_GPM        = 1.5f;    // ASSUMPTION, confirm with Rod (review Q4)
constexpr float BASELINE_GPM    = 2.2f;    // US federal max for kitchen faucets
constexpr float SOAP_DOSE_ML    = 0.8f;
constexpr float CUP_VOLUME_ML   = 350.0f;
constexpr float HOT_CAP_F       = 120.0f;
constexpr float WARM_F          = 100.0f;

// ---- LEDs (review R11) -----------------------------------------------------------------
constexpr uint16_t LED_COUNT          = 132;   // ~2.2 m at 60/m, set to actual
constexpr uint8_t  LED_MAX_BRIGHTNESS = 90;    // of 255, keeps current under ~3 A

// ---- Wi-Fi access point (review R12) ----------------------------------------------------
constexpr const char* AP_SSID = "ArtesianRing";
