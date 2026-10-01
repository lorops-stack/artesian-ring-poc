#!/usr/bin/env bash
# Builds and runs the XM125 driver against a fake module on the PC (no hardware, no PlatformIO).
set -e
cd "$(dirname "$0")/../firmware"
g++ -std=gnu++17 -Wall -Itest/host_xm125 -Ilib/xm125 test/host_xm125/test_xm125.cpp lib/xm125/xm125.cpp -o /tmp/xm125_host_test
/tmp/xm125_host_test
