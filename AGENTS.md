# Motto SaaS Engineering Contract

This file defines repository-wide working agreements for coding agents and
contributors. More specific `AGENTS.md` files may add rules for their own
subtrees. When instructions conflict, the file closest to the changed code
wins.

## Project Context

Motto SaaS is a multi-tenant restaurant and cafe management platform. The
application handles commercially sensitive inventory, recipe, pricing, sales,
cash, supplier, and investment data. Correct tenant isolation and financially
consistent writes are product requirements, not optional hardening.

The source of truth for runtime and dependency versions is `package.json` and
`package-lock.json`. The current application uses Next.js App Router, React,
TypeScript, Tailwind CSS, Supabase/Postgres, and Vitest.

## Instruction and Source-of-Truth Order

Use the following order when deciding how the system should behave:

1. Executable code, migrations, tests, and checked-in configuration.
2. The nearest applicable `AGENTS.md` file.
3. Architecture and security decision records under `docs/`.
4. Relevant project skills under `.agents/skills/`.
5. `README.md` and other descriptive documentation.

Do not copy detailed skill instructions into this file. Use the smallest
relevant skill for the task and keep durable, repository-wide rules here.

## Codebase Discovery

Prefer scoped discovery over reading the repository indiscriminately:

1. Use codebase-memory graph tools for symbols, callers, callees, and code
   snippets when those tools are available.
2. Use `graphify query`, `graphify path`, or `graphify explain` for broad
   architecture, cross-file relationships, and project concepts when
   `graphify-out/graph.json` exists.
3. Use `rg` for string literals, error messages, configuration, SQL text, and
   non-code files, or when graph results are insufficient.
4. Read only the source files needed to confirm the graph result before
   editing.

Do not treat generated graph reports as more authoritative than source code or
migrations.

## Architecture Boundaries

- Keep `src/app/` focused on routing, layouts, server boundaries, and composing
  feature entry points. Route files must not become domain monoliths.
- Keep domain behavior in `src/features/<feature>/`. Prefer clear
  `components/`, `hooks/`, `services/`, types, and pure utilities when the
  feature needs them; do not create empty layers for symmetry.
- Put genuinely cross-feature UI in `src/components/`, shared infrastructure in
  `src/lib/`, application-wide hooks in `src/hooks/`, and global providers in
  `src/context/` only when ownership is truly global.
- A feature may depend on shared layers. Shared layers must not import feature
  internals. Avoid feature-to-feature deep imports; expose an intentional public
  entry point when reuse is required.
- Keep business calculations and transformations pure where practical so they
  can be tested without rendering React or connecting to Supabase.
- Preserve the `@/` import convention and existing public APIs unless a planned
  migration updates every consumer.

## Change and Refactor Policy

- Preserve observable behavior during structural refactors unless the user
  explicitly requests a behavior change. Separate behavior changes from
  mechanical moves when practical.
- Before splitting a large file, identify its responsibilities and consumers.
  Extract cohesive units with meaningful names; do not create one-line wrapper
  files or circular dependencies merely to reduce line count.
- Keep pages and workspace components readable as orchestration layers. Move
  reusable presentation, state coordination, data access, and pure calculations
  to their appropriate feature modules.
- Reuse established project patterns before introducing a new abstraction.
  Require a concrete second use case before creating generic infrastructure.
- Do not add a production dependency unless the benefit, maintenance cost, and
  existing alternatives have been checked. Keep lockfiles committed.
- Preserve unrelated user changes and generated artifacts. Never use destructive
  Git commands to clean a working tree.

## Security and Data Integrity

- Treat every request and database operation as tenant scoped. Never trust an
  organization identifier supplied by the browser without server/database-side
  membership verification.
- Never expose secret or `service_role` credentials to client code. Any variable
  prefixed with `NEXT_PUBLIC_` is public.
- Authenticate protected App Router endpoints server-side and validate all
  external input at the boundary.
- Use atomic database operations for workflows that modify multiple related
  records. Successful data mutations must produce the required audit trail.
- Follow `supabase/AGENTS.md` for SQL, RLS, RPC, migration, and database testing
  rules.

## Product and UI Quality

- The product language is Turkish. User-facing copy, validation errors, empty
  states, confirmations, and notifications must be clear Turkish.
- Mobile is a first-class target. Verify narrow touch layouts as well as desktop;
  prevent clipped controls, unreachable actions, horizontal overflow, and
  keyboard-obscured form actions.
- Maintain keyboard navigation, visible focus, semantic controls, labels, and
  accessible dialog behavior.
- Do not use browser-native `alert()` or `confirm()`. Follow the
  `notification-compliance` skill and the established notification provider.
- Use the existing design system and Tailwind tokens. Avoid isolated visual
  conventions, unnecessary inline styles, and arbitrary z-index escalation.

## Roadmap Governance

- Treat `docs/superpowers/ROADMAP.md` as the authoritative current delivery-state summary; detailed specs, plans, and security runbooks remain the implementation source.
- Preserve stable roadmap IDs. Update the relevant roadmap row in the same cohesive commit when work changes status, next gate, detail link, or evidence.
- Never infer current completion solely from historical checkboxes. Distinguish local completion from merged, deployed, migrated, or production-verified work.
- Run `npm run roadmap:check` after roadmap changes. Do not record secrets, raw logs, or mutable external-state claims without a dated verification reference.

## Verification

Run checks proportional to the risk, and run the full quality gate before
declaring a substantial refactor complete:

```text
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

`npm run check` covers formatting, lint, types, and tests. The production build
is a separate required check for routing, bundling, and server/client boundary
changes. Add or update focused tests for bug fixes, pure business logic, state
transitions, and data-contract changes. Do not weaken rules or delete tests to
make a check pass.

After modifying code, run `graphify update .` so the checked-in architecture
graph remains current. Refresh codebase-memory through its MCP workflow when it
is available. Do not manually edit generated graph or memory artifacts.

## Git and Delivery

- Work on a `codex/` branch unless the user selects another branch.
- Keep commits cohesive and use an imperative, descriptive message.
- Review `git diff` and `git status` before committing. Do not stage unrelated
  files, local secrets, caches, or environment files.
- Do not push, merge, deploy, or alter live data unless the user has authorized
  that action.

## Definition of Done

A task is complete only when the requested behavior is implemented, relevant
security and tenant boundaries are preserved, appropriate tests exist and pass,
the required quality gates pass, documentation/graphs affected by the change are
updated, and the final diff contains no accidental changes.

## Code Review Rules

Flag changes that introduce tenant leakage, client-side authorization, exposed
secrets, non-atomic multi-record writes, missing audit records, RPC signature
drift, native browser dialogs, inaccessible interactions, untested business
logic, or route/page files that absorb feature responsibilities. Explain the
failure mode and recommend the safe project pattern; leave formatting enforcement
to automated tooling.
