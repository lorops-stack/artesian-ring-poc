#include "geometry.h"
#include <string.h>
#include <stdio.h>

namespace ring {

static const char* FN_NAMES[] = { "soap", "disposal", "cup", "waterfall", "neutral", "hot", "warm", "cold", "" };
const char* fnName(Fn f) { return FN_NAMES[(int)f]; }
Fn fnFromName(const char* s) { if (!s) return Fn::None; for (int i = 0; i < 8; i++) if (strcmp(s, FN_NAMES[i]) == 0) return (Fn)i; return Fn::None; }
bool fnIsWater(Fn f) { return f == Fn::Cup || f == Fn::Waterfall || f == Fn::Hot || f == Fn::Warm || f == Fn::Cold; }

int buildZones(const Layout& L, Zone* out, int maxOut) {
  int k = 0; float y = 0;
  for (int r = 0; r < L.nRows; r++) {
    const LayoutRow& row = L.rows[r];
    float h = (r == L.nRows - 1) ? (1.0f - y) : row.h;
    for (int c = 0; c < row.n && k < maxOut; c++) {
      Zone& z = out[k++]; snprintf(z.id, sizeof z.id, "%s-%d-%d", L.id, r, c);
      z.row = r; z.col = c; z.fn = row.fns[c]; z.x0 = (float)c / row.n; z.x1 = (float)(c + 1) / row.n; z.y0 = y; z.y1 = y + h;
    }
    y += h;
  }
  return k;
}
const Zone* rawZone(const Zone* z, int n, float xf, float yf) {
  for (int i = 0; i < n; i++) if (xf >= z[i].x0 && xf < z[i].x1 && yf >= z[i].y0 && yf < z[i].y1) return &z[i];
  if (n && xf >= 0 && xf <= 1 && yf >= 0 && yf <= 1) return &z[n - 1];
  return nullptr;
}
const Zone* zoneAt(const Zone* z, int n, const Plane& p, float xmm, float ymm, const Zone* prev, float hyst) {
  float xf = xmm / p.w, yf = ymm / p.d, hx = hyst / p.w, hy = hyst / p.d;
  if (prev && xf >= prev->x0 - hx && xf <= prev->x1 + hx && yf >= prev->y0 - hy && yf <= prev->y1 + hy) return prev;
  const Zone* c = rawZone(z, n, xf, yf); if (!c) return nullptr;
  bool inX = (c->x0 <= 0 || xf >= c->x0 + hx) && (c->x1 >= 1 || xf <= c->x1 - hx);
  bool inY = (c->y0 <= 0 || yf >= c->y0 + hy) && (c->y1 >= 1 || yf <= c->y1 - hy);
  return (inX && inY) ? c : nullptr;
}
void zoneCentre(const Zone& z, const Plane& p, float& x, float& y) { x = (z.x0 + z.x1) * 0.5f * p.w; y = (z.y0 + z.y1) * 0.5f * p.d; }

float range(const SensorPose& s, float x, float y, float h) { float dx = x - s.x, dy = y - s.y, dz = -h - s.z; return sqrtf(dx * dx + dy * dy + dz * dz); }
float planar(const SensorPose& s, float x, float y) { return hypotf(x - s.x, y - s.y); }
bool pairFeasible(float rA, float rB, const SensorPose& A, const SensorPose& B, float h) {
  float vA = h + A.z, vB = h + B.z;
  if (rA < fabsf(vA) || rB < fabsf(vB)) return false;
  float pA = sqrtf(rA * rA - vA * vA), pB = sqrtf(rB * rB - vB * vB), base = hypotf(A.x - B.x, A.y - B.y);
  return pA + pB >= base - 40 && fabsf(pA - pB) <= base + 40;
}
// Closed-form two-circle intersection in the sensor-baseline frame. Both solutions are mirror images across the
// line through the sensors; the one on the sink side (the side of the plane centre gx,gy) is returned. When the
// circles fall short of meeting, the point sits on the baseline between them and res says by how much they missed.
// Deterministic and identical in C++ and JS, with no dependence on a starting guess.
float locate(float rA, float rB, const SensorPose& A, const SensorPose& B, float h, float gx, float gy, float& x, float& y) {
  float vA = h + A.z, vB = h + B.z;
  float pA = rA * rA - vA * vA, pB = rB * rB - vB * vB; pA = pA > 0 ? sqrtf(pA) : 0; pB = pB > 0 ? sqrtf(pB) : 0;
  float ux = B.x - A.x, uy = B.y - A.y, base = hypotf(ux, uy); if (base < 1e-3f) { x = A.x; y = A.y + pA; return 0; }
  ux /= base; uy /= base; float nx = -uy, ny = ux;                             // n is perpendicular to the baseline
  if ((gx - A.x) * nx + (gy - A.y) * ny < 0) { nx = -nx; ny = -ny; }          // point n toward the sink
  float xp = (pA * pA - pB * pB + base * base) / (2 * base), y2 = pA * pA - xp * xp, yp = y2 > 0 ? sqrtf(y2) : 0;
  x = A.x + ux * xp + nx * yp; y = A.y + uy * xp + ny * yp;
  return hypotf(pA - hypotf(xp, yp), pB - hypotf(base - xp, yp));
}

bool maskHit(const Mask* m, int n, float x, float y) {
  for (int i = 0; i < n; i++) {
    if (m[i].kind == 1) { if (hypotf(x - m[i].x, y - m[i].y) <= m[i].a) return true; }
    else if (x >= m[i].x && x <= m[i].x + m[i].a && y >= m[i].y && y <= m[i].y + m[i].b) return true;
  }
  return false;
}

static bool isBg(const Echo* bg, int n, float d, float s) {
  for (int i = 0; i < n; i++) if (fabsf(bg[i].d - d) <= 15 && s < bg[i].s * 1.8f + 1) return true;
  return false;
}
// Hand strength envelope: a hand at range d returns about envRef * (300 / d) ^ envK. An echo more than envDb away from that
// is not a hand at that range (a metal wall is far above it, a second bounce far below). envRef 0 = off (C8 learns it).
bool strengthInEnvelope(const HandModel& h, float d, float s) {
  if (!(h.envRef > 0) || !(s > 0) || !(d > 0)) return true;
  float expct = h.envRef * powf(300.0f / d, h.envK), db = 20.0f * log10f(s / expct);
  return fabsf(db) <= h.envDb;
}
float geometryUncertainty(const SensorPose& A, const SensorPose& B, float x, float y, float h, float rangeSigma) {
  float rA = range(A,x,y,h), rB = range(B,x,y,h); if (rA < 1 || rB < 1) return 999;
  float j00=(x-A.x)/rA, j01=(y-A.y)/rA, j10=(x-B.x)/rB, j11=(y-B.y)/rB;
  float det=j00*j11-j01*j10; if (fabsf(det)<1e-4f) return 999;
  float i00=j11/det, i01=-j01/det, i10=-j10/det, i11=j00/det;
  float sx=rangeSigma*sqrtf(i00*i00+i01*i01), sy=rangeSigma*sqrtf(i10*i10+i11*i11);
  return hypotf(sx,sy);
}
Assoc associate(const Echo* eA, int nA, const Echo* eB, int nB, const AssocOpts& o) {
  Assoc out{}; out.flag = FLAG_NO_HAND; out.iA = out.iB = -1;
  int candA[10], candB[10], ca = 0, cb = 0; bool strengthFail = false;
  for (int i = 0; i < nA && i < 10; i++) { if (eA[i].s < o.hand->strMin || eA[i].s > o.hand->strMax || !strengthInEnvelope(*o.hand, eA[i].d, eA[i].s)) { strengthFail = true; continue; } if (isBg(o.bgA, o.nBgA, eA[i].d, eA[i].s)) continue; candA[ca++] = i; }
  for (int j = 0; j < nB && j < 10; j++) { if (eB[j].s < o.hand->strMin || eB[j].s > o.hand->strMax || !strengthInEnvelope(*o.hand, eB[j].d, eB[j].s)) { strengthFail = true; continue; } if (isBg(o.bgB, o.nBgB, eB[j].d, eB[j].s)) continue; candB[cb++] = j; }
  if (!ca || !cb) { out.flag = (nA || nB) ? (strengthFail ? FLAG_STRENGTH : FLAG_NO_HAND) : FLAG_NO_HAND; return out; }
  bool have = false, anyOutside = false, anyMasked = false; float bestScore = 0;
  // Pass 1: every pair that is geometrically possible, inside the sink and not in a dead area.
  struct Pair { int a, b; float x, y, res, rA, rB; }; Pair pr[100]; int np = 0;
  float gx = o.plane->w / 2, gy = o.plane->d / 2;                                  // the sink side of the baseline
  for (int i = 0; i < ca; i++) for (int j = 0; j < cb; j++) {
    float rA = eA[candA[i]].d - o.A->off, rB = eB[candB[j]].d - o.B->off;
    if (!pairFeasible(rA, rB, *o.A, *o.B, o.hand->zwork)) continue;
    float x, y; float res = locate(rA, rB, *o.A, *o.B, o.hand->zwork, gx, gy, x, y);
    // Hard interaction-plane boundary: an out-of-sink solution is never a hand candidate. Do not clamp it back onto an edge.
    if (x < 0 || x > o.plane->w || y < 0 || y > o.plane->d || res > 60) { anyOutside = true; continue; }
    if (o.masks && o.nMasks && maskHit(o.masks, o.nMasks, x, y)) { anyMasked = true; continue; }     // a dead area: this pair is ignored, the next best may still win
    pr[np++] = { candA[i], candB[j], x, y, res, rA, rB };
  }
  if (!np) { out.flag = anyMasked ? FLAG_MASKED : (anyOutside ? FLAG_OUTSIDE : FLAG_NO_HAND); return out; }
  // First-arrival rule (nearWin). The direct path is the shortest path a radar pulse can take, so on each sensor the
  // nearest surviving echo is the hand and anything much further is a bounce off the sink or a body behind it. With an
  // established track the reference is the pair nearest the track instead, so a cup set down nearer the sensor than the
  // hand cannot steal it. Applied after the dead-area check so a reflector in a dead area never hides a real hand.
  float limA = 1e9f, limB = 1e9f;
  if (o.nearWin > 0) {
    float refA = 1e9f, refB = 1e9f;
    if (o.hasPrev) { int k0 = 0; float bd = 1e9f; for (int k = 0; k < np; k++) { float dd = hypotf(pr[k].x - o.prevX, pr[k].y - o.prevY); if (dd < bd) { bd = dd; k0 = k; } } refA = eA[pr[k0].a].d; refB = eB[pr[k0].b].d; }
    else for (int k = 0; k < np; k++) { if (eA[pr[k].a].d < refA) refA = eA[pr[k].a].d; if (eB[pr[k].b].d < refB) refB = eB[pr[k].b].d; }
    limA = refA + o.nearWin; limB = refB + o.nearWin;
  }
  for (int k = 0; k < np; k++) {
    const Pair& q = pr[k];
    if (eA[q.a].d > limA || eB[q.b].d > limB) continue;
    float trackErr = o.hasPrev ? hypotf(q.x - o.prevX, q.y - o.prevY) : 0;
    float unc = geometryUncertainty(*o.A, *o.B, q.x, q.y, o.hand->zwork);
    // Score evidence, not just range. Residual rejects inconsistent circle pairs; prediction rejects echoes moving
    // unlike the established hand; uncertainty mildly disfavors intrinsically ill-conditioned fixes.
    float score = q.rA + q.rB + 4.0f * q.res + 0.35f * (unc > 200 ? 200 : unc);
    if (o.hasPrev) score += 2.5f * trackErr;
    if (!have || score < bestScore) {
      have = true; bestScore = score; out.ux = q.x; out.uy = q.y;
      out.x = q.x; out.y = q.y;
      out.iA = q.a; out.iB = q.b; out.rA = q.rA; out.rB = q.rB; out.res = q.res; out.uncertainty = unc;
      float evidence = q.res + (o.hasPrev ? 0.35f * trackErr : 0) + 0.15f * (unc > 200 ? 200 : unc);
      out.confidence = 1.0f / (1.0f + evidence / 25.0f);
    }
  }
  if (!have) { out.flag = anyMasked ? FLAG_MASKED : (anyOutside ? FLAG_OUTSIDE : FLAG_NO_HAND); return out; }
  if (o.hasPrev && o.maxJump > 0) {
    float dynamicJump = o.maxJump + fminf(180.0f, fabsf(o.speed) * fmaxf(0.0f, o.dt) * 1.5f) + fminf(100.0f, out.uncertainty);
    if (hypotf(out.ux - o.prevX, out.uy - o.prevY) > dynamicJump) { out.flag = FLAG_JUMP; return out; }
  }
  out.flag = FLAG_NONE; return out;
}

void Tracker::predict(uint32_t t, float& px, float& py) const {
  float dt = (t - t_) / 1000.0f; if (dt < 0) dt = 0; if (dt > 0.5f) dt = 0.5f;
  px = x_ + vx_ * dt; py = y_ + vy_ * dt;
}
void Tracker::update(float x, float y, uint32_t t, float& ox, float& oy, float& speed) {
  if (!has_) { has_ = true; x_ = x; y_ = y; vx_ = vy_ = 0; t_ = t; ox = x; oy = y; speed = 0; return; }
  float dt = (t - t_) / 1000.0f; if (dt < 0.001f) dt = 0.001f; t_ = t;
  float px = x_ + vx_ * dt, py = y_ + vy_ * dt, rx = x - px, ry = y - py;
  x_ = px + a_ * rx; y_ = py + a_ * ry; vx_ += b_ * rx / dt; vy_ += b_ * ry / dt;
  float sp = hypotf(vx_, vy_); if (sp > 3000) { vx_ *= 3000 / sp; vy_ *= 3000 / sp; sp = 3000; }
  ox = x_; oy = y_; speed = sp;
}

void templateHoles(const Plane& p, Hole* out) {
  static const float fr[4] = { 1 / 8.f, 3 / 8.f, 5 / 8.f, 7 / 8.f };
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) { Hole& h = out[j * 4 + i]; h.n = j * 4 + i + 1; h.x = fr[i] * p.w; h.y = fr[j] * p.d; }
}

}  // namespace ring
