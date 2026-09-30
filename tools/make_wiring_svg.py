"""Generates docs/wiring.svg from the pin layout. Run: python tools/make_wiring_svg.py"""
from pathlib import Path

W, H = 1500, 1110
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
used = {"3V3": "3v3", "4": "led", "6": "rst", "7": "rst", "8": "sda", "9": "scl",
        "17": "sda", "18": "scl", "GND": "gnd", "10": "res", "11": "res", "12": "res"}
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
ls = {}
for i, p in enumerate(["GND", "1OE", "1A (in)", "1Y (out)", "VCC 5V"]):
    py = ly + 50 + 30 * i
    side = lx if i < 3 else lx + 230
    add(f'<circle cx="{side}" cy="{py}" r="7" fill="#fff" stroke="#333" stroke-width="2"/>')
    add(f'<text x="{lx+18 if i<3 else lx+212}" y="{py+5}" font-size="13" fill="#fff" text-anchor="{"start" if i<3 else "end"}">{p}</text>')
    ls[p] = (side, py)

# LED strip and PSU
sx, sy = 1260, 830
add(f'<rect x="{sx}" y="{sy-60}" width="200" height="120" rx="10" fill="#f1f3f5" stroke="#999"/>')
add(f'<text x="{sx+100}" y="{sy-36}" font-size="14" font-weight="700" fill="#111" text-anchor="middle">WS2812B ring strip</text>')
strip = {"DIN": (sx, sy - 10), "5V": (sx, sy + 20), "GND": (sx, sy + 45)}
for k, (x, y) in strip.items():
    add(f'<circle cx="{x}" cy="{y}" r="7" fill="#fff" stroke="#333" stroke-width="2"/>')
    add(f'<text x="{x+14}" y="{y+5}" font-size="13" fill="#111">{k}</text>')
px, py = 1195, 960
add(f'<rect x="{px}" y="{py}" width="265" height="60" rx="10" fill="#fff4e6" stroke="{COL["5v"]}"/>')
add(f'<text x="{px+130}" y="{py+25}" font-size="14" font-weight="700" fill="#111" text-anchor="middle">5 V ≥ 4 A supply + 5 A fuse</text>')
add(f'<text x="{px+130}" y="{py+45}" font-size="12" fill="#444" text-anchor="middle">feed both strip ends · 1000 µF at input</text>')

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
    ("rsta", [(E("6"), xA["RST"])], COL["rst"], True),
    ("rstb", [(E("7"), xB["RST"])], COL["rst"], True),
    ("sdaa", [(E("8"), xA["SDA"])], COL["sda"], False),
    ("scla", [(E("9"), xA["SCL"])], COL["scl"], False),
    ("sdab", [(E("17"), xB["SDA"])], COL["sda"], False),
    ("sclb", [(E("18"), xB["SCL"])], COL["scl"], False),
    ("led",  [(E("4"), ls["1A (in)"])], COL["led"], False),
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
add(f'<path d="M{L5},{py} V{strip["5V"][1]} H{sx}" fill="none" stroke="{COL["5v"]}" stroke-width="3.2"/>')
add(f'<path d="M{vx},{vy} H{L5}" fill="none" stroke="{COL["5v"]}" stroke-width="3.2"/>')
add(f'<path d="M{LG},{py} V{strip["GND"][1]} H{sx}" fill="none" stroke="{COL["gnd"]}" stroke-width="3.2"/>')
add(f'<path d="M{px+130},{py+60} V{py+80} H{g_lane} V{pin_y["GND"][0]}" fill="none" stroke="{COL["gnd"]}" stroke-width="3.2"/>')
add(f'<circle cx="{L5}" cy="{vy}" r="5" fill="{COL["5v"]}"/>')

# reserved sensor C
for n in ["10", "11", "12"]:
    y = pin_y[n][0]
    add(f'<path d="M{hx+9},{y} H{hx+48}" stroke="{COL["res"]}" stroke-width="3" stroke-dasharray="4 4"/>')
add(f'<text x="{hx+54}" y="{pin_y["11"][0]+5}" font-size="12.5" fill="#777" stroke="#fff" stroke-width="5" paint-order="stroke">reserved: sensor C (SDA 10, SCL 11, RST 12)</text>')

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
