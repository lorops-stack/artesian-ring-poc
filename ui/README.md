# Ring Studio (ui/)

The browser UI: Showcase (presentation), Operator view, the calibration studio (C0 to C14 with guided fixes), the test runner (F26), the usage dashboard (F15, F24, F16) and Settings (profiles F14, tuning C10, save/load/compare C13, Wi-Fi/PIN, OTA F18, recordings F11). Design: spec sections 7, 8 and 8b.

It runs in three places with the same code:

- **On the ESP32** at `http://192.168.4.1` (gzip-compressed files in LittleFS, WebSocket `/ws`).
- **On a laptop** from `ui/dist/` (`python -m http.server 8080 --directory ui/dist`, then `http://localhost:8080`): USB Web Serial, replay of recorded sessions, and the built-in simulator.
- **From `ui/src/index.html` directly** (development): every script loads on its own, no build.

With no ring connected it runs on the **simulator** (`js/05-sim.js`): a virtual rig that behaves like the firmware over the same protocol (`docs/10-protocol.md`), with hidden geometry errors for the calibration to find, injectable faults (T30 rehearsal) and the ghost demo hand. Your cursor is the hand.

## Build

```
python tools/build_ui.py
```

Regenerates `js/data/*.js` from the docs (`tools/gen_docs_data.py`), bundles the scripts in `index.html` order into one `app.js`, copies the CSS and fonts (Geist, SIL Open Font License, `fonts/OFL.txt`), writes `ui/dist/` (plain, for the laptop) and `ui/dist-fs/` (gzipped, the ESP32 filesystem image; PlatformIO `data_dir`). Then `pio run -t uploadfs`.

Tests without a browser: `node --test ui/test/*.test.js` (geometry, state machine against spec 4, simulator end to end). Browser smoke test: `node ui/test/smoke.js` (headless Chromium, needs Playwright).

## Code map

Plain scripts (no modules, no framework, no build step needed), one global `RS`, loaded in the order in `index.html`:

| File | What |
|---|---|
| `js/00-const.js` | `RS.FN` functions and colours, `RS.LAYOUTS`, `RS.ST` states, `RS.FLAG`, `RS.DEFAULTS` (mirrors `firmware/include/defaults.h`), `RS.TUNING_META`, `RS.CAL` |
| `js/01-util.js` | `RS.util`: maths, colours, units, `Emitter`, `store` (localStorage), `download`/`pickFile`, `h()` DOM builder |
| `js/02-geometry.js` | `RS.geo`: `zones()`, `zoneAt()` with hysteresis, `locate()` trilateration, `associate()` echo pairing, `coverage()` prediction (C5), `templateHoles()` |
| `js/03-statemachine.js` | `RS.StateMachine`: spec section 4, time-driven, emits protocol events |
| `js/04-fit.js` | `RS.fit`: `wandFit()` (C7), `handProfile()` (C8) |
| `js/05-sim.js` | `RS.Sim`: the virtual rig; `RS.ghostHand()` demo scripts |
| `js/10-link.js` | `RS.link`: sources (sim, WebSocket, Web Serial, replay), `send(cmd)` → Promise, events `frame`, `event`, `status`, `cfg`, `health`, `cal`, `cals`, `led`, `open`, `close`, `mode` |
| `js/11-recorder.js` | `RS.rec`: sessions, history, accuracy runs, test results, heatmap; export/import files |
| `js/12-store.js` | `RS.store`: UI preferences (`get/set`, `on('change:key')`), accessors `cfg()`, `profile()`, `zones()`, `temp(fn)`, studio lock |
| `js/data/fixes.js`, `js/data/tests.js` | generated from docs 09 and 07 |
| `js/20-sound.js` | `RS.sound`, driven by link events |
| `js/21-markers.js` | `RS.MARKERS`, `RS.drawMarker()` |
| `js/22-showcase.js` … `js/29-setup.js` | one screen per file, registered in `RS.screens[id] = {title, mount(host), unmount(), tick(now)}` |
| `js/90-app.js` | `RS.app`: router (`#/show`, `#/operator`, `#/studio`, `#/tests`, `#/dashboard`, `#/settings`), top bar, `toast()`, `modal()`, `confirm()`, `prompt()`, the animation loop |

Screen contract: `mount(host)` builds DOM into `host` (a `.screen` div), subscribes to `RS.link`/`RS.store` and keeps the unsubscribe functions; `unmount()` calls them; optional `tick(now)` runs every animation frame while the screen is showing. Screens never talk to the simulator directly except through `RS.link.send()`; the only exception is the cursor-as-hand (`RS.link.sim.setHand()`) when `RS.link.mode === 'sim'`.

Commands go through `RS.link.send({c: 'cfg', set: {'tuning.settleMs': 150}})` and resolve with the device's `ack`. Configuration arrives back as a `cfg` message; screens re-render from `RS.store.cfg()`.

Style: `css/app.css` holds the whole design system (cards, buttons `.btn`, `.seg`, `.chip`, `.field`, `.tile`, `.callout`, `.fixcode`, tables `.t`). Screens use those classes and the `h()` builder; no inline frameworks.

## Device protocol

`docs/10-protocol.md`. The simulator implements every command the firmware does; the firmware is written to the same document.
