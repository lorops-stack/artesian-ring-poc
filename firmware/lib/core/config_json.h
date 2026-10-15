// config_json.h - Config <-> JSON (ArduinoJson 7). Separate header so lib/core users that do not need JSON
// (the state machine tests) do not pull ArduinoJson in.
#pragma once
#include <ArduinoJson.h>
#include "config.h"

namespace ring {
void configToJson(const Config& c, JsonObject out);
bool configFromJson(const JsonObjectConst in, Config& c);       // merges onto c; unknown keys ignored
bool validateConfig(const Config& c, char* err, int errLen);
// Apply {"dotted.path": value} sets (protocol `cfg`). A null value deletes the key. Returns false on a bad path.
bool configApplySet(Config& c, const JsonObjectConst set, char* err, int errLen);
}
