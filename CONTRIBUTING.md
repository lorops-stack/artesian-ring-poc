# Contributing

## Start with an outcome

Create or select a GitHub issue before implementation. State the user-visible problem, intended outcome, acceptance criteria, constraints and evidence needed. Link a parent epic for work spanning features; split technical tasks only when they have separate ownership or verification. Small fixes can use one issue.

Keep the current plan, significant decisions, blockers and progress in issue comments. Revise the issue body when the accepted scope changes. Attach measurements, screenshots and logs there. Do not add task journals, agent transcripts, status reports or speculative roadmap files to the repository. Durable setup instructions, architecture, API contracts, test procedures and reusable fixtures belong in version control.

## Implement a reviewable change

Use a branch named `feature/<issue>-<description>` or `fix/<issue>-<description>`. Preserve other open work. When depending on an unmerged PR, name it and target that branch; retarget after it merges. Keep a PR focused on one outcome and reference its issue. Explain concrete behavior, tradeoffs, verification and unresolved limits. A related documentation change belongs with its code.

Run checks appropriate to the change. For sensing changes, run JavaScript tests, native core tests, XM125 driver tests, build the target firmware and build the browser bundle. Check rendered screens when changing UI. Record exact commands, result and environment on the PR. Never describe a compile, simulator or synthetic fixture as a hardware test.

## Review and release

Use a draft PR while acceptance criteria or required evidence remain unmet. A maintainer reviews the diff and evidence before merging. Physical commissioning may be a separate linked issue, but its absence must be explicit. Do not close that issue because software checks passed. Do not merge, tag or publish a release on behalf of the owner without authorization. A release identifies its commit, compatible hardware, migration steps, validation and known limits; attach reproducible firmware/UI artifacts with checksums.

Repository templates help capture these records; branch protection and required reviews must be configured separately by an administrator. Templates are not enforcement.
