// geometry.h - zones with hysteresis, trilateration, echo association, tracker (spec section 6).
// Plain C++17, no Arduino headers. Mirrors ui/src/js/02-geometry.js; both run the same fixtures.
#pragma once
#include <stdint.h>
#include <math.h>

namespace ring {

enum class Fn : uint8_t { Soap, Disposal, Cup, Waterfall, Neutral, Hot, Warm, Cold, None };
const char* fnName(Fn f);
Fn fnFromName(const char* s);
bool fnIsWater(Fn f);

enum Flag : uint8_t { FLAG_NONE = 0, FLAG_NO_HAND = 1, FLAG_STRENGTH = 2, FLAG_OUTSIDE = 3, FLAG_JUMP = 4, FLAG_NOT_SETTLED = 5, FLAG_BLOCKED = 6, FLAG_STILL = 7, FLAG_MASKED = 8 };

struct Plane { float w = 584.2f, d = 533.4f; };
struct SensorPose { float x = 0, y = 0, z = 0, yaw = 45, tilt = 0, off = 0; bool on = true; };   // flat slot mount: level with the plane, no tilt
struct HandModel { float zmin = -30, zmax = 60, zwork = 0, strMin = 3, strMax = 60000, stillThr = 6; float envRef = 0, envK = 2, envDb = 12; };   // depth below the sensor plane (mm); envRef = hand strength at 300 mm (0 = envelope off)

// Dead areas: a fix inside one is ignored. Plane coordinates in mm. kind 0 = rectangle (x, y = back-left corner, a = width, b = height), 1 = circle (x, y = centre, a = radius).
constexpr int MAX_MASKS = 12;
struct Mask { char id[12] = ""; uint8_t kind = 0; float x = 0, y = 0, a = 0, b = 0; };
bool maskHit(const Mask* m, int n, float x, float y);

constexpr int MAX_ROWS = 4, MAX_COLS = 4, MAX_ZONES = MAX_ROWS * MAX_COLS;
struct LayoutRow { float h = 0; uint8_t n = 0; Fn fns[MAX_COLS] = { Fn::None, Fn::None, Fn::None, Fn::None }; };
struct Layout { char id[20] = ""; char name[24] = ""; uint8_t nRows = 0; LayoutRow rows[MAX_ROWS]; };

struct Zone { char id[28]; uint8_t row, col; Fn fn; float x0, x1, y0, y1; };
int buildZones(const Layout& L, Zone* out, int maxOut);
const Zone* rawZone(const Zone* z, int n, float xf, float yf);
// Hysteresis in mm: keep prev while inside its outer band; a new zone counts only hyst inside its inner edges.
const Zone* zoneAt(const Zone* z, int n, const Plane& p, float xmm, float ymm, const Zone* prev, float hyst);
void zoneCentre(const Zone& z, const Plane& p, float& x, float& y);

float range(const SensorPose& s, float x, float y, float h);
float planar(const SensorPose& s, float x, float y);
bool pairFeasible(float rA, float rB, const SensorPose& A, const SensorPose& B, float h);
// Closed-form solve of (x,y) from two ranges at hand depth h, taking the root on the side of (gx,gy); returns how far the circles missed (mm).
float locate(float rA, float rB, const SensorPose& A, const SensorPose& B, float h, float gx, float gy, float& x, float& y);

struct Echo { float d; float s; };
struct AssocOpts { const SensorPose* A; const SensorPose* B; const HandModel* hand; const Plane* plane; const Echo* bgA; int nBgA; const Echo* bgB; int nBgB; bool hasPrev; float prevX, prevY; float maxJump; const Mask* masks = nullptr; int nMasks = 0; float nearWin = 0; float dt = 0.045f; float speed = 0; };   // nearWin: mm; 0 = off
struct Assoc { uint8_t flag; float x, y, rA, rB, res; int iA, iB; float ux = 0, uy = 0; float uncertainty = 0, confidence = 0; };   // accepted x,y are inside the plane; ux,uy retain the raw solve for diagnostics/gating
bool strengthInEnvelope(const HandModel& h, float d, float s);
float geometryUncertainty(const SensorPose& A, const SensorPose& B, float x, float y, float h, float rangeSigma = 8.0f);
Assoc associate(const Echo* eA, int nA, const Echo* eB, int nB, const AssocOpts& o);

class Tracker {
 public:
  void reset() { has_ = false; vx_ = vy_ = 0; }
  bool has() const { return has_; }
  float vx() const { return vx_; } float vy() const { return vy_; }
  void update(float x, float y, uint32_t t, float& ox, float& oy, float& speed);
  void predict(uint32_t t, float& px, float& py) const;   // where the track should be at time t (no update)
  void setAlpha(float a) { if (a < 0.05f) a = 0.05f; if (a > 1.0f) a = 1.0f; a_ = a; b_ = 0.25f * a; }   // position smoothing: 1 = none, lower = steadier but slower to follow
 private:
  bool has_ = false; float x_ = 0, y_ = 0, vx_ = 0, vy_ = 0; uint32_t t_ = 0; float a_ = 0.6f, b_ = 0.15f;
};

// Calibration template (C7): 16 holes, back row first, left to right (mm)
struct Hole { int n; float x, y; };
void templateHoles(const Plane& p, Hole* out16);

}  // namespace ring
