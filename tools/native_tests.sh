#!/usr/bin/env bash
# Builds and runs the lib/core native tests with plain g++ (no PlatformIO needed). PlatformIO users: pio test -e native
# Needs: g++, and ArduinoJson + Unity sources (pass their paths, or let the script clone them next to the repo).
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
AJ="${ARDUINOJSON_SRC:-$HERE/../_deps/ArduinoJson/src}"; UN="${UNITY_SRC:-$HERE/../_deps/Unity/src}"
if [ ! -d "$AJ" ]; then mkdir -p "$HERE/../_deps" && git clone -q --depth 1 --branch v7.2.1 https://github.com/bblanchon/ArduinoJson.git "$HERE/../_deps/ArduinoJson"; fi
if [ ! -d "$UN" ]; then mkdir -p "$HERE/../_deps" && git clone -q --depth 1 https://github.com/ThrowTheSwitch/Unity.git "$HERE/../_deps/Unity"; fi
OUT="$(mktemp -d)"
g++ -std=gnu++17 -O1 -Wall -Wextra -I"$HERE/firmware/lib/core" -I"$AJ" -I"$UN" "$HERE"/firmware/lib/core/*.cpp "$HERE"/firmware/test/test_core/test_main.cpp "$UN/unity.c" -o "$OUT/test_core"
cd "$HERE/firmware" && "$OUT/test_core"
