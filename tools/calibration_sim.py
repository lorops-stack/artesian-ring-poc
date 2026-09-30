"""Does the calibration do what we intend? Run: python tools/calibration_sim.py

Simulates many installations of the 2-sensor ring, each with realistic errors
the calibration is meant to remove, then measures zone accuracy (Kitchen 3x3,
hands reaching the inner 70% of each zone) with each calibration step added.

Errors in every simulated installation (unknown to the system):
  - sensor position vs the tape-measured value: x, y, z each ~15 mm (1 sigma)
  - fixed distance offset per sensor (resin cover, mounting): +10 to +35 mm
  - reading noise: 8 mm (1 sigma)
  - real hands held 40 to 160 mm below the ring (spec default guess: 115 mm)

Calibration steps modelled:
  C7  wand: a 40 mm foil ball on a rod with depth stops at 60 and 160 mm,
      put through a 4 x 4 grid template; fits each sensor's x, y, z and offset
  C8  hand profile: the user's hand at the 16 grid points (placed within about
      20 mm), high and low; sets the working hand depth and a small bias map
"""
import numpy as np

W, D = 584.2, 533.4
NOM = np.array([[0.0, 0.0, 0.0], [W, 0.0, 0.0]])
GX = np.array([1, 3, 5, 7]) / 8.0
GRID = np.array([[gx * W, gy * D] for gy in GX for gx in GX])
BALL_R = 20.0
rng = np.random.default_rng(11)


def ranges(S, p):  # S (2,3); p (...,3) -> (...,2)
    return np.linalg.norm(p[..., None, :] - S, axis=-1)


def locate(S, off, r, h):
    """Solve x, y for measured ranges r (N,2) at assumed hand depth h."""
    r = r - off
    xy = np.tile([W / 2, D / 2], (len(r), 1)).astype(float)
    hh = np.broadcast_to(h, (len(r),))
    for _ in range(8):
        p = np.column_stack([xy, -hh])
        diff = p[:, None, :] - S
        d = np.linalg.norm(diff, axis=-1)
        J = diff[..., :2] / d[..., None]
        res = d - r
        JTJ = np.einsum('nki,nkj->nij', J, J) + 1e-6 * np.eye(2)
        step = np.linalg.solve(JTJ, np.einsum('nki,nk->ni', J, res)[..., None])[..., 0]
        xy = xy - step
    return xy


def fit_sensor(pts, meas, s0, prior_sd=15.0, noise_sd=8.0):
    """Gauss-Newton fit of one sensor's position (3) and offset (1).
    The tape-measured position is used as a soft prior (+/- prior_sd), which
    stops the position and the offset trading off against each other."""
    q = np.append(s0, 0.0)
    wp = noise_sd / prior_sd
    for _ in range(30):
        diff = q[:3] - pts
        d = np.linalg.norm(diff, axis=1)
        res = np.concatenate([d + q[3] - meas, wp * (q[:3] - s0)])
        J = np.vstack([np.column_stack([diff / d[:, None], np.ones(len(d))]),
                       np.column_stack([wp * np.eye(3), np.zeros(3)])])
        q = q - np.linalg.lstsq(J, res, rcond=None)[0]
    return q[:3], q[3]


def zone(xy):
    c = np.clip((xy[:, 0] // (W / 3)).astype(int), 0, 2)
    r = np.clip((xy[:, 1] // (D / 3)).astype(int), 0, 2)
    return r * 3 + c


def one_install(hand_lo=40, hand_hi=160):
    S = NOM + rng.normal(0, 15, (2, 3))
    off = rng.uniform(10, 35, 2)
    noise = lambda n: rng.normal(0, 8, (n, 2))

    # C7 wand
    pts = np.array([[x, y, -dz] for dz in (60, 160) for x, y in GRID])
    meas = ranges(S, pts) - BALL_R + off + noise(len(pts))
    fit = [fit_sensor(pts, meas[:, k] + BALL_R, NOM[k]) for k in range(2)]
    S_fit = np.array([f[0] for f in fit]); off_fit = np.array([f[1] for f in fit])

    # C8 hand profile: 16 points x high/low x 5 frames
    tgt = np.repeat(GRID, 10, axis=0)
    true_xy = tgt + rng.normal(0, 20, tgt.shape)
    depth = np.tile(np.repeat([hand_lo + 5.0, hand_hi - 10.0], 5), 16) + rng.normal(0, 10, len(tgt))
    r_cal = ranges(S, np.column_stack([true_xy, -depth])) + off + noise(len(tgt))
    rr = r_cal - off_fit
    planar = np.linalg.norm(tgt[:, None, :] - S_fit[:, :2], axis=-1)
    vert = np.sqrt(np.clip(rr ** 2 - planar ** 2, 0, None))      # sensor height minus hand height
    h_est = (vert - S_fit[:, 2]).mean(axis=1)                     # hand depth below the ring
    h_work = float(np.median(h_est))
    est = locate(S_fit, off_fit, r_cal, h_work)
    bias = np.array([(est[i * 10:(i + 1) * 10] - GRID[i]).mean(axis=0) for i in range(16)])

    def correct(xy):
        # bilinear interpolation of the bias on the 4x4 grid, clamped at the edges
        u = np.clip(xy[:, 0] / W * 4 - 0.5, 0, 3); v = np.clip(xy[:, 1] / D * 4 - 0.5, 0, 3)
        i0 = np.minimum(u.astype(int), 2); j0 = np.minimum(v.astype(int), 2); fu = u - i0; fv = v - j0
        B = bias.reshape(4, 4, 2)
        b = (B[j0, i0] * ((1 - fu) * (1 - fv))[:, None] + B[j0, i0 + 1] * (fu * (1 - fv))[:, None]
             + B[j0 + 1, i0] * ((1 - fu) * fv)[:, None] + B[j0 + 1, i0 + 1] * (fu * fv)[:, None])
        return xy - b

    # test hands
    n = 900
    zi = np.repeat(np.arange(9), n // 9)
    zc, zr = zi % 3, zi // 3
    x = (zc + rng.uniform(0.15, 0.85, len(zi))) * W / 3
    y = (zr + rng.uniform(0.15, 0.85, len(zi))) * D / 3
    h = rng.uniform(hand_lo, hand_hi, len(zi))
    r = ranges(S, np.column_stack([x, y, -h])) + off + noise(len(zi))
    out = {
        'M0 no calibration': zone(locate(NOM, np.zeros(2), r, 115.0)),
        'M1 + wand (C7)': zone(locate(S_fit, off_fit, r, 115.0)),
        'M2 + hand depth (C8)': zone(locate(S_fit, off_fit, r, h_work)),
        'M3 + bias map (C8)': zone(correct(locate(S_fit, off_fit, r, h_work))),
        'Limit: perfect geometry': zone(locate(S, off, r, (hand_lo + hand_hi) / 2)),
    }
    fit_err = np.abs(S_fit - S).max(), np.abs(off_fit - off).max()
    return {k: np.array([(v[zi == z] == z).mean() for z in range(9)]) for k, v in out.items()}, fit_err, h_work


def report(lo, hi):
    runs = [one_install(lo, hi) for _ in range(40)]
    names = list(runs[0][0].keys())
    print(f"\nHands {lo}-{hi} mm below the ring. Zone accuracy over 40 simulated installations")
    print(f"{'':26s} {'back row':>10s} {'middle row':>11s} {'front row':>10s} {'overall':>9s} {'worst zone':>11s}")
    for k in names:
        acc = np.array([r[0][k] for r in runs])  # (40, 9)
        rows = [acc[:, i * 3:(i + 1) * 3].mean() * 100 for i in range(3)]
        print(f"{k:26s} {rows[0]:9.1f}% {rows[1]:10.1f}% {rows[2]:9.1f}% {acc.mean() * 100:8.1f}% {acc.min() * 100:10.1f}%")
    pe = np.array([r[1][0] for r in runs]); oe = np.array([r[1][1] for r in runs]); hw = np.array([r[2] for r in runs])
    print(f"\nWand fit: sensor position error max {pe.max():.1f} mm (median {np.median(pe):.1f}); offset error max {oe.max():.1f} mm")
    print(f"Working hand depth found by C8: {hw.mean():.0f} mm (true average of test hands: {(lo + hi) / 2:.0f} mm)")


if __name__ == "__main__":
    report(40, 160)   # typical
    report(20, 80)    # hands held high, just under the ring
