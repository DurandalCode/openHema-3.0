# Mobile start of arena bout

- Initial base: `7e8a8eb`; joined after the Space fix at `a1d67b0`.
- Branch/worktree: `feedback/mobile-bout-start`, `/private/tmp/hema-feedback/mobile-bout-start`.
- Scope: mobile `BoutTimerStrip`, wide `TimerControls`, and props wiring in `BoutPanelView` after the Space track was integrated.

## Result

On a not-started current bout, both timer buttons and the Space shortcut now submit the bout-start command first. The timer starts only after that command succeeds. A rejected command leaves the timer stopped and shows the error toast. The start button is disabled while the command is pending; repeated Space is ignored until its command completes. For an in-progress bout, Start/Space resumes the timer without repeating the bout command, and Pause/Space pauses it directly. Space on a focused control or while a modal dialog is open still belongs to that control/dialog. No proto, server, scoring, or result-hold behavior changed.

## Red → green

The new mobile component tests first failed because no bout-start request was sent. A new wide-panel test failed because `controls.start()` ran despite HTTP 409. After the code change, all three cases passed. `BoutPanelView` passes the current arena, pool, and bout state to the mobile strip; its test verifies the wiring.

The Space follow-up added three more behavioral tests before changing its handler: a first Space must wait for bout-start success, a rejected command must keep the clock stopped, and a second Space during the pending command must not submit another request. The first two failed on the old direct timer path. Running-timer Pause and the existing focused-button/modal-dialog guard tests also pass.

## Checks

| Check | Result |
| --- | --- |
| Targeted Vitest (strip, panel, timer controls) | 52/52 passed after Space follow-up. |
| Full Vitest | 395 files, 3172/3172 passed after Space follow-up. |
| `tsc --noEmit` | Passed. |
| Full ESLint | Passed with 8 existing warnings outside this change; no errors. |
| `next build` | Passed with network access for Google Fonts after clearing the worktree's generated `.next` cache. |
| `git diff --check` | Passed. |

Dependencies and generated web types were temporarily linked from the main checkout for local checks; these links are removed before commit. No migration or code generation was needed.

## Integration QA

With a real arena and two connected clients, start a not-started bout from the phone layout and verify that the board changes to in progress before the timer runs. Repeat at desktop width and with Space outside controls, then test Pause/Start on an already in-progress bout. Simulate a rejected start command and verify that the timer stays stopped and the error is visible. Confirm that Space on a focused action button activates only that button and Space inside an open dialog does not control the background timer.
