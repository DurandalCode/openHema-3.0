---
name: tdd-cycle
description: Implement an existing HEMA feature tasks.md with test-first increments and update its completion status.
---

# Implement a feature plan

Read the feature's `spec.md`, `plan.md`, and `tasks.md`, plus `docs/adr/0009-tdd-workflow.md`. For each applicable task, write a meaningful failing test, implement the smallest passing change, then refactor while the test stays green. Keep the test and code in the same increment. Follow the task order and update completed checkboxes and the index in `docs/specs/README.md`.

Use `make generate` after proto edits and `make sqlc` after query edits. Run targeted tests during development, then the affected build/type/lint checks and `make test-all` before completion. Database integration tests need Docker. A newly added server module also needs the complete Dockerized migration check from `server/AGENTS.md`.

If `tasks.md` defines independent tracks, use separate Git worktrees when parallel work is requested and available. Do not assume a particular agent API or merge another track before its checks pass.
