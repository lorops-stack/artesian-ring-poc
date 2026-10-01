#include "config.h"
#include <string.h>
#include <stdio.h>

namespace ring {

static void setRow(LayoutRow& r, float h, int n, Fn a, Fn b = Fn::None, Fn c = Fn::None) { r.h = h; r.n = n; r.fns[0] = a; r.fns[1] = b; r.fns[2] = c; r.fns[3] = Fn::None; }
void defaultLayouts(Config& c) {
  c.nLayouts = 3;
  Layout& k = c.layouts[0]; strcpy(k.id, "kitchen"); strcpy(k.name, "Kitchen"); k.nRows = 3;
  setRow(k.rows[0], 1 / 3.f, 3, Fn::Soap, Fn::Disposal, Fn::Cup); setRow(k.rows[1], 1 / 3.f, 3, Fn::Waterfall, Fn::Neutral, Fn::Waterfall); setRow(k.rows[2], 1 / 3.f, 3, Fn::Hot, Fn::Warm, Fn::Cold);
  Layout& b = c.layouts[1]; strcpy(b.id, "bathroom"); strcpy(b.name, "Bathroom"); b.nRows = 2;
  setRow(b.rows[0], 0.5f, 3, Fn::Soap, Fn::Waterfall, Fn::Cup); setRow(b.rows[1], 0.5f, 3, Fn::Hot, Fn::Warm, Fn::Cold);
  Layout& a = c.layouts[2]; strcpy(a.id, "accessible"); strcpy(a.name, "Accessible"); a.nRows = 2;
  setRow(a.rows[0], 0.4f, 2, Fn::Soap, Fn::Cup); setRow(a.rows[1], 0.6f, 3, Fn::Hot, Fn::Warm, Fn::Cold);
}
void setDefaults(Config& c) {
  c = Config();
  c.A = SensorPose{ 0, 0, 0, 45, -20, 0, true }; c.B = SensorPose{ 584.2f, 0, 0, 135, -20, 0, true }; c.C = SensorPose{ 292.1f, 533.4f, 0, 270, -20, 0, false };
  defaultLayouts(c);
  c.nProfiles = 1; c.profiles[0] = Profile();
}
const Layout* Config::findLayout(const char* id) const { for (int i = 0; i < nLayouts; i++) if (strcmp(layouts[i].id, id) == 0) return &layouts[i]; return nullptr; }
Layout* Config::findLayout(const char* id) { for (int i = 0; i < nLayouts; i++) if (strcmp(layouts[i].id, id) == 0) return &layouts[i]; return nullptr; }
const Layout* Config::activeLayout() const { const Layout* l = findLayout(layout); return l ? l : (nLayouts ? &layouts[0] : nullptr); }
const Profile* Config::activeProfile() const { for (int i = 0; i < nProfiles; i++) if (strcmp(profiles[i].id, profile) == 0) return &profiles[i]; return nProfiles ? &profiles[0] : nullptr; }

}  // namespace ring
