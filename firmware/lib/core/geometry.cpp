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
float locate(float rA, float rB, const SensorPose& A, const SensorPose& B, float h, float gx, float gy, float& x, float& y) {
  x = gx; y = gy; const SensorPose* S[2] = { &A, &B }; float r[2] = { rA, rB }, res = 0;
  for (int it = 0; it < 12; it++) {
    float J[2][2], f[2];
    for (int k = 0; k < 2; k++) { float d = range(*S[k], x, y, h); if (d < 1e-6f) d = 1e-6f; J[k][0] = (x - S[k]->x) / d; J[k][1] = (y - S[k]->y) / d; f[k] = d - r[k]; }
    float a = J[0][0] * J[0][0] + J[1][0] * J[1][0] + 1e-6f, b = J[0][0] * J[0][1] + J[1][0] * J[1][1], c = J[0][1] * J[0][1] + J[1][1] * J[1][1] + 1e-6f;
    float g0 = J[0][0] * f[0] + J[1][0] * f[1], g1 = J[0][1] * f[0] + J[1][1] * f[1], det = a * c - b * b;
    if (fabsf(det) < 1e-9f) break;
    float dx = (c * g0 - b * g1) / det, dy = (a * g1 - b * g0) / det, step = hypotf(dx, dy);
    if (step > 200) { dx *= 200 / step; dy *= 200 / step; }
    x -= dx; y -= dy; res = hypotf(f[0], f[1]);
    if (step < 0.01f) break;
  }
  return res;
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
Assoc associate(const Echo* eA, int nA, const Echo* eB, int nB, const AssocOpts& o) {
  Assoc out{}; out.flag = FLAG_NO_HAND; out.iA = out.iB = -1;
  int candA[10], candB[10], ca = 0, cb = 0; bool strengthFail = false;
  for (int i = 0; i < nA && i < 10; i++) { if (eA[i].s < o.hand->strMin || eA[i].s > o.hand->strMax) { strengthFail = true; continue; } if (isBg(o.bgA, o.nBgA, eA[i].d, eA[i].s)) continue; candA[ca++] = i; }
  for (int j = 0; j < nB && j < 10; j++) { if (eB[j].s < o.hand->strMin || eB[j].s > o.hand->strMax) { strengthFail = true; continue; } if (isBg(o.bgB, o.nBgB, eB[j].d, eB[j].s)) continue; candB[cb++] = j; }
  if (!ca || !cb) { out.flag = (nA || nB) ? (strengthFail ? FLAG_STRENGTH : FLAG_NO_HAND) : FLAG_NO_HAND; return out; }
  bool have = false, anyOutside = false, anyMasked = false; float bestScore = 0; const float margin = 30;
  for (int i = 0; i < ca; i++) for (int j = 0; j < cb; j++) {
    float rA = eA[candA[i]].d - o.A->off, rB = eB[candB[j]].d - o.B->off;
    if (!pairFeasible(rA, rB, *o.A, *o.B, o.hand->zwork)) continue;
    float x, y, gx = o.hasPrev ? o.prevX : o.plane->w / 2, gy = o.hasPrev ? o.prevY : o.plane->d / 2;
    float res = locate(rA, rB, *o.A, *o.B, o.hand->zwork, gx, gy, x, y);
    if (x < -margin || x > o.plane->w + margin || y < -margin || y > o.plane->d + margin || res > 60) { anyOutside = true; continue; }
    if (o.masks && o.nMasks && maskHit(o.masks, o.nMasks, x, y)) { anyMasked = true; continue; }     // a dead area: this pair is ignored, the next best may still win
    float score = rA + rB; if (o.hasPrev) score += 2.5f * hypotf(x - o.prevX, y - o.prevY);
    if (!have || score < bestScore) {
      have = true; bestScore = score; out.x = x < 0 ? 0 : (x > o.plane->w ? o.plane->w : x); out.y = y < 0 ? 0 : (y > o.plane->d ? o.plane->d : y);
      out.iA = candA[i]; out.iB = candB[j]; out.rA = rA; out.rB = rB; out.res = res;
    }
  }
  if (!have) { out.flag = anyMasked ? FLAG_MASKED : (anyOutside ? FLAG_OUTSIDE : FLAG_NO_HAND); return out; }
  if (o.hasPrev && o.maxJump > 0 && hypotf(out.x - o.prevX, out.y - o.prevY) > o.maxJump) { out.flag = FLAG_JUMP; return out; }
  out.flag = FLAG_NONE; return out;
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
