# Ring Studio

The browser UI: the Showcase (presentation) screen, the Operator view, the calibration studio and the usage dashboard. Design reference: spec section 8b and the "Ring Studio UI" design canvas.

- **Source** lives here. `python tools/build_ui.py` packs it, with the Geist font files and their SIL Open Font License, into `ui/dist/`.
- **On the ESP32:** `pio run -t uploadfs` copies `ui/dist/` to flash. It is served at `http://192.168.4.1` on the password-protected **ArtesianRing** Wi-Fi. On a tablet, use "Add to Home Screen"; plain http cannot install it as an offline app.
- **Laptop backup:** `python -m http.server 8080 --directory ui/dist`, then open `http://localhost:8080` in Chrome or Edge. This copy supports USB Web Serial and session replay when the ESP32 is down (review R29).

The build starts in Phase 1. See `docs/01-design-spec.md` sections 7, 8 and 8b.
