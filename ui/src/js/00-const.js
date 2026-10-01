/* Ring Studio · constants. Mirrors firmware/include/defaults.h and spec sections 3 and 5.
   Plain script (no modules) so it runs from file://, from the ESP32 and in node tests. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  RS.VERSION = '0.1.0';
  RS.screens = RS.screens || {};
  RS.PROTO = 1;

  // Function catalogue: colour, label, icon path (24x24 stroke icons).
  RS.FN = {
    soap:      { label: 'Soap',      color: '#B69CFF', water: false, icon: 'M12 3.5c3 4 5 6.4 5 9.3a5 5 0 0 1-10 0c0-2.9 2-5.3 5-9.3z M17 5a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0' },
    disposal:  { label: 'Disposal',  color: '#F2B44B', water: false, icon: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3 M19.5 4.5v4h-4' },
    cup:       { label: 'Cup fill',  color: '#4FD1E8', water: true,  icon: 'M6 5h12l-1.4 13.4a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8L6 5z M6.6 10h10.8' },
    waterfall: { label: 'Waterfall', color: '#3FC7A6', water: true,  icon: 'M4 7c2.6 0 2.6 2 5.3 2s2.6-2 5.3-2 2.6 2 5.4 2 M4 12c2.6 0 2.6 2 5.3 2s2.6-2 5.3-2 2.6 2 5.4 2 M4 17c2.6 0 2.6 2 5.3 2s2.6-2 5.3-2 2.6 2 5.4 2' },
    neutral:   { label: 'Neutral',   color: '#AEB7C2', water: false, icon: 'M5 12a7 7 0 1 0 14 0a7 7 0 1 0-14 0' },
    hot:       { label: 'Hot',       color: '#FF6B4A', water: true,  icon: 'M12 3c.8 3 5 5 5 10a5 5 0 0 1-10 0c0-2.8 1.6-4 2.2-5.8 1.3 1 1.8 2.4 1.8 3.8 1.1-2 1.4-4.6 1-8z' },
    warm:      { label: 'Warm',      color: '#FFB27A', water: true,  icon: 'M10 4.5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z M12 9v6.5' },
    cold:      { label: 'Cold',      color: '#6FB6FF', water: true,  icon: 'M12 3v18 M4.2 7.5l15.6 9 M4.2 16.5l15.6-9' }
  };
  RS.WATER_FNS = ['hot', 'warm', 'cold', 'waterfall', 'cup'];
  RS.ACCENT = '#8FE3F2';

  // Layouts (spec 3). Rows are listed back to front; each row's fns left to right.
  RS.LAYOUTS = {
    kitchen:    { name: 'Kitchen',    rows: [{ h: 1 / 3, fns: ['soap', 'disposal', 'cup'] }, { h: 1 / 3, fns: ['waterfall', 'neutral', 'waterfall'] }, { h: 1 / 3, fns: ['hot', 'warm', 'cold'] }] },
    bathroom:   { name: 'Bathroom',   rows: [{ h: 0.5, fns: ['soap', 'waterfall', 'cup'] }, { h: 0.5, fns: ['hot', 'warm', 'cold'] }] },
    accessible: { name: 'Accessible', rows: [{ h: 0.4, fns: ['soap', 'cup'] }, { h: 0.6, fns: ['hot', 'warm', 'cold'] }] }
  };
  RS.LAYOUT_ORDER = ['kitchen', 'bathroom', 'accessible'];

  // State machine (spec 4.2). Numbers are what the wire protocol carries.
  RS.ST = { IDLE: 0, ARMING: 1, ACTIVE: 2, CUP_FULL: 3, EXIT_PENDING: 4, CLEAN: 5 };
  RS.ST_NAME = ['IDLE', 'ARMING', 'ACTIVE', 'CUP_FULL', 'EXIT_PENDING', 'CLEAN'];
  RS.ST_LABEL = ['Idle', 'Tracking', 'Active', 'Full', 'Off in 1 s', 'Cleaning'];

  // Why nothing latches (protocol `flag`, C14 / A6).
  RS.FLAG = { NONE: 0, NO_HAND: 1, STRENGTH: 2, OUTSIDE: 3, JUMP: 4, NOT_SETTLED: 5, BLOCKED: 6, STILL: 7, MASKED: 8 };
  RS.FLAG_TEXT = ['', 'No hand in the sink', 'Echo strength outside the hand window', 'Position outside the plane', 'Jump larger than a hand can move', 'Not settled yet', 'Zone blocked this session', 'Still for 10 s: object', 'In a dead area'];

  // Mount presets. "flat" is the production build: both sensors sit in a slot between the undermount sink and the
  // countertop, level with the sensing plane, aimed across the opening (no tilt, hand about at sensor height).
  // "raised" is the earlier assumption: sensors above the plane, tilted down, hand about 115 mm below them.
  // Depths are mm below the sensor plane (negative = above it).
  RS.PRESETS = {
    flat: {
      name: 'Flat slot', note: 'Sensors in the gap between sink and countertop, aimed across the opening',
      tilt: 0, z: 0, hand: { zmin: -30, zmax: 60, zwork: 0 }, calDepths: [10, 50], handDepths: [5, 35],
      rig: { mount: 'flat', slotH: 14, recess: 20, sinkDepth: 190, beamV: 35 }
    },
    raised: {
      name: 'Raised, tilted', note: 'Sensors above the plane, tilted down at the hand',
      tilt: -20, z: 0, hand: { zmin: 30, zmax: 200, zwork: 115 }, calDepths: [60, 160], handDepths: [55, 150],
      rig: { mount: 'raised', slotH: 40, recess: 0, sinkDepth: 190, beamV: 60 }
    }
  };
  RS.mountOf = function (cfg) { var m = cfg && cfg.rig && cfg.rig.mount; return RS.PRESETS[m] ? m : 'flat'; };
  RS.preset = function (cfg) { return RS.PRESETS[RS.mountOf(cfg)]; };
  RS.calDepths = function (cfg) { return RS.preset(cfg).calDepths; };
  RS.handDepths = function (cfg) { return RS.preset(cfg).handDepths; };
  // Config for a preset (deep copy of the defaults with the preset's numbers applied)
  RS.presetConfig = function (mount) {
    var c = JSON.parse(JSON.stringify(RS.DEFAULTS)), P = RS.PRESETS[mount]; if (!P) return c;
    c.sensors.A.tilt = c.sensors.B.tilt = c.sensors.C.tilt = P.tilt; c.sensors.A.z = c.sensors.B.z = c.sensors.C.z = P.z;
    Object.assign(c.hand, P.hand); c.rig = Object.assign({}, P.rig); return c;
  };

  // Factory defaults (defaults.h). Everything here is editable in the studio (C1 to C4, C9, C10, F14).
  RS.DEFAULTS = {
    schema: 1,
    plane: { w: 584.2, d: 533.4, unit: 'in' },
    sensors: {
      A: { x: 0,     y: 0,     z: 0, yaw: 45,  tilt: 0, off: 0, on: true },
      B: { x: 584.2, y: 0,     z: 0, yaw: 135, tilt: 0, off: 0, on: true },
      C: { x: 292.1, y: 533.4, z: 0, yaw: 270, tilt: 0, off: 0, on: false }
    },
    hand: { zmin: -30, zmax: 60, zwork: 0, strMin: 600, strMax: 60000, stillThr: 6 },
    rig: { mount: 'flat', slotH: 14, recess: 20, sinkDepth: 190, beamV: 35 },
    masks: {},
    layout: 'kitchen',
    layouts: JSON.parse(JSON.stringify(RS.LAYOUTS)),
    tuning: {
      settleMs: 150, settleSpeed: 250, startSpeed: 60, goneFrames: 3, exitMs: 1000, stillOffMs: 10000, presentFrames: 2,
      disposalHoldMs: 1000, disposalRunMs: 15000, cleanMs: 60000, cleanHoldMs: 3000,
      rangeStart: 60, rangeEnd: 850, threshSens: 1.0, i2cKhz: 400, log: false, wifiCh: 6,
      ledCount: 132, ledBright: 90, ledOrder: 'GRB', hyst: 20, beamHalf: 60
    },
    profile: 'default',
    profiles: {
      default: { name: 'Default', hotF: 110, hotCapF: 120, warmF: 100, cupMl: 350, soapMl: 0.8, flowGpm: 1.5, colors: {} }
    },
    units: { temp: 'F' }
  };
  RS.BASELINE_GPM = 2.2;                  // US federal max for kitchen faucets (spec 5)
  RS.GPM_TO_MLS = 3785.41 / 60;           // 1 gpm = 63.09 ml/s
  RS.CUP_PRESETS = [{ name: 'Cup', ml: 350 }, { name: 'Bottle', ml: 750 }, { name: 'Pot', ml: 2000 }];

  // Calibration template (C7): 4 x 4 grid at 1/8, 3/8, 5/8, 7/8; two depths; 40 mm ball.
  RS.CAL = { gridFr: [1 / 8, 3 / 8, 5 / 8, 7 / 8], depths: [60, 160], ballR: 20, fitPassMm: 12, poseFailMm: 30, strengthGapDb: 6, heightDiffMm: 20, nearMm: 60 };

  // Tuning panel metadata (C10): label, unit, min, max, step, help. Drives the settings UI and validation.
  RS.TUNING_META = [
    ['settleMs', 'Settle time', 'ms', 50, 600, 10, 'How long the hand must stay in a zone before it latches'],
    ['settleSpeed', 'Settle speed', 'mm/s', 50, 800, 10, 'Above this speed the settle timer restarts'],
    ['startSpeed', 'Start speed', 'mm/s', 10, 300, 10, 'A target must move at least this fast to start a session (objects never do)'],
    ['goneFrames', 'Gone frames', 'frames', 1, 10, 1, 'Frames with no hand before the exit countdown starts'],
    ['exitMs', 'Exit delay', 'ms', 200, 5000, 100, 'Time from hands out to everything off'],
    ['stillOffMs', 'Stillness time', 'ms', 3000, 60000, 500, 'Perfectly still this long is an object'],
    ['presentFrames', 'Present frames', 'frames', 1, 6, 1, 'Frames of a moving target that start a session'],
    ['disposalHoldMs', 'Disposal hold', 'ms', 300, 3000, 100, 'Hold in the Disposal zone to start it'],
    ['disposalRunMs', 'Disposal run', 'ms', 3000, 60000, 1000, 'Fixed disposal run time'],
    ['cleanMs', 'Clean mode', 'ms', 10000, 300000, 5000, 'Pause length for wiping the sink'],
    ['rangeStart', 'Range start', 'mm', 40, 300, 10, 'Detector start distance'],
    ['rangeEnd', 'Range end', 'mm', 400, 1500, 50, 'Detector end distance'],
    ['threshSens', 'Threshold sensitivity', 'x', 0.3, 3, 0.1, 'Scales the recorded threshold'],
    ['i2cKhz', 'I2C speed', 'kHz', 100, 400, 300, '400 normally; 100 if bus errors appear'],
    ['wifiCh', 'Wi-Fi channel', '', 1, 11, 1, 'Change if the venue is busy on this channel'],
    ['ledCount', 'LED count', 'LEDs', 1, 300, 1, 'The real number on the strip'],
    ['ledBright', 'LED brightness cap', '/255', 10, 255, 5, 'Keeps the supply within its rating'],
    ['hyst', 'Zone hysteresis', 'mm', 0, 60, 2, 'Hand must be this far inside a zone to count']
  ];
})();
