# Calibration and sensing quality model

The ring must distinguish three claims:
1. **Fit quality** — how closely C7 explains the measurements it used.
2. **Validation quality** — how accurately a fit predicts measurements deliberately withheld from it.
3. **Commissioning quality** — whether the installed system selects the correct functions, especially at hazardous boundaries.

## C7 robust geometry
C7 uses Huber iteratively reweighted least squares. Large residuals are down-weighted and reported as outliers rather than being allowed to pull sensor pose/offset. Ring Studio also performs leave-one-hole-out validation: each template hole is predicted by a fit that did not use that hole.

Grades:
- Excellent: validation RMS <= 12 mm, worst held-out hole <= 25 mm, <=2 outliers.
- Good: validation RMS <= 22 mm, worst <= 40 mm.
- Marginal: fit passes but independent validation is weaker.
- Fail: base fit fails, validation RMS >35 mm or worst held-out hole >55 mm.

A failed calibration cannot be applied from Ring Studio.

## Runtime geometry confidence
Two range sensors do not have uniform position observability. Near the sensor baseline, the range Jacobian becomes ill-conditioned. Firmware and Ring Studio now calculate local position uncertainty from the inverse two-range Jacobian. Echo-pair scoring combines range, circle residual, predicted-track disagreement and geometry uncertainty. The jump gate expands with measured motion/frame interval and uncertainty.

This confidence is an engineering aid, not a certified probability. Bench captures will determine the correct range-noise model and weighting.

## Boundary commissioning
A calibration can have a good average error and still be unsafe near a zone edge. Ring Studio exposes a boundary test plan generated from the active layout. Internal boundaries are sampled on both sides. Mistakes involving disposal receive weight 5, hot-water boundaries weight 3, ordinary boundaries weight 1. A commissioning run cannot pass with a disposal/hot boundary error.

## Next evidence-driven refinement
Raw echo captures must be used to estimate:
- range noise versus distance and signal strength;
- dropout and echo persistence;
- residual distribution for correct and incorrect pairings;
- A/B correlated errors;
- dry versus wet distributions;
- hand-return strength residuals around the C8 envelope.

Do not tune the new weights against simulator output alone. Preserve real failed captures and replay them as regression fixtures before changing production constants.
