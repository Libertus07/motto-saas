# drawDB and pen.dev Design Workflow

**Date:** 2026-08-10

**Status:** Approved for implementation planning

**Scope:** Database architecture visualization, design-system governance, and the first organization/location workspace design pilot

## 1. Purpose

This document defines how Motto SaaS will adopt drawDB and pen.dev without making either tool a production runtime dependency or a competing source of truth.

The workflow supports the approved [Motto SaaS Platform Architecture Design](./2026-08-07-motto-saas-platform-architecture-design.md). It must be established after the current private-financial-document delivery is closed and before the location foundation and other UI-heavy platform workstreams begin.

The design prioritizes:

- accurate current-state and target-state database diagrams;
- a single design-token source shared by code and design artifacts;
- mobile-first and accessible workspace design;
- deterministic, reviewable Git artifacts;
- local handling of commercially sensitive architecture;
- clean tool removal without production impact;
- human review before generated SQL or UI code can influence the application.

## 2. Decision and Sequence

The selected approach is a foundation-first hybrid.

```text
Close private financial document delivery
                    ↓
Build current and target drawDB architecture
                    ↓
Plan the location foundation migration
                    ↓
Build the Motto Design Foundation in pen.dev
                    ↓
Design the organization/location workspace pilot
                    ↓
Implement approved platform workstreams incrementally
```

drawDB and pen.dev support the platform architecture; they do not replace it. The platform design remains the product and security authority. Executable code, migrations, tests, and checked-in configuration remain the implementation authority.

## 3. Alternatives Considered

### Foundation-first hybrid — selected

Extract the current database and UI foundations first, then validate the tools through the real organization/location workspace pilot. This produces durable conventions before broad adoption while still testing the workflow against a concrete feature.

### Feature-first

Design the organization/location workspace immediately. This would produce a visible result faster but could create a second token system and require later redesign.

### Big-bang import

Import the complete database and application into the tools at once. This would create excessive review scope, make current and proposed states ambiguous, and increase the risk of generated changes escaping proper validation.

## 4. drawDB Architecture

drawDB is a local architecture and documentation tool. It is not deployed with Motto SaaS and is not imported by application code.

### Repository artifacts

```text
docs/architecture/database/
├── README.md
├── current/
│   ├── overview.drawdb.json
│   └── overview.png
├── target/
│   ├── platform-overview.drawdb.json
│   ├── tenancy-and-locations.drawdb.json
│   ├── authorization.drawdb.json
│   ├── inventory-and-products.drawdb.json
│   ├── finance-and-documents.drawdb.json
│   └── diagrams/
└── migration/
    └── current-to-location-foundation.md
```

The exact drawDB export extension will be verified against the pinned tool version during implementation. If the tool emits a different stable native format, the verified native extension replaces the provisional `.drawdb.json` name everywhere in one mechanical change.

### Diagram model

The architecture pack contains:

1. a compact executive overview;
2. the current organization-based schema;
3. the target organization/location hierarchy;
4. scoped authorization and ownership;
5. product, recipe, material, and inventory relationships;
6. finance, supplier, investment, document, and audit relationships;
7. a current-to-target migration and impact map.

Large diagrams are divided by bounded domain. Cross-domain relationships are repeated only as labeled external references so each diagram remains readable.

### Source of truth

Current-state diagrams are derived from checked-in migrations and a clean local PostgreSQL replay. Target-state diagrams are derived from the approved platform architecture and are labeled `PROPOSED` until implemented.

drawDB-generated SQL is never applied directly. All schema changes require a reviewed Supabase forward migration, pgTAP coverage, advisor checks, and the repository quality gates.

### Security and privacy

- drawDB runs locally or in a reviewed self-hosted environment.
- No live row data, customer identifiers, emails, document references, credentials, or secrets enter a diagram.
- Supabase-managed `auth` and `storage` internals are represented only at the boundary needed to explain application ownership and access.
- Hosted collaboration is not used for sensitive schema artifacts without a separate security and commercial review.
- Every generated schema snapshot is inspected for ownership statements, environment-specific URLs, credentials, and unintended managed-schema detail before it is committed.

### Drift control

Each diagram records its status, source commit, schema migration head, generation date, and owning workstream. A deterministic manifest compares the tables and relationships represented in the current-state diagram against the clean local schema. Drift fails documentation verification but never rewrites a migration automatically.

## 5. Motto Design Foundation and pen.dev

pen.dev is a design, review, and design-to-code assistant. It is not a runtime dependency and generated output never bypasses the existing feature architecture or quality gates.

### Repository artifacts

```text
design/
├── README.md
├── motto-foundation.pen
├── workspace-pilot.pen
├── tokens/
│   ├── colors.json
│   ├── typography.json
│   ├── spacing.json
│   └── components.json
└── exports/
    ├── desktop/
    └── mobile/
```

Only reviewed, purposeful exports are committed. Temporary renders, caches, authentication state, and tool-specific local settings are ignored.

### Token authority

The initial source is the working application: `src/app/globals.css`, Tailwind theme values, shadcn primitives, and established shared components. The implementation plan will define a deterministic extraction contract so the design token files can be regenerated and compared without silently changing application behavior.

The authority order is:

```text
Approved working code and CSS tokens
                 ↓
       Generated token contract
                 ↓
       Motto Design Foundation
                 ↓
      Approved screen designs
                 ↓
 Reviewed application implementation
```

pen.dev must not invent a parallel palette, spacing scale, typography system, radius system, icon convention, or component state model. Proposed token changes are reviewed first as design-system changes and then implemented explicitly in code.

### Foundation coverage

The foundation defines:

- semantic colors and contrast pairs;
- typography and numeric-data presentation;
- spacing, sizing, radius, elevation, and motion;
- buttons, inputs, selectors, tabs, cards, tables, dialogs, notifications, and navigation;
- loading, empty, error, disabled, read-only, permission-denied, and destructive-confirmation states;
- keyboard focus, screen-reader labels, reduced motion, and minimum touch targets;
- narrow mobile, tablet where necessary, and desktop layout rules.

### First pilot

The first pen.dev pilot is the organization/location selector and URL-scoped workspace shell. It covers:

- direct entry for a user with one organization and one location;
- switching among authorized organizations and locations;
- an all-locations overview that cannot perform ambiguous operational mutations;
- URL-scoped deep links and simultaneous browser tabs;
- unsaved-form confirmation during context changes;
- access loss and safe redirection;
- loading, empty, error, read-only, and permission-denied states;
- mobile navigation, safe areas, keyboard interaction, and accessible focus behavior.

The pilot does not implement the underlying location schema or authorization model. It validates the design system and produces an approved UI contract for the later location and workspace plans.

### AI and data boundaries

- Only synthetic business and financial examples are used.
- Source code, prompts, screenshots, and `.pen` files contain no secrets or real customer content.
- Tool-produced React, CSS, and Tailwind output is treated as a prototype.
- Generated code is adapted to `src/features/`, shared primitives, Turkish product copy, tenant/location boundaries, and the established notification system.
- Codex, IDE, or MCP configuration changes require a backup and an exact diff review. Automatic or duplicate configuration rewrites are rejected.

## 6. End-to-End Workflow

```text
Architecture or product requirement
                 ↓
drawDB or pen.dev proposal
                 ↓
Human design approval
                 ↓
Focused implementation plan and risk analysis
                 ↓
Test-first code or forward migration
                 ↓
Mobile, desktop, security, and accessibility verification
                 ↓
Independent review
                 ↓
Cohesive commit, pull request, and controlled delivery
```

No diagram edit creates an automatic database migration. No design edit creates an automatic production commit.

## 7. Quality Gates

### drawDB

- Compare represented tables, primary keys, foreign keys, organization scope, and location scope against the schema manifest.
- Label current, transitional, and proposed structures explicitly.
- Flag missing ownership, ambiguous nullable location scope, cross-tenant relationships, and unsupported deletion behavior.
- Review exported SQL only as a proposal; never execute it as delivery evidence.

### pen.dev

- Compare design variables against the generated token contract.
- Verify desktop and narrow mobile layouts and use tablet variants only where behavior changes materially.
- Cover loading, error, empty, read-only, permission, and destructive states.
- Check contrast, keyboard navigation, visible focus, semantic labels, reduced motion, and 44-pixel minimum touch targets.
- Require focused tests, format, lint, TypeScript, the full application test suite, production build, and proportional browser verification before generated concepts reach production.

## 8. Failure and Recovery

- If drawDB is unavailable, migrations and tests continue to define the schema. Diagrams can be regenerated later.
- If a diagram drifts, regenerate the diagram; never rewrite migration history to match it.
- If pen.dev is unavailable or a `.pen` file becomes unusable, the working code and token contract remain sufficient to continue development.
- If generated code fails project conventions, discard it without modifying the approved design artifact.
- Pin tool versions in the development workflow and upgrade them through an isolated compatibility check.
- Tool authentication and local caches are never committed.
- Removing either tool must not change application builds, tests, runtime behavior, or deployment.

## 9. Delivery Phases

### Phase 0 — Close current document-security delivery

Push the reviewed branch, complete CI and pull-request review, apply the three post-enforcement hardening migrations through the approved backup/dry-run/live sequence, and finish the user-owned real-device matrix.

### Phase 1 — drawDB foundation

Establish the pinned local workflow, generate a data-free schema artifact, create the current and target diagram pack, and document the migration impact map.

### Phase 2 — Motto Design Foundation

Extract and validate the current tokens, create the foundation file, define component states and responsive/accessibility rules, and document the one-way synchronization safeguards.

### Phase 3 — Workspace pilot

Design and review the organization/location workspace pilot. After approval, create separate location-foundation and URL-workspace implementation plans.

## 10. Verification Strategy

Implementation planning must include:

- deterministic schema extraction tests;
- diagram manifest and drift tests;
- secret and live-data scans for generated artifacts;
- token extraction and design-variable drift tests;
- responsive and accessibility review matrices;
- tool-removal verification proving the application remains buildable;
- license, version, and update-policy checks;
- a pilot retrospective before either workflow expands to other modules.

## 11. Success Criteria

The workflow succeeds when:

- current diagrams match the clean local migration replay;
- proposed location structures cannot be confused with deployed schema;
- tenant and location ownership are visible and unambiguous;
- one token authority governs code and design;
- the workspace pilot covers desktop, mobile, accessibility, and permission states;
- generated SQL and UI code cannot bypass review and test gates;
- no real customer content or secret enters design artifacts;
- tool removal has zero production impact;
- the diagram and design workflows measurably reduce ambiguity before location implementation begins.

## 12. External Tool Snapshot

The decision was validated against the official tool sources available on 2026-08-10:

- drawDB repository and AGPL-3.0 license: <https://github.com/drawdb-io/drawdb>
- drawDB product and self-hosting overview: <https://www.drawdb.app/>
- pen.dev product overview: <https://www.pen.dev/>
- pen.dev design-to-code workflow: <https://docs.pen.dev/design-and-code/design-to-code>
- pen.dev MCP and Codex integration notes: <https://docs.pen.dev/getting-started/ai-integration>
- pen.dev pricing: <https://www.pen.dev/pricing>
- pen.dev privacy policy: <https://www.pen.dev/privacy-policy>
- pen.dev EULA: <https://www.pen.dev/eula>

The implementation plan must recheck tool versions, distribution terms, supported native file formats, and known configuration issues because these external products can change independently of Motto SaaS.
