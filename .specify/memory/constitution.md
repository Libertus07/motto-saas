<!--
Sync Impact Report
- Version change: template -> 1.0.0
- Modified principles: placeholder principles -> five Motto SaaS engineering principles
- Added sections: Engineering Constraints; Spec-Driven Delivery and Quality Gates
- Removed sections: none
- Follow-up TODOs: none
-->

# Motto SaaS Engineering Constitution

## Core Principles

### I. Tenant Isolation and Data Integrity Are Non-Negotiable

Every protected read and write MUST be scoped to an authorized organization at
the server or database boundary. Browser-supplied organization identifiers MUST
NOT be treated as authorization. Multi-record business operations MUST be atomic,
financial calculations MUST remain internally consistent, and every successful
mutation that requires an audit trail MUST record it. Secrets and service-role
credentials MUST never enter client bundles. These requirements take precedence
over delivery speed because a tenant leak or partial financial write is a product
failure, not a minor defect.

### II. Architecture Must Preserve Clear Ownership

Route files MUST remain composition and framework-boundary layers. Domain behavior
belongs in `src/features/<feature>/`; genuinely shared UI and infrastructure belong
in their established shared layers. Refactors MUST preserve observable behavior
unless the approved specification explicitly changes it. New abstractions MUST
have a concrete ownership boundary and demonstrated reuse; files MUST NOT be split
solely to reduce line count. Public APIs and the `@/` import convention MUST remain
stable unless a migration plan updates every consumer.

### III. Specifications Must Be Testable and Traceable

Material features, cross-module changes, database contract changes, and substantial
refactors MUST begin with a written specification describing user value, scope,
non-goals, acceptance scenarios, and measurable success criteria. Plans and tasks
MUST trace back to those requirements. Security, tenant boundaries, audit behavior,
mobile behavior, accessibility, failure states, and migration or rollback needs
MUST be addressed when relevant. Unresolved ambiguity MUST be clarified before
implementation rather than silently converted into assumptions.

### IV. Verification Is Part of Implementation

Every change MUST be verified in proportion to its risk. Bug fixes and business
rules MUST include focused regression tests where practical. Database contract
changes MUST verify migrations, RPC signatures, RLS behavior, and tenant isolation.
Substantial changes are incomplete until formatting, linting, type checking, tests,
and the production build pass, unless a documented external blocker makes a check
impossible. Tests and rules MUST NOT be weakened merely to obtain a green result.

### V. Mobile, Accessibility, and Turkish UX Are First-Class

User-facing product language MUST be clear Turkish. New or changed interfaces MUST
work on narrow mobile viewports and desktop, remain keyboard accessible, expose
visible focus and semantic labels, and handle loading, empty, error, overflow, and
long-content states. Browser-native `alert()` and `confirm()` MUST NOT be introduced.
UI changes MUST reuse the existing design system and notification patterns instead
of creating isolated visual conventions.

## Engineering Constraints

- `package.json`, `package-lock.json`, executable code, migrations, tests, and
  checked-in configuration define the runtime source of truth.
- The nearest applicable `AGENTS.md` governs work in its subtree. This constitution
  governs Spec Kit artifacts and MUST be applied consistently with those contracts.
- Production dependencies MUST NOT be added without checking existing alternatives,
  maintenance cost, security exposure, bundle impact, and lockfile changes.
- Supabase changes MUST follow `supabase/AGENTS.md`, use forward-only migrations,
  and preserve least-privilege access, RLS, atomicity, and audit requirements.
- Generated Graphify and codebase-memory artifacts MUST be refreshed through their
  supported tools after relevant source or documentation changes; generated files
  MUST NOT be edited manually.
- Unrelated user changes, local secrets, caches, and environment files MUST remain
  untouched and MUST NOT enter commits.

## Spec-Driven Delivery and Quality Gates

1. Start material work with `$speckit-specify`; use `$speckit-clarify` when any
   requirement could materially change scope, data behavior, or user experience.
2. Use `$speckit-plan` to record architecture, data contracts, security boundaries,
   migration strategy, verification strategy, and affected modules.
3. Use `$speckit-tasks` to produce cohesive, dependency-ordered work items with
   explicit tests and acceptance checks. Run `$speckit-analyze` before implementation
   for high-risk or cross-module work.
4. Implement only the approved scope. Any discovered behavior change, destructive
   operation, live-data action, or material scope expansion requires explicit user
   authorization and an updated specification.
5. Before completion, review the diff and run the applicable focused checks plus the
   full quality gate for substantial changes: `npm run format:check`, `npm run lint`,
   `npm run typecheck`, `npm run test`, and `npm run build`.
6. A pull request or handoff MUST state what changed, how it was verified, remaining
   risks, migration or rollback considerations, and any intentionally deferred work.

## Governance

This constitution is the governing contract for Spec Kit planning and delivery in
Motto SaaS. It complements the repository's `AGENTS.md` hierarchy and MUST NOT
override executable behavior or a more specific subtree contract. When a conflict is
found, implementation MUST pause until the relevant contract or this constitution is
amended deliberately.

Amendments require a documented rationale, an impact review of active specifications
and templates, and a semantic version change. MAJOR versions remove or redefine a
governing principle incompatibly; MINOR versions add or materially expand principles;
PATCH versions clarify wording without changing obligations. Every material plan,
code review, and completion report MUST verify applicable constitutional rules.
Exceptions MUST be explicit, time-bounded, owned, and recorded with a remediation
path; convenience alone is not sufficient justification.

**Version**: 1.0.0 | **Ratified**: 2026-08-06 | **Last Amended**: 2026-08-06
