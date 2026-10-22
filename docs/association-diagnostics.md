# Diagnosing three echoes with no position

`pick=-1/-1/-1 assoc=1 track=none` means no selected echo triple, `FLAG_NO_HAND`, and no position published for this frame. `assoc=1` is not success. A nonzero echo count means detection succeeded, not that three ranges describe one point. Indices are zero-based. With `holdA/B/C`, a reused echo has no index in the current list.

The three-range solver filters invalid/weak/strong/background echoes, tries every surviving A/B/C combination (up to 10 per sensor), subtracts each saved range offset, and solves XY at the saved working depth. It uses a range-difference seed and six bounded least-squares steps. It rejects residuals above 35 mm, points outside the opening, and masked areas. Among valid triples it minimizes summed corrected ranges plus six times the maximum residual, plus a tracking-distance penalty when tracking. Yaw, tilt, beam angle, `nearWin`, and the two-sensor amplitude score do not gate `associate3()`. Do not tune those expecting them to fix its rejection.

## New serial fields

These fields observe the existing algorithm; thresholds and selection remain unchanged. They appear with and without Ring Studio connected.

| Field | Meaning |
|---|---|
| `why=unavailable` | At least one sensor did not answer; association was not called. |
| `why=disabled` | A/B/C is disabled or C's pose is absent. |
| `why=missing` | At least one effective echo list is empty. |
| `why=filtered` | Lists existed but at least one had no surviving candidate. |
| `why=geometry` | Saved XY antenna positions are collinear or effectively degenerate. |
| `why=no-fit` | All tested triples were rejected; see `reject`. |
| `why=accepted` / `jump` | Selected triple passed geometry; `jump` exceeded the 220 mm prediction gate. |
| `why=held` | Echo-hold policy prevents acquisition, or all three lists were held. |
| `cand=A/B/C` | Counts remaining after individual echo filters. |
| `filter=A/B/C` | Invalid range/strength, offset, strength limits or envelope rejections. |
| `bg=A/B/C` | Echoes excluded by software background matching. |
| `tried=N` | Number of candidate triples tested. |
| `reject=depth/solver/residual/boundary/mask` | Triple rejection counts. Residual and boundary can both count the same triple. Depth means corrected range is smaller than the assumed vertical separation; solver means singular, nonfinite, or a step over 200 mm. |
| `minRes` | Smallest maximum range error among solved triples, even rejected ones; -1 means none solved. It is not necessarily the selected triple's residual. |
| `raw=x,y r=...` | Selected triple's unsmoothed point and residual only. No invented zero coordinates or zero uncertainty on a rejected frame. |
| `assoc` / `post` | Association flag before tracking / flag after jump recovery and predictor boundary checks. |

Numeric flags remain: 0 accepted, 1 no hand, 2 strength, 3 residual/boundary, 4 jump, 5 not settled, 6 blocked, 7 still, 8 masked. The state-machine flag may differ from the association flag.

## Tracking and IDLE

A valid triple updates the alpha-beta tracker. Ordinary rejected frames publish no position immediately; the tracker resets after `goneFrames` misses (default three). One jump retains the predicted position; a second consecutive jump within 60 mm of the first reacquires. A predicted point outside the opening is dropped and resets the tracker. The new `assoc` remains the original result even when jump recovery changes `post` to zero.

Position tracking and actuation are different. IDLE requires `presentFrames` consecutive moving frames at `startSpeed` to begin a session (defaults two frames at 60 mm/s), then ARMING requires settling in a zone. A stationary bottle can have a valid position and stay IDLE indefinitely. A session's stillness rule can later learn an object as software background. Do not disable movement/stillness rules merely to make a stationary bottle activate.

## Coordinates and the October 22 bench logs

Origin is the opening's back-left corner; X right, Y toward the user. Use antenna centres, not PCB corners or beam aim points. Corrected range is measured range minus `off`. Vertical separation is `hand.zwork + sensor.z`: target Z is `-zwork`. Antennas 15.875 mm above a tabletop do not imply the bottle's reflecting surface is at tabletop height. Either use the tabletop as Z=0 and measure target height, or the antenna plane as Z=0 and measure relative target depth; do not count the same height twice.

The reported tape is 533.4 mm wide by 584.2 mm deep, unlike factory 584.2 by 533.4. Factory antenna XY positions are A=(-35.92,-35.92), B=(620.12,-35.92), C=(-35.92,569.32) mm. Saved calibration overrides defaults, and firmware-only updates preserve it. Exact bench horizontal offsets and the logged build/configuration remain unknown. Do not overwrite them with guessed corner positions.

Representative Zone 5 ranges (380,404,288) and Zone 2 retest ranges (256,267,437) both fail the current factory geometry with `FLAG_OUTSIDE` (3), not the logged 1. Thus factory replay does not reproduce the device state. One accepted centre point does not validate geometry. At nominal tape corners and zero vertical separation, the Zone 2 reference point (266.7,97.4) predicts about (283.9,283.9,555.0) mm. In particular C=437 needs explanation; a bottle's near surface, displaced antenna, saved offset or different echo can affect it. These are hypotheses, not measured corrections. Original logs do not identify the exact cause of `assoc=1`.

## Retest

1. Export the current configuration before changing anything. Connect this PC to ArtesianRing Wi-Fi. Close any serial monitor using the ESP32 COM port. Ring Studio may stay open.
2. Run the capture script below for the empty scene, stationary Zone 5, stationary Zone 2, then a moving hand entering and settling in each zone. Keep the same settings between captures. Record the exact flashed source commit, target type/diameter, target centre XY, and antenna-centre XYZ measurements. Preserve both before/after JSON exports.
3. On the diagnostic build, inspect `why`, `cand`, `bg`, `reject`, `minRes`. Correct verified dimensions, positions, offsets or working depth in Ring Studio; reboot with an empty scene before a controlled repeat to clear software background and tracker history. Do not widen 35 mm or force a two-range solution.
4. Test a missing C and inconsistent triples: no new three-range acquisition is expected. After software checks, physical coverage, withdrawal timing and empty/wet scene acceptance still belong to issue #5.

From the repository root, this complete PowerShell command prompts for the COM port and writes a timestamped Desktop folder. It works on existing firmware too, but older firmware lacks the new diagnostic fields. HTTP failures are recorded and do not prevent serial capture; a capture without configuration cannot establish the saved geometry.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\capture-association.ps1 -Label zone2 -Seconds 15 -BuildCommit (git rev-parse HEAD)
```

Use `-BuildCommit unknown` if this checkout does not match the flashed firmware. Capture the current saved configuration without opening serial:

```powershell
$captureDir = Join-Path ([Environment]::GetFolderPath('Desktop')) ('artesian_config_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $captureDir -ErrorAction Stop | Out-Null
Invoke-WebRequest -UseBasicParsing -Uri 'http://192.168.4.1/api/cal/export' -TimeoutSec 10 -OutFile (Join-Path $captureDir 'ring-calibration.json')
Invoke-WebRequest -UseBasicParsing -Uri 'http://192.168.4.1/api/status' -TimeoutSec 10 -OutFile (Join-Path $captureDir 'status.json')
Write-Host "Saved to $captureDir"
```

## Two-sensor fallback

Current main's sensing loop calls `associate3()` only. The older `associate()` is not an automatic fallback. Brief held echoes can bridge a live sensor reporting no peaks on an established track; they do not support new acquisition and a dead sensor is not held. Two ranges at fixed depth generally yield two mirror positions. Silently choosing one would hide the unresolved geometry problem. A separately tested, explicitly enabled degraded-zone mode would be separate work; none is introduced here.
