# Placement comparison

Run `python tools/placement_analysis.py`. This compares the same rear A/B pair and several C positions. It is an ideal 2D sensitivity study, not a field-of-view specification or physical detection test.

A/B stay at (0,0), (584.2,0), yaw 45°/135°. The opening is 584.2 × 533.4 mm; samples are the centres of a 40 × 40 grid, hand depth zero. All sensor ranges must be 60–850 mm. Visibility uses ideal hard-edged horizontal cones with half-angles of 30°, 45°, or 60°. These angles are hypothetical sensitivity cases, not manufacturer guarantees. Installed vertical clipping, board roll, materials, multipath, target strength, hand occlusion and motion are omitted.

The noise proxy assumes independent 8 mm range standard deviations and reports sqrt(trace(64 × inverse(JᵀJ))) across all grid points, including ones outside the visibility cones. Its 95th percentile is a percentile over grid locations, not a 95% confidence radius or real-hand accuracy.

| C position / yaw | Median noise proxy | 95th percentile | Overlap at ±30° | At ±45° | At ±60° |
|---|---:|---:|---:|---:|---:|
| Front 35% / 270° | 9.74 mm | 11.10 mm | 30.4% | 67.6% | 79.9% |
| Front centre / 270° | 9.72 mm | 10.90 mm | 32.6% | 70.1% | 81.4% |
| Front 65% / 270° | 9.74 mm | 11.10 mm | 30.4% | 67.6% | 79.9% |
| Left middle / 0° | 10.10 mm | 16.31 mm | 39.8% | 75.5% | 84.8% |
| Front-left / 315° | 9.80 mm | 12.68 mm | 45.9% | 97.4% | 97.4% |
| Front-right / 225° | 9.80 mm | 12.68 mm | 45.9% | 97.4% | 97.4% |

**Recommendation:** start with three corners, C front-left, because the all-three acceptance rule makes common visibility the limiting requirement. The symmetric front-right choice is equivalent in this ideal model. This trades about 1.8 mm at the 95th-percentile geometric noise proxy against substantially more shared angular coverage than front-centre. A narrow installed beam still leaves large blind regions even with the recommended arrangement. The percentages do not include real-world losses and are not accuracy or reliability claims.

Validate the final slot, board orientation and radome with a full-grid and boundary campaign before deciding the actual usable control area. See the [installation guide](three-sensor-installation.md) and [commissioning issue #5](https://github.com/lorops-stack/artesian-ring-poc/issues/5). Manufacturer context: [Acconeer mechanical/radome guidance](https://docs.acconeer.com/en/latest/hw_integration/a121/radome_and_mechanical_design.html).
