---
name: write-spec
description: Create a spec, plan, and task list for a nontrivial HEMA feature before implementation.
---

# Write a feature spec

Use for new modules, domain RPCs, or changes spanning contracts and application layers. Small fixes and refactors do not need a spec.

Read `docs/adr/0008-spec-driven-development.md` and the templates in `docs/specs/_templates/`. Choose the next `NNN-<feature>` number from `docs/specs/`, then write `spec.md` with the problem, actors, requirements, and Given/When/Then acceptance criteria. Record unresolved domain decisions as `[NEEDS CLARIFICATION]` and ask the user about decisions that block a useful plan.

Once the spec is clear, write `plan.md` for the affected proto, server, database, web, and test layers, then `tasks.md` as an ordered test-first checklist. Update `docs/specs/README.md`. Keep product requirements in the spec and implementation choices in the plan. If the user requested implementation too, continue through the tasks.
