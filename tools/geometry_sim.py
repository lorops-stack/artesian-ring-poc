"""Geometry check for 2x range-only radar sensors at the back corners.

Sink opening 584 x 533 mm (23 x 21 in). Origin = back-left corner.
x to the right, y toward the user (front), z up. Sensors at z = 0 (ring level).
Hand sits at depth h below ring level (unknown to a 2-sensor system).
Prints: per-zone distances, trilateration depth-error gain, and a Monte Carlo
of zone accuracy for (a) pure trilateration with an assumed hand depth and
(b) calibrated: nearest calibrated reference point in rA/rB space (a simple stand-in
    for the calibrated position map in spec section 6).
"""
import numpy as np

W, D = 584.0, 533.0
A = np.array([0.0, 0.0]); B = np.array([W, 0.0])
cols, rows = 3, 3
cw, rh = W / cols, D / rows
NAMES = [["Soap", "Disposal", "Cup fill"],
         ["Waterfall", "Neutral", "Waterfall"],
         ["Hot", "Warm", "Cold"]]

def ranges(x, y, h):
    ra = np.sqrt((x - A[0])**2 + (y - A[1])**2 + h**2)
    rb = np.sqrt((x - B[0])**2 + (y - B[1])**2 + h**2)
    return ra, rb

def trilat(ra, rb, h_assumed):
    # planar ranges after removing assumed depth
    pa = np.sqrt(np.clip(ra**2 - h_assumed**2, 0, None))
    pb = np.sqrt(np.clip(rb**2 - h_assumed**2, 0, None))
    x = (pa**2 - pb**2 + W**2) / (2 * W)
    y = np.sqrt(np.clip(pa**2 - x**2, 0, None))
    return x, y

def zone(x, y):
    c = np.clip((x // cw).astype(int), 0, 2); r = np.clip((y // rh).astype(int), 0, 2)
    return r * 3 + c

print("Zone centre: planar ranges, and 1-sigma position error from 10 mm range noise")
for r in range(3):
    for c in range(3):
        x, y = (c + .5) * cw, (r + .5) * rh
        ra, rb = ranges(x, y, 0)
        # Jacobian of (ra, rb) wrt (x, y); position covariance = J^-1 S J^-T
        J = np.array([[(x-A[0])/ra, (y-A[1])/ra], [(x-B[0])/rb, (y-B[1])/rb]])
        Ji = np.linalg.inv(J); cov = Ji @ (np.eye(2)*100.0) @ Ji.T
        sx, sy = np.sqrt(np.diag(cov))
        print(f"  {NAMES[r][c]:9s} rA={ra:5.0f} rB={rb:5.0f}  sigma_x={sx:4.1f} sigma_y={sy:4.1f} mm")
print(f"Max range (far corner): {np.hypot(W, D):.0f} mm")

rng = np.random.default_rng(1)
N = 4000
sigma = 10.0  # mm range noise on a hand (distributed target)
for hlo, hhi, label in [(80, 80, "hand depth fixed 80 mm"), (30, 200, "hand depth 30-200 mm")]:
    # calibration: centroid per zone collected at mid-depth spread
    cal = {}
    for z in range(9):
        r, c = divmod(z, 3)
        xs = rng.uniform(c*cw + 0.2*cw, (c+1)*cw - 0.2*cw, 300)
        ys = rng.uniform(r*rh + 0.2*rh, (r+1)*rh - 0.2*rh, 300)
        hs = rng.uniform(hlo, hhi, 300)
        ra, rb = ranges(xs, ys, hs)
        cal[z] = np.array([ra.mean(), rb.mean()])
    C = np.array([cal[z] for z in range(9)])
    acc_t = np.zeros(9); acc_c = np.zeros(9)
    for z in range(9):
        r, c = divmod(z, 3)
        # sample the inner 70% of each zone (edges are ambiguous for any system)
        xs = rng.uniform(c*cw + 0.15*cw, (c+1)*cw - 0.15*cw, N)
        ys = rng.uniform(r*rh + 0.15*rh, (r+1)*rh - 0.15*rh, N)
        hs = rng.uniform(hlo, hhi, N)
        ra, rb = ranges(xs, ys, hs)
        ra += rng.normal(0, sigma, N); rb += rng.normal(0, sigma, N)
        xt, yt = trilat(ra, rb, (hlo + hhi) / 2)
        acc_t[z] = (zone(xt, yt) == z).mean()
        d = np.linalg.norm(np.stack([ra, rb], 1)[:, None, :] - C[None], axis=2)
        acc_c[z] = (d.argmin(1) == z).mean()
    print(f"\nMonte Carlo, {label}, noise {sigma:.0f} mm, inner 70% of each zone")
    print("  zone        trilat  calib")
    for z in range(9):
        r, c = divmod(z, 3)
        print(f"  {NAMES[r][c]:10s} {acc_t[z]*100:5.1f}%  {acc_c[z]*100:5.1f}%")
