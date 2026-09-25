---
name: add-module
description: Add a Go bounded-context module to the HEMA server, including contracts, persistence, wiring, and integration checks.
---

# Add a server module

Use `server/AGENTS.md` as the current module checklist and `docs/adr/0002-modular-monolith.md` for boundaries. For a nontrivial module, start with the feature spec and plan in `docs/specs/`.

Change the API in `proto/` first, then regenerate with `make generate`. Implement domain and service behavior with tests, add SQL queries and migrations, run `make sqlc`, then add the repo adapter, Connect handler, and platform wiring. Do not edit generated Go or SQLC output.

Check every explicitly enumerated module location listed under “Добавление модуля” in `server/AGENTS.md`: `server/sqlc.yaml`, `server/internal/testdb/testdb.go`, root `Makefile`, and `server/Dockerfile`. Verify the affected unit/API tests and the Dockerized migration path before considering the module complete.
