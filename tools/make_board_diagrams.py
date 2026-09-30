"""Builds the board-layout wiring diagrams from firmware/include/pins.h.

    python tools/make_board_diagrams.py

docs/wiring-stage1-sensors.svg  ESP32 + both XM125 boards, drawn as the real boards
                                (component side up, same orientation as the photos),
                                every header pin in its real position.
docs/wiring-stage2-leds.svg     LED ring: 74AHCT125 chip pinout, strip, supply, fuse.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
PINS = {m.group(1): int(m.group(2)) for m in
        re.finditer(r"constexpr int (PIN_\w+)\s*=\s*(\d+);", (ROOT / "firmware/include/pins.h").read_text())}

# ESP32-S3 dev board headers, top (module end) to bottom (USB end), component side up.
ESP_LEFT = ["3V3", "3V3", "RST", "4", "5", "6", "7", "15", "16", "17", "18", "8", "3", "46",
            "9", "10", "11", "12", "13", "14", "5Vin", "GND"]
ESP_RIGHT = ["GND", "TX", "RX", "1", "2", "42", "41", "40", "39", "38", "37", "36", "35", "0",
             "45", "48", "47", "21", "20", "19", "GND", "GND"]
# SparkFun XM125 breakout headers, top (USB-C end) to bottom (buttons end).
XM_LEFT = ["INT", "3V3", "1V8", "VU", "G", "G", "SIO", "CLK", "RST"]
XM_RIGHT = ["BOOT", "IO1", "IO0", "TX", "RX", "ADDR", "G", "3V3", "SDA", "SCL", "WU"]

C = {"3v3": "#D62828", "gnd": "#1F1F1F", "sda": "#1D6FD8", "scl": "#E0A100", "rst": "#7A4FD0",
     "led": "#1A9B4B", "5v": "#F07C00"}
FONT = "Segoe UI, Helvetica, Arial, sans-serif"


class Svg:
    def __init__(self, w, h):
        self.w, self.h, self.o = w, h, []
        self.add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="{FONT}">')
        self.add(f'<rect width="{w}" height="{h}" fill="#FFFFFF"/>')

    def add(self, s): self.o.append(s)

    def text(self, x, y, t, size=14, fill="#111", anchor="start", weight=400, halo=False):
        h = ' stroke="#fff" stroke-width="4" paint-order="stroke"' if halo else ""
        self.add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" font-weight="{weight}"{h}>{t}</text>')

    def rect(self, x, y, w, h, fill, stroke="none", rx=8, sw=1.5, extra=""):
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>')

    def wire(self, pts, color, dash=False, w=4):
        d = "M" + " L".join(f"{x},{y}" for x, y in pts)
        da = ' stroke-dasharray="10 7"' if dash else ""
        self.add(f'<path d="{d}" fill="none" stroke="#fff" stroke-width="{w + 4}" stroke-linejoin="round" stroke-linecap="round"/>')
        self.add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"{da}/>')

    def badge(self, x, y, label, color):
        self.add(f'<rect x="{x - 17}" y="{y - 11}" width="34" height="22" rx="11" fill="{color}" stroke="#fff" stroke-width="2"/>')
        self.text(x, y + 5, label, 12, "#fff", "middle", 700)

    def save(self, name):
        self.add("</svg>")
        (ROOT / "docs" / name).write_text("\n".join(self.o), encoding="utf-8")
        print("wrote docs/" + name)


def pin(s, x, y, used_color=None, hole="#C9A227"):
    if used_color:
        s.add(f'<circle cx="{x}" cy="{y}" r="11" fill="{used_color}" stroke="#fff" stroke-width="2.5"/>')
        s.add(f'<circle cx="{x}" cy="{y}" r="4" fill="#fff"/>')
    else:
        s.add(f'<circle cx="{x}" cy="{y}" r="8" fill="#2A2A2A" stroke="{hole}" stroke-width="3"/>')


def draw_esp32(s, x, y, used, title_note=""):
    """Returns {('L'|'R', name, index): (px, py)}. used: {('L', index): color}."""
    W, pitch, top = 300, 42, 250
    H = top + pitch * 21 + 170
    s.rect(x, y, W, H, "#15181C", rx=16)
    s.rect(x + 70, y + 18, 160, 200, "#BFC5CC", "#8D949C", rx=6)
    s.rect(x + 70, y - 34, 160, 52, "#26292E", rx=4)
    s.text(x + 150, y - 12, "antenna end", 12, "#9AA", "middle")
    s.text(x + 150, y + 80, "ESP32-S3-N8R2", 15, "#333", "middle", 700)
    s.text(x + 150, y + 102, "module", 12, "#555", "middle")
    pos = {}
    for side, names, px in (("L", ESP_LEFT, x + 24), ("R", ESP_RIGHT, x + W - 24)):
        for i, n in enumerate(names):
            py = y + top + i * pitch
            col = used.get((side, i))
            pin(s, px, py, col)
            lab = n if not n.isdigit() else n
            if side == "L":
                s.text(px + 20, py + 5, lab, 13.5, "#FFFFFF" if col else "#6FA8DC", "start", 700 if col else 400)
            else:
                s.text(px - 20, py + 5, lab, 13.5, "#FFFFFF" if col else "#6FA8DC", "end", 700 if col else 400)
            pos[(side, n, i)] = (px, py)
    s.text(x + 24, y + top - 30, "LEFT", 11, "#8899AA", "middle", 700)
    s.text(x + W - 24, y + top - 30, "RIGHT", 11, "#8899AA", "middle", 700)
    ub = y + H - 10
    for ux, lab, col in ((x + 40, "COM / UART", "#1A9B4B"), (x + 170, "USB", "#6C737B")):
        s.rect(ux, ub - 60, 90, 70, "#A9B0B8", col, rx=10, sw=3 if col != "#6C737B" else 1.5)
        s.text(ux + 45, ub - 26, "USB-C", 11, "#333", "middle", 700)
        s.text(ux + 45, ub - 10, lab, 11, "#111", "middle", 800)
    s.text(x + W / 2, ub + 34, "Use the COM / UART port (normally the left one; the label is on the back).", 13, "#333", "middle")
    s.text(x + W / 2, ub + 52, "Check: Windows Device Manager shows \"USB-SERIAL CH343\".", 12.5, "#555", "middle")
    return pos


def draw_xm125(s, x, y, name, where, used, notes):
    W, pitch, top = 250, 38, 190
    H = top + pitch * 10 + 170
    s.rect(x, y, W, H, "#DD2C24", rx=12)
    s.rect(x + 80, y - 10, 90, 44, "#B9C0C7", "#7B828A", rx=8)
    s.text(x + 125, y + 18, "USB-C", 11, "#333", "middle", 700)
    s.rect(x + 16, y + 60, 44, 70, "#1B1B1B", rx=3); s.text(x + 38, y + 150, "Qwiic", 10.5, "#FFD8D6", "middle")
    s.rect(x + W - 60, y + 60, 44, 70, "#1B1B1B", rx=3); s.text(x + W - 38, y + 150, "Qwiic", 10.5, "#FFD8D6", "middle")
    s.rect(x + 62, y + top + 60, 126, 150, "#1F3E8C", rx=4)
    s.rect(x + 95, y + top + 100, 60, 60, "#2F5F55", rx=3)
    s.text(x + 125, y + top + 84, "XM125 module", 11.5, "#DCE6FF", "middle", 700)
    s.text(x + 125, y + top + 186, "radar faces UP", 10.5, "#DCE6FF", "middle")
    s.text(x + 125, y + 64, name, 20, "#FFFFFF", "middle", 800)
    s.text(x + 125, y + 86, where, 12, "#FFE3E1", "middle")
    by = y + H - 60
    for bx, bl in ((x + 55, "RST"), (x + 150, "BOOT")):
        s.rect(bx, by, 46, 46, "#C8CDD2", "#7B828A", rx=6); s.text(bx + 23, by - 6, bl, 11, "#FFE3E1", "middle", 700)
    pos = {}
    for i, n in enumerate(XM_RIGHT):
        py = y + top + i * pitch
        col = used.get(("R", n))
        pin(s, x + W - 22, py, col, "#D9D9D9")
        s.text(x + W - 42, py + 5, n, 13, "#FFFFFF", "end", 700 if col else 400)
        pos[("R", n)] = (x + W - 22, py)
    for i, n in enumerate(XM_LEFT):
        py = y + top + (i + 2) * pitch
        col = used.get(("L", n))
        pin(s, x + 22, py, col, "#D9D9D9")
        s.text(x + 42, py + 5, n, 13, "#FFFFFF", "start", 700 if col else 400)
        pos[("L", n)] = (x + 22, py)
    for key, (t, c) in notes.items():
        px, py = pos[key]
        if key[0] == "R":
            s.rect(px - 132, py + 44, 124, 22, "#FFFFFF", rx=11); s.text(px - 70, py + 60, t, 11.5, c, "middle", 800)
        else:
            s.rect(px - 10, py + 16, 130, 22, "#FFFFFF", rx=11); s.text(px + 55, py + 32, t, 11.5, c, "middle", 800)
    wx, wy = pos[("R", "WU")]
    s.add(f'<path d="M{wx - 8},{wy - 8} L{wx + 8},{wy + 8} M{wx + 8},{wy - 8} L{wx - 8},{wy + 8}" stroke="#FFFFFF" stroke-width="3"/>')
    return pos, H


def esp_index(side, name, nth=0):
    arr = ESP_LEFT if side == "L" else ESP_RIGHT
    idx = [i for i, n in enumerate(arr) if n == name]
    return idx[nth]


def stage1():
    s = Svg(1960, 1830)
    s.text(40, 50, "Stage 1 wiring: ESP32 to both radar sensors", 28, "#111", "start", 800)
    s.text(40, 80, "Boards drawn component side up, as in your photos. Coloured pins get a wire; dark pins stay empty. Unplug USB before wiring.", 15, "#444")

    wires = [  # (id, esp side, esp name, nth, sensor, sensor side, sensor pin, colour key, dash)
        ("W1", "L", "3V3", 0, "A", "R", "3V3", "3v3", False),
        ("W2", "L", "3V3", 1, "B", "R", "3V3", "3v3", False),
        ("W3", "L", "GND", 0, "A", "R", "G", "gnd", False),
        ("W4", "R", "GND", 0, "B", "R", "G", "gnd", False),
        ("W5", "L", str(PINS["PIN_A_SDA"]), 0, "A", "R", "SDA", "sda", False),
        ("W6", "L", str(PINS["PIN_A_SCL"]), 0, "A", "R", "SCL", "scl", False),
        ("W7", "L", str(PINS["PIN_B_SDA"]), 0, "B", "R", "SDA", "sda", False),
        ("W8", "L", str(PINS["PIN_B_SCL"]), 0, "B", "R", "SCL", "scl", False),
        ("W9", "L", str(PINS["PIN_A_RST"]), 0, "A", "L", "RST", "rst", True),
        ("W10", "L", str(PINS["PIN_B_RST"]), 0, "B", "L", "RST", "rst", True),
    ]
    esp_used = {(w[1], esp_index(w[1], w[2], w[3])): C[w[7]] for w in wires}
    sens_used = {"A": {}, "B": {}}
    for w in wires:
        sens_used[w[4]][(w[5], w[6])] = C[w[7]]

    ex, ey = 1080, 170
    esp = draw_esp32(s, ex, ey, esp_used)
    notes = {("R", "WU"): ("▲ NO WIRE here", "#B00020"),
             ("L", "RST"): ("▲ solder 1 pin", "#B00020")}
    A, hA = draw_xm125(s, 360, 150, "SENSOR A", "back-left corner", sens_used["A"], notes)
    B, hB = draw_xm125(s, 360, 150 + hA + 70, "SENSOR B", "back-right corner", sens_used["B"], notes)
    S = {"A": A, "B": B}
    tops = {"A": 150, "B": 150 + hA + 70}
    hs = {"A": hA, "B": hB}

    lanes = {"W1": 680, "W3": 710, "W5": 740, "W6": 770, "W9": 800,
             "W2": 860, "W7": 890, "W8": 920, "W10": 950, "W4": 1020}
    for wid, es, en, nth, sn, ss, sp, ck, dash in wires:
        idx = esp_index(es, en, nth)
        px, py = esp[(es, en, idx)]
        tx, ty = S[sn][(ss, sp)]
        L = lanes[wid]
        if es == "R":   # right-header GND: over the top of the ESP32 board
            top_y = ey - 60
            pts = [(px, py), (px + 40, py), (px + 40, top_y), (L, top_y), (L, ty), (tx, ty)]
        elif ss == "R":
            pts = [(px, py), (L, py), (L, ty), (tx, ty)]
        else:           # sensor RST on its left header: around the bottom of the sensor board
            below = tops[sn] + hs[sn] + 28
            pts = [(px, py), (L, py), (L, below), (tx - 40, below), (tx - 40, ty), (tx, ty)]
        s.wire(pts, C[ck], dash)
        s.badge(tx + (46 if ss == "R" else -60), ty + (0 if ss == "R" else -22), wid, C[ck])
        s.badge(px - 44 if es == "L" else px + 40, py - 20 if es == "L" else py + 24, wid, C[ck])

    tx0, ty0 = 1440, 160
    s.rect(tx0, ty0, 490, 560, "#F6F7F9", "#C9CED4", rx=14)
    s.text(tx0 + 20, ty0 + 36, "Wire list", 20, "#111", "start", 800)
    s.text(tx0 + 20, ty0 + 58, "Pin positions counted from the TOP of each header.", 12.5, "#555")
    y = ty0 + 92
    for wid, es, en, nth, sn, ss, sp, ck, dash in wires:
        idx = esp_index(es, en, nth)
        side = "left" if es == "L" else "right"
        en_l = en if not en.isdigit() else "GPIO" + en
        spos = (XM_RIGHT.index(sp) + 1) if ss == "R" else (XM_LEFT.index(sp) + 1)
        sside = "right" if ss == "R" else "left"
        s.badge(tx0 + 34, y - 5, wid, C[ck])
        s.text(tx0 + 62, y, f"ESP32 {en_l}", 14, "#111", "start", 700)
        s.text(tx0 + 62, y + 17, f"{side} header, pin {idx + 1}", 12, "#555")
        s.text(tx0 + 250, y, f"→ {sn} {sp}", 14, "#111", "start", 700)
        s.text(tx0 + 250, y + 17, f"{sside} header, pin {spos}", 12, "#555")
        y += 46
    y = ty0 + 600
    s.rect(tx0, y, 490, 300, "#FFF4F2", "#F2B8B0", rx=14)
    s.text(tx0 + 20, y + 34, "Do NOT connect", 18, "#B00020", "start", 800)
    for i, t in enumerate(["Sensor WU pin (you soldered one): leave it empty.",
                           "Any other sensor pin not listed: leave empty.",
                           "The sensors' own USB-C ports: only for reflashing,",
                           "   never plugged in while wired to the ESP32.",
                           "ESP32 5Vin: not used.",
                           "Sensor 3V3 must come from ESP32 3V3, never 5 V."]):
        s.text(tx0 + 20, y + 70 + i * 34, t, 14, "#402020")
    s.text(40, 1800, "W9 and W10 are dashed purple: reset lines, required. Solder one header pin into each sensor's RST hole (left header, bottom pin) first.", 14, "#444")
    s.save("wiring-stage1-sensors.svg")


def stage2():
    s = Svg(1960, 1640)
    s.text(40, 50, "Stage 2 wiring: LED ring (after the sensors work)", 28, "#111", "start", 800)
    s.text(40, 80, "Every orange 5V tag connects together, and every black GND tag connects together: use the breadboard's two long power rails.", 15, "#444")
    led = PINS["PIN_LED_RING_DATA"]
    ex, ey = 1520, 170
    gi = esp_index("R", "GND", 1)   # right header pin 21: left pin 22 already carries W3
    esp_used = {("L", esp_index("L", str(led))): C["led"], ("R", gi): C["gnd"]}
    esp = draw_esp32(s, ex, ey, esp_used)

    def tag(x, y, t):
        col = C["5v"] if t == "5V" else C["gnd"]
        s.rect(x, y - 12, 60, 24, col, rx=12); s.text(x + 30, y + 5, t, 12.5, "#FFF", "middle", 800)

    # 74AHCT125 DIP-14, top view, notch up
    cx, cy, cw, pitch = 820, 300, 190, 56
    ch = pitch * 6 + 140
    s.rect(cx, cy, cw, ch, "#2B2E33", rx=8)
    s.add(f'<path d="M{cx + cw / 2 - 18},{cy} a18,18 0 0 0 36,0" fill="#FFFFFF"/>')
    s.add(f'<circle cx="{cx + 24}" cy="{cy + 22}" r="6" fill="#666"/>')
    s.text(cx + cw / 2, cy + ch - 34, "74AHCT125", 16, "#FFFFFF", "middle", 800)
    s.text(cx + cw / 2, cy + ch - 14, "top view · notch up · dot = pin 1", 11, "#BBB", "middle")
    names = {1: "1OE", 2: "1A", 3: "1Y", 4: "2OE", 5: "2A", 6: "2Y", 7: "GND",
             8: "3Y", 9: "3A", 10: "3OE", 11: "4Y", 12: "4A", 13: "4OE", 14: "VCC"}
    tie = {1: "GND", 4: "5V", 5: "GND", 7: "GND", 9: "GND", 10: "5V", 12: "GND", 13: "5V", 14: "5V"}
    pp = {}
    for n in range(1, 15):
        left = n <= 7
        py = cy + 45 + ((n - 1) if left else (14 - n)) * pitch
        px = cx - 14 if left else cx + cw + 14
        s.rect(px - 14 if left else px - 14, py - 8, 28, 16, "#C0C4C8", rx=2)
        s.text(cx + (12 if left else cw - 12), py + 5, f"{n} · {names[n]}" if left else f"{names[n]} · {n}", 13, "#FFF", "start" if left else "end", 700)
        pp[n] = (px, py)
        if n in tie:
            col = C["5v"] if tie[n] == "5V" else C["gnd"]
            if left:
                s.wire([(px - 14, py), (px - 70, py)], col, w=3); tag(px - 130, py, tie[n])
            else:
                s.wire([(px + 14, py), (px + 70, py)], col, w=3); tag(px + 70, py, tie[n])
        elif n in (6, 8, 11):
            s.text(px + (-24 if left else 24), py + 5, "empty", 12, "#999", "end" if left else "start")

    # D1: GPIO -> pin 2 (1A)
    gx, gy = esp[("L", str(led), esp_index("L", str(led)))]
    p2x, p2y = pp[2]
    s.wire([(gx, gy), (1330, gy), (1330, 230), (560, 230), (560, p2y), (p2x - 14, p2y)], C["led"])
    s.badge(gx - 44, gy - 20, "D1", C["led"])
    # 10k pull-down from 1A to GND (keeps the ring dark while the ESP32 boots)
    s.wire([(560, p2y), (470, p2y), (470, p2y + 12)], C["gnd"], w=3)
    s.add(f'<circle cx="560" cy="{p2y}" r="6" fill="{C["led"]}"/>')
    s.rect(458, p2y + 12, 24, 56, "#FFFFFF", C["gnd"], rx=4, sw=2.5)
    s.wire([(470, p2y + 68), (470, p2y + 96)], C["gnd"], w=3); tag(440, p2y + 108, "GND")
    s.text(456, p2y + 36, "10 kΩ", 13, "#111", "end", 800, halo=True)
    s.text(456, p2y + 54, "pull-down", 12, "#444", "end", 700, halo=True)
    s.text(570, 220, f"D1: ESP32 GPIO{led} (left header, pin {esp_index('L', str(led)) + 1}) → chip pin 2 (1A)", 13.5, C["led"], "start", 800, halo=True)
    # D2: pin 3 (1Y) -> 330R -> strip DIN
    p3x, p3y = pp[3]
    sx, sy, sw = 300, 1040, 880
    s.wire([(p3x - 14, p3y), (620, p3y), (620, 880), (230, 880), (230, sy), (sx + 10, sy)], C["led"])
    s.rect(380, 868, 80, 24, "#FFFFFF", C["led"], rx=4, sw=2.5); s.text(420, 860, "330 Ω", 13, C["led"], "middle", 800)
    s.text(630, 872, "D2: chip pin 3 (1Y) → 330 Ω → strip DIN", 13.5, C["led"], "start", 800, halo=True)
    # ESP32 GND -> GND
    gdx, gdy = esp[("R", "GND", gi)]
    s.wire([(gdx, gdy), (gdx + 60, gdy)], C["gnd"], w=3); tag(gdx + 60, gdy, "GND")
    s.text(gdx + 124, gdy - 22, "ESP32 GND (right header, pin 21)", 12.5, "#111", "end", 700, halo=True)
    s.text(gdx + 124, gdy + 34, "joins the GND rail", 12.5, "#111", "end", 700, halo=True)

    # strip
    s.rect(sx, sy - 40, sw, 80, "#F1F3F5", "#9AA0A6", rx=10)
    for i in range(17):
        s.rect(sx + 120 + i * 38, sy - 12, 22, 22, "#FFFFFF", "#BBB", rx=3)
    s.text(sx + sw / 2, sy - 54, "WS2812B strip around the ring · data flows left to right (printed arrows point away from the input)", 14, "#111", "middle", 700)
    pin_in = {"5V": sy - 26, "DIN": sy, "GND": sy + 26}
    pin_out = {"5V": sy - 26, "DO": sy, "GND": sy + 26}
    for k, py in pin_in.items():
        s.rect(sx + 10, py - 10, 56, 20, "#D8B25A", rx=3); s.text(sx + 38, py + 5, k, 11.5, "#111", "middle", 800)
    for k, py in pin_out.items():
        s.rect(sx + sw - 66, py - 10, 56, 20, "#D8B25A", rx=3); s.text(sx + sw - 38, py + 5, k, 11.5, "#111", "middle", 800)
    s.text(sx + 38, sy + 62, "INPUT end", 13, "#111", "middle", 800)
    s.text(sx + sw - 38, sy + 62, "FAR end", 13, "#111", "middle", 800)
    s.text(sx + sw - 38, sy + 78, "DO: leave empty", 11.5, "#888", "middle")
    for py, t in ((pin_in["5V"], "5V"), (pin_in["GND"], "GND")):
        col = C["5v"] if t == "5V" else C["gnd"]
        s.wire([(sx + 10, py), (sx - 110 + 60, py)], col, w=3); tag(sx - 110, py, t)
    for py, t in ((pin_out["5V"], "5V"), (pin_out["GND"], "GND")):
        col = C["5v"] if t == "5V" else C["gnd"]
        s.wire([(sx + sw - 10, py), (sx + sw + 40, py)], col, w=3); tag(sx + sw + 40, py, t)
    s.rect(40, sy + 100, 380, 70, "#F6F7F9", "#C9CED4", rx=10)
    s.text(56, sy + 128, "1000 µF capacitor at the INPUT end:", 13, "#111", "start", 800)
    s.text(56, sy + 150, "long leg to 5V, striped leg to GND.", 13, "#333")

    # supply + fuse
    px0, py0 = 480, 1240
    s.rect(px0, py0, 440, 120, "#FFF4E6", C["5v"], rx=12, sw=2)
    s.text(px0 + 220, py0 + 34, "5 V LED power supply, ≥ 4 A", 17, "#111", "middle", 800)
    s.text(px0 + 220, py0 + 60, "+ output → 5 A inline fuse → 5V rail", 13.5, "#333", "middle")
    s.text(px0 + 220, py0 + 82, "− output → GND rail", 13.5, "#333", "middle")
    s.text(px0 + 220, py0 + 104, "18 AWG from the rails to BOTH strip ends", 13.5, "#333", "middle")
    s.wire([(px0 + 440, py0 + 36), (px0 + 480, py0 + 36)], C["5v"], w=3)
    s.rect(px0 + 480, py0 + 21, 70, 30, "#FFFFFF", C["5v"], rx=6, sw=2.5); s.text(px0 + 515, py0 + 41, "5 A", 13, C["5v"], "middle", 800)
    s.wire([(px0 + 550, py0 + 36), (px0 + 600, py0 + 36)], C["5v"], w=3); tag(px0 + 600, py0 + 36, "5V")
    s.wire([(px0 + 440, py0 + 86), (px0 + 600, py0 + 86)], C["gnd"], w=3); tag(px0 + 600, py0 + 86, "GND")

    bx, by = 40, 1420
    s.rect(bx, by, 1180, 170, "#F6F7F9", "#C9CED4", rx=14)
    s.text(bx + 20, by + 34, "Checklist", 18, "#111", "start", 800)
    for i, t in enumerate(["The ESP32 is powered only by its own USB-C (COM port). The LED supply never connects to the ESP32's 5Vin or 3V3.",
                           "The LED supply's GND and the ESP32's GND are joined (the GND rail). Without this the data signal does not work.",
                           "Solder to the strip's INPUT end (printed arrows point away from it). Feed 5V and GND at the far end too.",
                           "Chip goes in the breadboard across the centre gap, notch up; pin 1 is top-left, next to the dot."]):
        s.text(bx + 20, by + 66 + i * 24, "• " + t, 13.5, "#333")
    s.save("wiring-stage2-leds.svg")


if __name__ == "__main__":
    stage1()
    stage2()
