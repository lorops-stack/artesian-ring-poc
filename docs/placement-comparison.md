# Placement comparison

## Selected 2-inch setback bench layout

A=(-35.92,-35.92), B=(620.12,-35.92), C=(-35.92,569.32) mm, yaw 43°/129°/323°. The setback is 50.8 mm diagonally from the opening corner. The horizontal model uses a 32.5° half-angle (65° full); the perpendicular antenna plane is nominally 53° full. These are half-power pattern specifications, not detection cutoffs.

A broader numerical comparison evaluated staggered, corner, midpoint and equilateral patterns plus independent perimeter position/yaw searches. The selected candidate gives about 71% common horizontal overlap at 65°, about 53% at 53° with retuned yaw; neither is physical coverage. An overlap-only clustered candidate gains roughly two percentage points but greatly worsens range-error sensitivity.

With a 2-inch maximum distance from the opening, even the rectangle’s inscribed circle subtends at least 73.4° at any allowed antenna position. Therefore three 65° ideal sectors cannot all cover the complete opening. Keep actual validated control zones inside measured common coverage.

The model uses equal sensor/target height, 60–850 mm ranges and excludes covers, vertical clipping, multipath, occlusion and sequential timing. The cover and slot must be tested before permanent encapsulation. See [Acconeer A121 specifications](https://docs.sparkfun.com/SparkFun_Qwiic_Pulsed_Radar_Sensor_XM125/assets/component_documentation/A121%20datasheet.pdf) and the [current mounting guide](three-sensor-installation.md).

## Earlier edge-mounted sensitivity study

The following study predates the selected setback layout; its wider angles are hypothetical sensitivity cases, not current defaults.

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

**Earlier conclusion:** start with three corners, C front-left, because the all-three acceptance rule makes common visibility the limiting requirement. The symmetric front-right choice is equivalent in this ideal model. This trades about 1.8 mm at the 95th-percentile geometric noise proxy against substantially more shared angular coverage than front-centre. A narrow installed beam still leaves large blind regions even with the recommended arrangement. The percentages do not include real-world losses and are not accuracy or reliability claims.

Validate the final slot, board orientation and radome with a full-grid and boundary campaign before deciding the actual usable control area. See the [installation guide](three-sensor-installation.md) and [commissioning issue #5](https://github.com/lorops-stack/artesian-ring-poc/issues/5). Manufacturer context: [Acconeer mechanical/radome guidance](https://docs.acconeer.com/en/latest/hw_integration/a121/radome_and_mechanical_design.html).
