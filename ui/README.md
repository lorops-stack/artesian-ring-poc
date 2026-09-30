# Ring Studio

The browser UI: live visualizer, calibration studio, demo presentation mode and usage dashboard. It is built into the ESP32's flash (`pio run -t uploadfs`) and served at `http://192.168.4.1` on the **ArtesianRing** Wi-Fi network. It falls back to USB WebSerial in desktop Chrome or Edge.

Build starts in Phase 1. See `docs/01-design-spec.md` sections 7 and 8.
