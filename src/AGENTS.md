# Application Source Guidelines

These instructions apply to all code under `src/` and extend the repository
contract in the root `AGENTS.md`.

## Feature Architecture

- Keep App Router files under `src/app/` thin. A page should resolve route-level
  concerns and compose a feature workspace; it should not own a large domain
  workflow, database service, or reusable presentation system.
- Organize domain code under `src/features/<feature>/`. Use only the folders the
  feature needs:
  - `components/` for feature UI and focused subviews.
  - `hooks/` for stateful orchestration and reusable React behavior.
  - `services/` for typed data-access operations and external boundaries.
  - colocated `types`, schemas, constants, and pure utilities for domain logic.
- Keep components focused on rendering and interaction. Move data acquisition,
  mutation coordination, and reusable state machines into hooks/services; move
  calculations and transformations into pure functions.
- Do not import a feature's private files from another feature. If cross-feature
  reuse is legitimate, expose a small intentional public module or move the
  capability to a shared layer.
- Avoid barrel files that hide circular dependencies or export an entire feature
  by default. Prefer explicit imports and narrowly designed public exports.

## React and Next.js

- Prefer Server Components by default. Add `'use client'` only at the smallest
  boundary that requires browser APIs, event handlers, or client-side state.
- Never import server-only modules, secrets, or privileged Supabase clients into
  a Client Component.
- Keep effects for synchronization with external systems, not for deriving state
  that can be calculated during render. Stabilize provider callbacks and effect
  dependencies; do not silence hook dependency warnings without a documented
  reason.
- Represent loading, empty, error, success, and disabled states explicitly.
  Prevent duplicate submissions and make asynchronous failures recoverable.
- Keep TypeScript strict. Do not introduce `any`, unsafe casts, non-null
  assertions, or duplicated database shapes when a precise type can be derived.

## Data and Mutations

- Centralize feature-specific Supabase access in a typed service or server
  boundary instead of scattering raw calls across presentation components.
- Keep client RPC parameter names synchronized with the migration-defined
  function signature. Treat any RPC signature change as a cross-layer contract
  change and test it end to end.
- Every successful insert, update, and delete must satisfy the
  `audit-log-compliance` skill. Multi-record workflows must satisfy
  `supabase-atomic-transactions` and `supabase/AGENTS.md`.
- Surface actionable Turkish errors to users, but do not expose SQL, stack traces,
  secret values, or internal authorization details.

## UI, Mobile, and Accessibility

- Design mobile-first and verify at approximately 320 px, 375 px, and a desktop
  viewport when a screen changes materially.
- Primary actions must remain reachable with the on-screen keyboard open. Dialogs
  and drawers need bounded height, internal scrolling, safe-area spacing, and a
  deliberate sticky-action strategy where appropriate.
- Use semantic buttons, inputs, labels, headings, and tables. Icon-only actions
  require accessible names. Preserve focus on validation errors and restore it
  after dialogs close.
- Use the established notification provider for alerts and confirmations. Native
  `alert`, `confirm`, and `prompt` are prohibited.
- Reuse design tokens and established primitives. Responsive desktop/mobile
  renderers may share data and actions, but should not be forced into one
  unreadable conditional component.

## Refactor Quality

- Split by responsibility, not by an arbitrary line target. A good extraction
  has a clear owner, small public contract, and independent reason to change.
- Keep orchestration visible: readers should be able to understand a feature's
  major states and actions from its workspace component without opening every
  child file.
- Preserve labels, test selectors, keyboard behavior, responsive actions, and
  notification semantics while moving code.
- Add focused unit tests for extracted pure logic and regression tests for fixed
  behavior. Prefer testing public behavior over implementation details.

## Source Review Checklist

Before completing a `src/` change, confirm that route files remain thin, imports
respect ownership boundaries, server/client separation is safe, mobile actions
are usable, accessible interactions are preserved, user messages are Turkish,
mutations are audited, and targeted plus repository quality checks pass.
