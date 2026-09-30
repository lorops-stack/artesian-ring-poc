# 10 · Device ↔ Ring Studio protocol

One JSON protocol, used by the firmware over WebSocket (`ws://192.168.4.1/ws`) and over USB serial (one JSON object per line, for the laptop copy's Web Serial link). Ring Studio's built-in simulator produces exactly the same messages, so every screen works with no hardware.

Coordinates are millimetres in the sensing plane: origin at the back-left corner, x to the right, y toward the user (spec section 2). Times are device milliseconds since boot.

## Device → Ring Studio

Every message is one object with exactly one of these top-level keys.

### `f` · frame, at the sensor rate (about 20 to 25 per second)

```json
{"f":{"t":123456,"n":4021,"st":2,"fn":"hot","zn":"kitchen-2-0","hx":97.0,"hy":450.2,"spd":120,
      "set":1,"ex":0,"dsp":0,"cup":0,"lk":1,"flag":0,"still":0.4,
      "A":{"e":[[412,1840],[790,300]],"p":0,"hz":22.1,"er":0},
      "B":{"e":[[388,1520]],"p":0,"hz":22.0,"er":0}}}
```

| Key | Meaning |
|---|---|
| `t`, `n` | device time (ms) and frame counter |
| `st` | state: 0 IDLE, 1 ARMING, 2 ACTIVE, 3 CUP_FULL, 4 EXIT_PENDING, 5 CLEAN |
| `fn` | latched function: `hot` `warm` `cold` `waterfall` `cup`, or absent |
| `zn` | zone id under the hand after hysteresis, or absent |
| `hx`, `hy` | fused hand position (mm); absent when there is no hand |
| `spd` | hand speed (mm/s) |
| `set` | settle progress toward a latch, 0 to 1 |
| `ex` | exit countdown remaining, 1 to 0 (EXIT_PENDING only) |
| `dsp` | disposal seconds remaining, 0 when not running |
| `cup` | ml delivered so far in the current cup fill |
| `lk` | session locks bitmask: 1 soap used, 2 disposal used |
| `flag` | why nothing latches (C14 / A6): 0 none, 1 no hand, 2 echo strength outside the hand window, 3 outside the plane, 4 jump too large, 5 not settled, 6 zone blocked, 7 still object |
| `still` | seconds since the target last moved above the still-hand threshold |
| `A`, `B` | per sensor: `e` echoes as `[distance_mm, strength]` (strength is a linear amplitude: the firmware converts the detector's dB×1000 peak strength with 1000·10^(dB/20)), `p` index of the echo used for the fix (absent if none), `hz` frame rate, `er` I2C error count since boot |

### `ev` · event

```json
{"ev":"latch","fn":"warm","lat":170,"t":123456}
```

| `ev` | Extra keys | When |
|---|---|---|
| `session` | `a`: `start` or `end`; on `end`: `ms` duration, `used` ml, `savedOff` ml, `savedFlow` ml, `ghost` false | session boundaries (spec 4.1) |
| `latch` | `fn`, `lat` latency ms (hand confirmed → function on) | a function latches |
| `soap` | | soap dose |
| `cupfull` | `ml` | cup reached volume |
| `disp` | `a`: `start` or `stop`, `why` on stop: `timer`, `zone`, `clean`, `layout` | disposal |
| `off` | `why`: `exit`, `still`, `clean`, `layout` | water off, session over |
| `still` | | the 10 s stillness rule fired |
| `clean` | `a`: `start` or `end` | clean mode |
| `falseoff` | `why` | the false-off counter incremented (F4) |
| `heldon` | `frames` | a dropout was bridged (F4) |
| `button` | `a`: `short`, `cal`, `reset` | BOOT button |

### `status` · on connect, then every 5 s

```json
{"status":{"fw":"0.1.0","proto":1,"up":123456,"rst":"POWERON","setup":false,"heap":180000,
           "clients":1,"cal":{"saved":true,"name":"Bench 1","when":"2026-10-04"},"sess":41,"ml":12800,
           "savedOff":9100,"savedFlow":3200}}
```

`setup` is true until a Wi-Fi password and studio PIN have been set (first boot, or after a 10 s BOOT reset). `rst` is the ESP32's last reset reason (W5, L6).

### `cfg` · on connect and after every change

The whole configuration object (see `firmware/include/defaults.h`; the schema is in section "Configuration" below).

### `health` · every second (C12)

```json
{"health":{"A":{"hz":22.1,"er":0,"calNeeded":false,"str":1800},"B":{...},
           "bgDrift":3,"ghosts":0,"front":0,"trigNoHand":0,"falseOff":0,"heldOn":2,
           "led":90,"rssi":-40,"heap":180000,"rst":"POWERON","temp":41.2}}
```

### `cal` · calibration progress

```json
{"cal":{"step":"c7","state":"running","i":5,"n":32,"hole":3,"depth":60,
        "reading":{"A":[412,1830],"B":[590,1200],"steady":0.8},"result":null}}
```

`state` is `idle`, `running`, `waiting` (needs the user), `done` or `failed`. On `done`, `result` holds the step's numbers (for C7: the fitted poses, offsets, RMS error and per-hole errors; for C8: working depth, strength window and still threshold; for C0: the check list with pass/fail and fix codes).

### `ack` / `err`

```json
{"ack":{"c":"layout","id":7}}
{"err":{"c":"cfg","id":8,"msg":"ledCount out of range"}}
```

## Ring Studio → device

Every command is `{"c": name, "id": n, ...}`. `id` is echoed in the `ack` or `err`.

| `c` | Keys | Does |
|---|---|---|
| `hello` | `ui` version | first message; the device replies with `status`, `cfg` and `health` |
| `auth` | `pin` | unlocks studio commands for this connection (presentation mode) |
| `setup` | `pass` (8 to 63 chars), `pin` (4 to 8 digits) | first-run setup; the AP restarts with the new password |
| `layout` | `id` | switch layout (any state → IDLE) |
| `clean` | `a`: `start` or `end` | clean mode |
| `cfg` | `set`: object of dotted paths to values, e.g. `{"tuning.settleMs":150}` | live config change, saved to flash after 2 s quiet |
| `cal` | `step`, `a`: `start` `stop` `sample` `redo` `skip` `next` `apply`; step-specific keys | drive a calibration step; `apply` sends fitted results (`sensors`, `hand`) computed in the browser |
| `led` | `test`: `white` `rgb` `count` `off`, `n` | LED tests (C0) |
| `save` | `name`, `notes` | save the current calibration under a name |
| `load` | `name` | load a saved calibration |
| `list` | | reply `{"cals":[...]}` |
| `delete` | `name` | delete a saved calibration |
| `wifi` | `pass` | change the Wi-Fi password |
| `pin` | `pin` | change the studio PIN |
| `get` | `what`: `cfg` `health` `status` `cal` | request one message |
| `reset` | `what`: `totals` or `factory` | reset running totals or everything |
| `reboot` | | restart the ESP32 |

## HTTP

| Route | Does |
|---|---|
| `GET /` and static files | Ring Studio (gzip-compressed files in LittleFS) |
| `GET /api/status`, `GET /api/cfg`, `GET /api/health` | same objects as the WebSocket messages |
| `POST /api/cfg` | body `{"set":{...}}` |
| `GET /api/cal/export` | the current calibration as a file |
| `POST /api/cal/import` | a calibration file |
| `POST /api/update` | firmware `.bin` (multipart), then reboot (F18) |
| `GET /api/log` | the last 200 log lines |

## Configuration

```json
{"schema":1,
 "plane":{"w":584.2,"d":533.4,"unit":"in"},
 "sensors":{"A":{"x":0,"y":0,"z":0,"yaw":45,"tilt":-20,"off":0,"on":true},
            "B":{"x":584.2,"y":0,"z":0,"yaw":135,"tilt":-20,"off":0,"on":true},
            "C":{"x":292.1,"y":533.4,"z":0,"yaw":270,"tilt":-20,"off":0,"on":false}},
 "hand":{"zmin":30,"zmax":200,"zwork":115,"strMin":600,"strMax":60000,"stillThr":6},
 "layout":"kitchen",
 "layouts":{"kitchen":{"name":"Kitchen","rows":[{"h":0.3333,"fns":["soap","disposal","cup"]},{"h":0.3333,"fns":["waterfall","neutral","waterfall"]},{"h":0.3334,"fns":["hot","warm","cold"]}]},
            "bathroom":{...},"accessible":{...}},
 "tuning":{"settleMs":150,"settleSpeed":250,"startSpeed":60,"goneFrames":3,"exitMs":1000,"stillOffMs":10000,
           "presentFrames":2,"disposalHoldMs":1000,"disposalRunMs":15000,"cleanMs":60000,"cleanHoldMs":3000,
           "rangeStart":60,"rangeEnd":850,"threshSens":1.0,"i2cKhz":400,"log":false,"wifiCh":6,
           "ledCount":132,"ledBright":90,"ledOrder":"GRB","hyst":20},
 "profile":"default",
 "profiles":{"default":{"name":"Default","hotF":110,"hotCapF":120,"warmF":100,"cupMl":350,"soapMl":0.8,"flowGpm":1.5,
                        "colors":{}}},
 "units":{"temp":"F"}}
```

Zone ids are `<layout>-<row>-<col>`. The firmware only needs `layouts[layout].rows`; the browser uses the same object to draw.

## Recording file (F11)

```json
{"kind":"ring-session","proto":1,"fw":"0.1.0","when":"2026-10-04T18:22:11Z","cfg":{...},
 "frames":[{...frame...}],"events":[{...event...}],"notes":"","ghost":false}
```

The same file is a regression test fixture for `pio test -e native` (`firmware/test/fixtures/`) and can be replayed in Ring Studio.
