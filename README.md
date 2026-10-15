# Artesian Ring

Three SparkFun XM125 radar modules and one ESP32-S3-N8R2 track a hand over a nominal 23 × 21 inch sink opening. Ring Studio provides setup, calibration, live diagnostics and a simulator. The controller currently drives the demonstration LED ring; water and disposal functions shown in the interface are not a commissioned appliance control system.

## Build and install

Start with the [three-sensor installation guide](docs/three-sensor-installation.md), [wiring diagram](docs/three-sensor-wiring.svg) and [placement drawing](docs/three-sensor-layout.svg). Firmware pin assignments live in `firmware/include/pins.h`; factory geometry lives in `firmware/include/defaults.h`. Enter measured antenna positions before calibration. The default C position is front-left, aimed diagonally inward; [the placement comparison](docs/placement-comparison.md) explains why.

```sh
python tools/build_ui.py
node --test ui/test/*.test.js
cd firmware
pio test -e native
pio run -e esp32s3
# With the ESP32 connected:
pio run -e esp32s3 -t upload
pio run -e esp32s3 -t uploadfs
```

Open `ui/dist/index.html` for the simulator. For hardware, use the temporary access-point password printed on USB serial, join ArtesianRing, open http://192.168.4.1 and complete setup. See [Windows tools](docs/06-setup-windows.md) and [XM125 detector firmware](docs/05-flash-xm125.md). Flash the distance detector onto all three modules.

## Engineering record

[Commissioning epic #2](https://github.com/lorops-stack/artesian-ring-poc/issues/2) links requirements, implementation and physical verification. [Issue #3](https://github.com/lorops-stack/artesian-ring-poc/issues/3) defines the contribution workflow. [Issue #4](https://github.com/lorops-stack/artesian-ring-poc/issues/4) covers three-sensor software and [issue #5](https://github.com/lorops-stack/artesian-ring-poc/issues/5) holds bench evidence. Test results belong on the corresponding issue and PR, not in an accumulating README progress log.

Read [CONTRIBUTING](CONTRIBUTING.md) before changing code. Automated contributors also follow [AGENTS](AGENTS.md). CI runs UI regressions, native firmware tests, driver tests and an ESP32-S3 build. Passing software checks does not establish physical coverage or appliance safety. Successful GitHub Actions runs also preserve matched firmware and browser filesystem images as downloadable artifacts.

## Reference

- [Protocol](docs/10-protocol.md): frame, health and configuration contracts.
- [Troubleshooting](docs/09-troubleshooting.md): diagnostic codes used by Ring Studio.
- [Bench evidence procedure](docs/13-hardware-evidence-campaign.md) and [calibration quality](docs/14-calibration-quality-model.md).
- [Historical material](docs/archive/two-sensor/README.md): previous wiring and design; not current installation instructions.

Confidential: Artesian Streams internal. Keep repository visibility private.
