"""Generates docs/wiring.svg from firmware/include/pins.h. Run: python tools/make_wiring_svg.py
Pin numbers are read from pins.h, so the diagram cannot drift from the firmware."""
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parent.parent
PINS = {m.group(1): int(m.group(2)) for m in re.finditer(r"constexpr int (PIN_\w+)\s*=\s*(\d+);", (ROOT / "firmware/include/pins.h").read_text())}
P = lambda k: str(PINS[k])

W, H = 1500, 1160
out = []
def add(s): out.append(s)

COL = {"3v3": "#d62828", "gnd": "#222222", "sda": "#1d6fd8", "scl": "#e0a100",
       "rst": "#7a4fd0", "led": "#1a9b4b", "5v": "#f07c00", "res": "#9aa0a6"}

add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
    'font-family="Segoe UI, Helvetica, Arial, sans-serif">')
add(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
add('<text x="40" y="48" font-size="26" font-weight="700" fill="#111">Artesian Ring PoC: wiring</text>')
add('<text x="40" y="76" font-size="15" fill="#444">ESP32-S3-N8R2 (YD-ESP32-S3 layout) · 2 × SparkFun XM125 on separate I2C buses · WS2812B ring</text>')

# ---- ESP32 left header -------------------------------------------------------
rows = ["3V3", "3V3", "RST", "4", "5", "6", "7", "15", "16", "17", "18", "8", "3", "46",
        "9", "10", "11", "12", "13", "14", "5Vin", "GND"]
used = {"3V3": "3v3", "GND": "gnd", P("PIN_LED_RING_DATA"): "led", P("PIN_A_RST"): "rst", P("PIN_B_RST"): "rst",
        P("PIN_A_SDA"): "sda", P("PIN_A_SCL"): "scl", P("PIN_B_SDA"): "sda", P("PIN_B_SCL"): "scl",
        P("PIN_C_SDA"): "res", P("PIN_C_SCL"): "res", P("PIN_C_RST"): "res"}
missing = [k for k in used if k not in rows]
assert not missing, f"pins.h uses pins not on the left header: {missing}"
y0, dy, hx = 150, 36, 300
add(f'<rect x="{hx-150}" y="{y0-50}" width="200" height="{dy*len(rows)+70}" rx="14" fill="#1b1f24"/>')
add(f'<text x="{hx-50}" y="{y0-22}" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">ESP32-S3</text>')
add(f'<text x="{hx-50}" y="{y0+dy*len(rows)+10}" font-size="12" fill="#bbb" text-anchor="middle">left header · USB-C at bottom</text>')
pin_y = {}
for i, name in enumerate(rows):
    y = y0 + i * dy
    key = used.get(name)
    fill = COL[key] if key else "#555"
    label = f"GPIO{name}" if name.isdigit() else name
    add(f'<circle cx="{hx}" cy="{y}" r="9" fill="{fill}" stroke="#fff" stroke-width="2"/>')
    add(f'<text x="{hx-18}" y="{y+5}" font-size="14" fill="{"#fff" if key else "#888"}" text-anchor="end">{label}</text>')
    pin_y.setdefault(name, []).append(y)

bx0 = hx - 150; by0 = y0 + dy * len(rows) + 40
add(f'<rect x="{bx0}" y="{by0}" width="200" height="54" rx="10" fill="#f1f3f5" stroke="#999"/>')
add(f'<text x="{bx0+100}" y="{by0+22}" font-size="12.5" font-weight="700" fill="#111" text-anchor="middle">ESP32 power: USB-C → COM</text>')
add(f'<text x="{bx0+100}" y="{by0+40}" font-size="11" fill="#444" text-anchor="middle">wall adapter (demo), laptop (bench)</text>')

# ---- targets -----------------------------------------------------------------
def board(x, y, title, sub, pins):
    h = 40 + 34 * len(pins)
    add(f'<rect x="{x}" y="{y}" width="230" height="{h}" rx="12" fill="#e03131"/>')
    add(f'<text x="{x+115}" y="{y+24}" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">{title}</text>')
    add(f'<text x="{x+115}" y="{y+h+20}" font-size="13" fill="#444" text-anchor="middle">{sub}</text>')
    pos = {}
    for i, (p, note) in enumerate(pins):
        py = y + 52 + 34 * i
        add(f'<circle cx="{x}" cy="{py}" r="8" fill="#fff" stroke="#333" stroke-width="2"/>')
        add(f'<text x="{x+18}" y="{py+5}" font-size="14" fill="#fff">{p}</text>')
        if note:
            add(f'<text x="{x+245}" y="{py+5}" font-size="12.5" fill="#555">{note}</text>')
        pos[p] = (x, py)
    return pos

xA = board(930, 110, "XM125  ·  SENSOR A", "back-left corner", [
    ("G", ""), ("3V3", ""), ("SDA", ""), ("SCL", ""),
    ("WU", "leave UNCONNECTED (jumper holds it high)"), ("RST", "REQUIRED · left-side header, solder 1 pin")])
xB = board(930, 430, "XM125  ·  SENSOR B", "back-right corner", [
    ("G", ""), ("3V3", ""), ("SDA", ""), ("SCL", ""),
    ("WU", "leave UNCONNECTED"), ("RST", "REQUIRED · left-side header, solder 1 pin")])

# level shifter
lx, ly = 930, 760
add(f'<rect x="{lx}" y="{ly}" width="230" height="176" rx="12" fill="#3a3f47"/>')
add(f'<text x="{lx+115}" y="{ly+24}" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">74AHCT125</text>')
add(f'<text x="{lx+115}" y="{ly-26}" font-size="13" fill="#444" text-anchor="middle">3.3 V → 5 V data level shifter</text>')
add(f'<text x="{lx+115}" y="{ly-10}" font-size="12" fill="#666" text-anchor="middle">unused: 2OE–4OE → 5 V, 2A–4A → GND</text>')
add(f'<text x="{lx+115}" y="{ly+196}" font-size="12" fill="#666" text-anchor="middle">10 kΩ from 1A (pin 2) to GND: ring stays dark at boot</text>')
ls = {}
for i, p in enumerate(["GND", "1OE", "1A (in)", "1Y (out)", "VCC 5V"]):
    py = ly + 50 + 30 * i
    side = lx if i < 3 else lx + 230
    add(f'<circle cx="{side}" cy="{py}" r="7" fill="#fff" stroke="#333" stroke-width="2"/>')
    add(f'<text x="{lx+18 if i<3 else lx+212}" y="{py+5}" font-size="13" fill="#fff" text-anchor="{"start" if i<3 else "end"}">{p}</text>')
    ls[p] = (side, py)

# LED strip and PSU
sx, sy = 1260, 830
add(f'<rect x="{sx}" y="{sy-60}" width="200" height="150" rx="10" fill="#f1f3f5" stroke="#999"/>')
add(f'<text x="{sx+165}" y="{sy+64}" font-size="11" fill="#555" text-anchor="middle">far end</text>')
add(f'<text x="{sx+100}" y="{sy-36}" font-size="14" font-weight="700" fill="#111" text-anchor="middle">WS2812B ring strip</text>')
strip = {"DIN": (sx, sy - 10), "5V": (sx, sy + 20), "GND": (sx, sy + 45)}
for k, (x, y) in strip.items():
    add(f'<circle cx="{x}" cy="{y}" r="7" fill="#fff" stroke="#333" stroke-width="2"/>')
    add(f'<text x="{x+14}" y="{y+5}" font-size="13" fill="#111">{k}</text>')
px, py = 1195, 1000
add(f'<rect x="{px}" y="{py}" width="265" height="60" rx="10" fill="#fff4e6" stroke="{COL["5v"]}"/>')
add(f'<text x="{px+130}" y="{py+25}" font-size="14" font-weight="700" fill="#111" text-anchor="middle">5 V LED supply, ≥ 4 A</text>')
add(f'<text x="{px+130}" y="{py+45}" font-size="11.5" fill="#444" text-anchor="middle">LEDs only · same switched strip as ESP32</text>')

# ---- wires --------------------------------------------------------------------
def wire(p1, p2, lane, color, dash=False, w=3.2):
    (x1, y1), (x2, y2) = p1, p2
    d = f'M{x1},{y1} H{lane} V{y2} H{x2}'
    extra = ' stroke-dasharray="8 6"' if dash else ''
    add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linejoin="round"{extra}/>')
    add(f'<circle cx="{lane}" cy="{y1}" r="0" />')

E = lambda name, i=0: (hx + 9, pin_y[name][i])
import itertools, random
nets = [  # (name, [(src, dst)], color, dash)
    ("3v3a", [(E("3V3"), xA["3V3"])], COL["3v3"], False),
    ("3v3b", [(E("3V3", 1), xB["3V3"])], COL["3v3"], False),
    ("rsta", [(E(P("PIN_A_RST")), xA["RST"])], COL["rst"], True),
    ("rstb", [(E(P("PIN_B_RST")), xB["RST"])], COL["rst"], True),
    ("sdaa", [(E(P("PIN_A_SDA")), xA["SDA"])], COL["sda"], False),
    ("scla", [(E(P("PIN_A_SCL")), xA["SCL"])], COL["scl"], False),
    ("sdab", [(E(P("PIN_B_SDA")), xB["SDA"])], COL["sda"], False),
    ("sclb", [(E(P("PIN_B_SCL")), xB["SCL"])], COL["scl"], False),
    ("led",  [(E(P("PIN_LED_RING_DATA")), ls["1A (in)"])], COL["led"], False),
    ("gnd",  [(E("GND"), xA["G"]), (E("GND"), xB["G"]), (E("GND"), ls["GND"])], COL["gnd"], False),
]
LANES = list(range(370, 900, 50))
def crossings(order):
    lane = {n[0]: LANES[i] for i, n in enumerate(order)}
    segs_h, segs_v = [], []
    for name, conns, *_ in order:
        L = lane[name]
        for (x1, y1), (x2, y2) in conns:
            segs_h.append((name, y1, hx, L)); segs_h.append((name, y2, L, x2))
            segs_v.append((name, L, min(y1, y2), max(y1, y2)))
    c = 0
    for n1, y, xa, xb in segs_h:
        for n2, x, ya, yb in segs_v:
            if n1 != n2 and min(xa, xb) < x < max(xa, xb) and ya < y < yb:
                c += 1
    return c
rnd = random.Random(7); best = (10**9, None)
for _ in range(60000):
    o = nets[:]; rnd.shuffle(o)
    c = crossings(o)
    if c < best[0]: best = (c, o)
print("wire crossings:", best[0])
g_lane = None
for i, (name, conns, color, dash) in enumerate(best[1]):
    for p1, p2 in conns:
        wire(p1, p2, LANES[i], color, dash)
    if name == "gnd": g_lane = LANES[i]
add(f'<path d="M{ls["GND"][0]},{ls["GND"][1]} H{lx-14} V{ls["1OE"][1]} H{lx}" fill="none" stroke="{COL["gnd"]}" stroke-width="3.2"/>')
# shifter out -> 330R -> DIN
ox, oy = ls["1Y (out)"]
add(f'<path d="M{ox},{oy} H{ox+15} V{strip["DIN"][1]} H{sx}" fill="none" stroke="{COL["led"]}" stroke-width="3.2"/>')
add(f'<rect x="{ox+48}" y="{strip["DIN"][1]-9}" width="40" height="18" rx="3" fill="#fff" stroke="{COL["led"]}" stroke-width="2"/>')
add(f'<text x="{ox+68}" y="{strip["DIN"][1]-14}" font-size="12" fill="{COL["led"]}" text-anchor="middle">330 Ω</text>')
L5, LG = px + 20, px + 45
vx, vy = ls["VCC 5V"]
FJ = py - 34   # junction after the fuse
add(f'<path d="M{L5},{py} V{strip["5V"][1]} H{sx}" fill="none" stroke="{COL["5v"]}" stroke-width="3.2"/>')
add(f'<rect x="{L5-8}" y="{py-24}" width="16" height="20" rx="3" fill="#fff" stroke="{COL["5v"]}" stroke-width="2"/>')
add(f'<text x="{L5-14}" y="{py-9}" font-size="11.5" fill="{COL["5v"]}" text-anchor="end">5 A fuse</text>')
add(f'<circle cx="{L5}" cy="{FJ}" r="5" fill="{COL["5v"]}"/>')
far5, farG = sx + 150, sx + 180
add(f'<path d="M{L5},{FJ} H{LG-7} a7,7 0 0 1 14,0 H{far5} V{sy+90}" fill="none" stroke="{COL["5v"]}" stroke-width="3.2"/>')
add(f'<path d="M{farG},{py} V{sy+90}" fill="none" stroke="{COL["gnd"]}" stroke-width="3.2"/>')
for fx, lab in [(far5, "5V"), (farG, "GND")]:
    add(f'<circle cx="{fx}" cy="{sy+90}" r="7" fill="#fff" stroke="#333" stroke-width="2"/>')
    add(f'<text x="{fx}" y="{sy+80}" font-size="11" fill="#111" text-anchor="middle">{lab}</text>')
cx5, cxg = strip["5V"][1], strip["GND"][1]
add(f'<path d="M{sx-9},{cx5} V{cx5+8} M{sx-15},{cx5+8} H{sx-3} M{sx-15},{cx5+14} H{sx-3} M{sx-9},{cx5+14} V{cxg}" fill="none" stroke="#111" stroke-width="2"/>')
add(f'<text x="{sx+72}" y="{cx5+16}" font-size="11" fill="#555">◂ 1000 µF across 5V–GND</text>')
add(f'<path d="M{vx},{vy} H{L5}" fill="none" stroke="{COL["5v"]}" stroke-width="3.2"/>')
add(f'<path d="M{LG},{py} V{strip["GND"][1]} H{sx}" fill="none" stroke="{COL["gnd"]}" stroke-width="3.2"/>')
add(f'<path d="M{px+130},{py+60} V{py+80} H{g_lane} V{pin_y["GND"][0]}" fill="none" stroke="{COL["gnd"]}" stroke-width="3.2"/>')
add(f'<circle cx="{L5}" cy="{vy}" r="5" fill="{COL["5v"]}"/>')

# reserved sensor C
for n in [P("PIN_C_SDA"), P("PIN_C_SCL"), P("PIN_C_RST")]:
    y = pin_y[n][0]
    add(f'<path d="M{hx+9},{y} H{hx+48}" stroke="{COL["res"]}" stroke-width="3" stroke-dasharray="4 4"/>')
add(f'<text x="{hx+54}" y="{pin_y[P("PIN_C_SCL")][0]+5}" font-size="12.5" fill="#777" stroke="#fff" stroke-width="5" paint-order="stroke">reserved: sensor C (SDA {P("PIN_C_SDA")}, SCL {P("PIN_C_SCL")}, RST {P("PIN_C_RST")})</text>')

# legend
lg = [("3V3", "3v3"), ("GND", "gnd"), ("SDA", "sda"), ("SCL", "scl"), ("RST (required)", "rst"),
      ("LED data", "led"), ("5 V LED power", "5v")]
lx0 = 40
for i, (t, k) in enumerate(lg):
    x = lx0 + i * 190
    add(f'<line x1="{x}" y1="{H-28}" x2="{x+34}" y2="{H-28}" stroke="{COL[k]}" stroke-width="5"'
        + (' stroke-dasharray="8 6"' if k == "rst" else '') + '/>')
    add(f'<text x="{x+42}" y="{H-23}" font-size="13" fill="#333">{t}</text>')
add('</svg>')
Path(__file__).resolve().parent.parent.joinpath("docs", "wiring.svg").write_text("\n".join(out), encoding="utf-8")
print("wrote docs/wiring.svg")
