// config.h - the whole configuration (spec section 8, docs/10-protocol.md "Configuration"). Defaults come from
// include/defaults.h. JSON in and out through ArduinoJson, which also builds on the host for the native tests.
#pragma once
#include <stdint.h>
#include "geometry.h"

namespace ring {

constexpr int MAX_LAYOUTS = 6, MAX_PROFILES = 6;

struct Tuning {
  uint16_t settleMs = 150; float settleSpeed = 250; float startSpeed = 60; uint8_t goneFrames = 3; uint16_t exitMs = 1000;
  uint32_t stillOffMs = 10000; uint8_t presentFrames = 2; uint16_t disposalHoldMs = 1000; uint32_t disposalRunMs = 15000;
  uint32_t cleanMs = 60000; uint16_t cleanHoldMs = 3000; uint16_t rangeStart = 60; uint16_t rangeEnd = 850; float threshSens = 1.0f;
  uint16_t i2cKhz = 400; bool log = false; uint8_t wifiCh = 6; uint16_t ledCount = 132; uint8_t ledBright = 90; char ledOrder[5] = "GRB";
  float hyst = 20; float beamHalf = 60; uint16_t ledOffset = 0; uint32_t bgRelearnIdleMs = 30000; float nearWin = 120;
};
struct Profile { char id[20] = "default"; char name[24] = "Default"; float hotF = 110, hotCapF = 120, warmF = 100, cupMl = 350, soapMl = 0.8f, flowGpm = 1.5f; };

// How the sensors are built into the sink (side view in Ring Studio's Aim screen). Not used by the firmware's maths except through the studio.
struct Rig { char mount[8] = "flat"; float slotH = 14, recess = 20, sinkDepth = 190, beamV = 35; };

struct Config {
  uint8_t schema = 1;
  Plane plane;
  SensorPose A, B, C;
  HandModel hand;
  Rig rig;
  Mask masks[MAX_MASKS]; uint8_t nMasks = 0;
  char layout[20] = "kitchen";
  Layout layouts[MAX_LAYOUTS]; uint8_t nLayouts = 0;
  Tuning tuning;
  char profile[20] = "default";
  Profile profiles[MAX_PROFILES]; uint8_t nProfiles = 0;
  char tempUnit[2] = "F";

  const Layout* findLayout(const char* id) const;
  Layout* findLayout(const char* id);
  const Layout* activeLayout() const;
  const Profile* activeProfile() const;
};

void setDefaults(Config& c);
void defaultLayouts(Config& c);
}  // namespace ring
