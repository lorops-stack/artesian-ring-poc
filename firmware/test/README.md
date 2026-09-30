# Tests

`pio test -e native` runs the unit tests for `lib/core`: one test per transition in spec section 4.3, plus replays of recorded real sessions.

`fixtures/` holds recorded sessions used as regression tests. They are committed. Scratch recordings go in the repo-level `sessions/` folder, which git ignores.
