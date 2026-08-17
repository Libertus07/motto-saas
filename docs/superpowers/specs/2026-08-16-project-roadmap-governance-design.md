# Motto SaaS Project Roadmap Governance Design

**Date:** 2026-08-16

**Status:** Approved

**Scope:** Project task tracking, delivery-state governance, evidence rules, and the relationship between the central roadmap and detailed engineering documents

## 1. Purpose

This document defines how Motto SaaS tracks completed, active, planned, blocked,
and deferred work without turning a single document into an unmaintainable task
dump. The system must be understandable to the product owner on mobile, useful to
engineering contributors, auditable through Git, and compatible with a future
migration to an external project-management service.

The design has two layers:

1. a compact, authoritative project roadmap that answers what is complete, what
   is active, what comes next, and why; and
2. focused specifications, implementation plans, security runbooks, and evidence
   documents that contain the technical detail for each workstream.

This design governs documentation and task state. It does not change application
behavior, database schema, production infrastructure, or customer data.

## 2. Design Principles

- **One current status source:** `docs/superpowers/ROADMAP.md` is the authoritative
  snapshot of project delivery state.
- **Detail stays close to its purpose:** specifications explain what and why;
  plans explain how; security runbooks explain rollout and recovery.
- **Evidence over checkbox inference:** unchecked historical plan items do not
  prove that work is incomplete, and checked items do not replace current test,
  commit, or production evidence.
- **Local and production states remain distinct:** work that is verified locally
  must never be presented as production-verified.
- **Mobile readability is a requirement:** the roadmap remains short, uses compact
  tables, and links to details instead of embedding them.
- **Git is the audit trail:** the roadmap shows the current truth; Git history
  records when and why that truth changed.
- **Security and data integrity take priority:** tenant isolation, financial
  consistency, data-loss prevention, and recovery work outrank feature delivery.
- **No duplicate task systems:** the repository does not maintain a second
  competing backlog in another Markdown file.

## 3. Two-Layer Information Architecture

### 3.1 Central roadmap

The central roadmap lives at:

```text
docs/superpowers/ROADMAP.md
```

It contains:

- a short status legend;
- the single active priority;
- a compact task table grouped by delivery area;
- the next safe execution order;
- links to the controlling specification, plan, or runbook;
- concise evidence or a link to evidence for completed work; and
- a last-verified date and revision.

Every roadmap entry has these fields:

| Field      | Contract                                                                                |
| ---------- | --------------------------------------------------------------------------------------- |
| ID         | Stable, unique identifier such as `SEC-02` or `PLAT-07`                                 |
| Workstream | Short outcome-oriented name                                                             |
| Status     | One value from the approved status model                                                |
| Outcome    | One sentence describing the result, not implementation activity                         |
| Next gate  | The next decision, dependency, verification, or delivery step                           |
| Detail     | Relative link to the controlling repository document                                    |
| Evidence   | Concise commit, PR, test, rollout, or production-verification reference when applicable |

The central roadmap does not contain step-by-step implementation checklists,
large test logs, command transcripts, or duplicated architecture explanations.

### 3.2 Detailed documents

Detailed documents retain their existing responsibilities:

| Location                  | Responsibility                                                         |
| ------------------------- | ---------------------------------------------------------------------- |
| `docs/superpowers/specs/` | Approved product and architecture decisions: what and why              |
| `docs/superpowers/plans/` | Dependency-ordered implementation steps: how                           |
| `docs/security/`          | Security rollout, recovery, operational gates, and production evidence |

Historical checklists remain useful implementation records but are not the
current project-status source. When historical checkbox state disagrees with
verified code, commits, tests, or production evidence, the roadmap records the
verified state and links to the strongest evidence.

## 4. Stable Task Identity

Task IDs remain stable even when names or implementation details change. IDs are
never reused for a different outcome.

Initial prefixes are:

| Prefix    | Area                                                |
| --------- | --------------------------------------------------- |
| `ROADMAP` | Roadmap and delivery governance                     |
| `SEC`     | Security and authorization                          |
| `DOC`     | Private documents and document lifecycle            |
| `OPS`     | Operations, backup, recovery, and deployment safety |
| `DEP`     | Dependency and supply-chain health                  |
| `DB`      | Database architecture and modeling                  |
| `DESIGN`  | Product design system and design tooling            |
| `PLAT`    | Platform architecture workstreams                   |

Subtasks inside a detailed plan do not automatically receive central roadmap
IDs. A roadmap ID represents an independently valuable, reviewable outcome.

## 5. Status Model

Only the following user-facing status values are allowed:

| Status            | Meaning                                                                                             | Entry rule                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Tamamlandı**    | The required delivery target is verified and no mandatory work remains                              | All applicable completion evidence exists                                   |
| **Yerelde tamam** | Implementation and local verification are complete, but delivery or production verification remains | Local quality gates pass and the remaining delivery gate is explicit        |
| **Devam ediyor**  | This is the current primary task                                                                    | Scope and next gate are known; normally only one entry may have this status |
| **Hazır**         | The task is sufficiently defined and may start                                                      | Dependencies and controlling detail document are available                  |
| **Bekliyor**      | A named prerequisite must finish first                                                              | The prerequisite is listed in `Next gate`                                   |
| **Engelli**       | Progress requires unavailable authority, access, decision, or external state                        | The exact blocker and unblock condition are recorded                        |
| **Ertelendi**     | The work is intentionally postponed                                                                 | The reason and reconsideration trigger are recorded                         |

### 5.1 Completion target

`Tamamlandı` is evaluated against the task's required delivery target:

- a documentation-governance task may complete after review, validation, commit,
  and merge when no production action is relevant;
- an application task may require a merged commit and a successful production
  deployment;
- a database or operational task may additionally require migration parity,
  production verification, recovery evidence, or observation.

The evidence must state which target was required. This prevents a local result
from being mistaken for a production result.

### 5.2 Transition rules

- Only one primary roadmap item is normally `Devam ediyor` at a time.
- An independent urgent security item may temporarily interrupt the primary item;
  the roadmap must show the interruption and the preserved next gate.
- A task moves to `Yerelde tamam` only after all applicable local checks pass.
- A task moves to `Tamamlandı` only after its required delivery target is proven.
- A failed mandatory check returns the task to `Devam ediyor` or `Engelli`.
- An `Engelli` task does not block unrelated safe work.
- An `Ertelendi` task remains visible until completed, cancelled by an explicit
  architecture decision, or superseded by a named replacement task.

## 6. Initial Roadmap Inventory

The first roadmap is initialized from source code, migrations, tests, merged
commits, GitHub checks, and verified production evidence rather than historical
checkbox counts.

### 6.1 Verified foundations

| ID       | Workstream                                  | Initial status | Initial outcome                                                                                                        |
| -------- | ------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `SEC-01` | Organization and tenant security foundation | Tamamlandı     | Active-organization and tenant-isolation foundations are delivered and verified                                        |
| `DOC-01` | Private financial document lifecycle        | Tamamlandı     | Private storage, stable references, authorized preview, and financial write invariants are delivered and verified      |
| `OPS-01` | Production database deployment gate         | Tamamlandı     | Production database changes are bound to explicit environment approval, verified backup evidence, and migration checks |

### 6.2 Immediate governance and hardening queue

| ID           | Workstream                                           | Initial status | Initial next gate                                                                        |
| ------------ | ---------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `ROADMAP-01` | Central roadmap and governance                       | Devam ediyor   | Approve, plan, implement, validate, and commit the repository roadmap                    |
| `SEC-02`     | Review remaining `SECURITY DEFINER` advisor findings | Hazır          | Classify every finding and create focused fixes only where risk is validated             |
| `DEP-01`     | Dependency vulnerability audit                       | Hazır          | Reproduce and classify the current audit findings without automatic forced upgrades      |
| `OPS-02`     | Physical Supabase Storage backup and recovery        | Hazır          | Design and prove object-byte backup, restore, ownership, retention, and recovery testing |

Dependency counts captured during setup are a time-sensitive observation, not a
permanent roadmap fact. `DEP-01` must refresh the audit before classifying work.

### 6.3 Architecture and design tooling

| ID          | Workstream                                | Initial status | Dependency                                                      |
| ----------- | ----------------------------------------- | -------------- | --------------------------------------------------------------- |
| `DB-01`     | DrawDB database architecture foundation   | Bekliyor       | Begin after the immediate hardening gate is controlled          |
| `DESIGN-01` | Pen design foundation and workspace pilot | Bekliyor       | Begin against an approved target domain and navigation contract |

DrawDB documents and validates the target data architecture. Pen defines and
tests the product design foundation. Neither tool becomes a runtime dependency
or replaces migrations, tests, or source code.

### 6.4 Platform architecture program

The approved platform architecture remains decomposed into independently planned
workstreams:

| ID        | Workstream                                     | Initial status |
| --------- | ---------------------------------------------- | -------------- |
| `PLAT-02` | Location foundation                            | Bekliyor       |
| `PLAT-03` | Location-scoped domain migration               | Bekliyor       |
| `PLAT-04` | Scoped roles and authorization                 | Bekliyor       |
| `PLAT-05` | URL-scoped organization and location workspace | Bekliyor       |
| `PLAT-06` | Customer onboarding and three-day trial        | Bekliyor       |
| `PLAT-07` | Subscriptions, entitlements, and quotas        | Bekliyor       |
| `PLAT-08` | Referral Center and Motto Balance              | Bekliyor       |
| `PLAT-09` | Motto SaaS platform management center          | Bekliyor       |
| `PLAT-10` | Enterprise integrations                        | Bekliyor       |

The initial recommended execution order is:

```text
ROADMAP-01
  -> SEC-02 / DEP-01 / OPS-02
  -> DB-01
  -> DESIGN-01
  -> PLAT-02 through PLAT-10 in dependency order
```

Independent hardening tasks may run in the safest efficient order, but platform
schema and product expansion do not bypass unresolved critical security or
recovery risks.

## 7. Evidence and Update Governance

### 7.1 Evidence hierarchy

Roadmap state uses the strongest applicable evidence in this order:

1. executable source, migrations, tests, and checked-in configuration;
2. verified commit and pull-request state;
3. required CI and build results;
4. recorded deployment, migration, production, or recovery verification;
5. approved architecture decisions and runbooks;
6. descriptive or historical checklist state.

Evidence is concise and linkable. Large command output and secrets never enter
the roadmap.

### 7.2 Atomic status updates

When implementation changes a task's status, the corresponding roadmap update
is included in the same cohesive commit whenever practical. If production
verification occurs after merge, a separate evidence-only commit updates the
state from `Yerelde tamam` to `Tamamlandı`.

Every update must preserve:

- stable task identity;
- an accurate next gate;
- a valid controlling-document link;
- explicit local-versus-production wording; and
- any unresolved residual risk.

The roadmap does not contain a manually maintained activity diary. Git history
is the change log; the document contains only the current snapshot and short
completion evidence.

## 8. Failure, Blocker, and Risk Handling

- Mandatory verification failure prevents completion.
- A blocker records both the cause and the exact condition that would unblock
  work.
- Missing authority for a push, merge, deployment, migration, or live-data action
  is a delivery boundary, not permission to infer approval.
- Security, tenant leakage, financial inconsistency, irreversible data loss, and
  failed recovery evidence are stop-ship conditions for affected workstreams.
- External-service outages or unavailable paid capabilities are recorded without
  weakening application controls.
- An obsolete task is not silently deleted. It is marked `Ertelendi` until an
  approved decision names the task that supersedes it.

## 9. Lightweight Automated Validation

The first implementation adds a small repository validation boundary rather
than a project-management application. Validation checks:

- roadmap task IDs are unique;
- every status is one of the approved values;
- every task has a non-empty outcome and next gate;
- every detail link resolves to a checked-in file;
- completed items contain evidence appropriate to their delivery target; and
- the roadmap declares no more than one primary `Devam ediyor` task.

The validator must be deterministic, run offline, and avoid a new production
dependency. It should integrate with the existing repository quality workflow
only after its focused tests prove valid and invalid roadmap fixtures.

The validator does not call GitHub, Supabase, Vercel, or an external task service.
External state is captured as human-reviewed evidence, then validated as required
roadmap structure.

## 10. External Tool Compatibility

Markdown and Git remain the system of record for this phase. A future integration
with Linear, Asana, or another service may mirror roadmap entries, but it must:

- preserve stable task IDs;
- avoid creating two editable status authorities;
- keep repository links and delivery evidence intact;
- support export without vendor lock-in; and
- receive an explicit design and authorization before external writes occur.

The compact field model is intentionally portable, but no external integration
is required to complete `ROADMAP-01`.

## 11. Implementation Boundary

The implementation plan for this design is limited to:

1. creating the central roadmap from verified repository evidence;
2. adding lightweight validation with focused tests;
3. integrating the validator into the appropriate local/CI quality workflow;
4. documenting contributor update rules without duplicating this specification;
5. refreshing architecture indexes affected by the documentation/tooling change;
   and
6. committing the result on the isolated `codex/architecture-roadmap` branch.

The implementation does not begin `SEC-02`, `DEP-01`, `OPS-02`, DrawDB, Pen, or
the platform workstreams. Those remain separately scoped tasks with their own
specification or plan gates where required.

## 12. Verification Strategy

The roadmap implementation requires:

- focused tests for duplicate IDs, invalid statuses, missing fields, broken
  links, missing completion evidence, and multiple active primary tasks;
- a positive test using the real roadmap;
- formatting, lint, type, and test checks appropriate to the chosen validator;
- production build only if application build configuration or runtime code is
  touched;
- `git diff --check` and exact diff review;
- graph and codebase-memory refresh when required by repository policy; and
- confirmation that no unrelated files, secrets, generated drift, live systems,
  or user-owned changes enter the commit.

## 13. Success Criteria

The governance system succeeds when:

- the product owner can understand current status and the next priority from one
  short mobile-readable document;
- contributors can reach the exact technical detail without duplicating it;
- completed, local-only, blocked, and deferred work cannot be confused;
- task state is supported by current evidence rather than stale checkbox counts;
- task IDs and document links are automatically validated;
- security and recovery risks remain visible and correctly prioritized;
- the roadmap stays synchronized with delivery through cohesive Git commits; and
- a future external task tool can be added without replacing repository history
  or creating two editable sources of truth.
