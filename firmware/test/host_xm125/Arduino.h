// Minimal Arduino shim so lib/xm125 compiles on a PC (test/host_xm125 only).
#pragma once
#include <stdint.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <math.h>
#include <stddef.h>
#define HIGH 1
#define LOW 0
#define OUTPUT_OPEN_DRAIN 5
extern uint32_t g_ms;
inline uint32_t millis() { return g_ms; }
inline void delay(uint32_t ms) { g_ms += ms; }
inline void delayMicroseconds(uint32_t us) { g_ms += us / 1000; }
inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
inline int digitalRead(int) { return 1; }
struct SerialShim { void printf(const char* f, ...) { va_list a; va_start(a, f); vprintf(f, a); va_end(a); } };
extern SerialShim Serial;
