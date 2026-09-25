---
name: add-feature-web
description: Add a HEMA Next.js UI or BFF feature while preserving FSD boundaries and server-only transport rules.
---

# Add a web feature

Read `web/AGENTS.md` and the relevant screen spec. Keep imports within `app → widgets → features → entities → shared`; BFF infrastructure lives in `src/lib/`. New RPCs start in `proto/` and require `make generate`.

Place route handlers in `src/app/api/` with Node runtime. Keep tokens in httpOnly cookies and Connect clients on the server. Use TanStack Query for client server-state, Zustand for shared UI state, and local React state for local interactions. Reuse existing UI tokens and components.

Write focused tests for changed behavior. For tests that construct generated protobuf values, use `create(Schema, partial)` and run `pnpm exec tsc --noEmit` as well as Vitest; Vitest alone does not type-check those mocks. Run relevant lint/build checks when the change affects them.
