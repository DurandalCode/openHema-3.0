# Mobile start of arena bout

- Initial base: `7e8a8eb`; joined after the Space fix at `a1d67b0`.
- Branch/worktree: `feedback/mobile-bout-start`, `/private/tmp/hema-feedback/mobile-bout-start`.
- Scope: mobile `BoutTimerStrip`, wide `TimerControls`, and props wiring in `BoutPanelView` after the Space track was integrated.

## Result

On a not-started current bout, both timer buttons now submit the bout-start command first. The timer starts only after that command succeeds. A rejected command leaves the timer stopped and shows the error toast. The start button is disabled while the command is pending. For an in-progress bout, Start resumes the timer without repeating the bout command; Pause continues to pause the timer directly. No proto, server, scoring, or result-hold behavior changed.

## Red → green

The new mobile component tests first failed because no bout-start request was sent. A new wide-panel test failed because `controls.start()` ran despite HTTP 409. After the code change, all three cases passed. `BoutPanelView` passes the current arena, pool, and bout state to the mobile strip; its test verifies the wiring.

## Checks

| Check | Result |
| --- | --- |
| Targeted Vitest (strip, panel, timer controls) | 48/48 passed. |
| Full Vitest | 395 files, 3168/3168 passed. |
| `tsc --noEmit` | Passed. |
| Full ESLint | Passed with 8 existing warnings outside this change; no errors. |
| `next build` | Passed when run with network access for Google Fonts. The sandbox-only attempt failed DNS lookup for `fonts.googleapis.com`. |
| `git diff --check` | Passed. |

Dependencies and generated web types were temporarily linked from the main checkout for local checks; these links are removed before commit. No migration or code generation was needed.

## Integration QA

With a real arena and two connected clients, start a not-started bout from the phone layout and verify that the board changes to in progress before the timer runs. Repeat at desktop width, then test Pause/Start on an already in-progress bout. Simulate a rejected start command and verify that the timer stays stopped and the error is visible. The Space shortcut in `BoutPanelView` still directly controls the timer; aligning its first-start behavior with the buttons is a separate keyboard task because this track only joins props into that file.
