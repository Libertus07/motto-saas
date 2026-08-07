# Motto SaaS Platform Architecture Design

**Date:** 2026-08-07

**Status:** Approved in collaborative design review; awaiting written-spec review

**Scope:** Customer tenancy, branches, authorization, onboarding, branding, platform administration, integrations, subscriptions, trials, and referrals

## 1. Purpose

This document defines the target product and security architecture for Motto SaaS as a professional multi-tenant restaurant and cafe management platform. It turns the existing organization-based isolation model into a customer-account and branch model without discarding the security work already completed.

The design prioritizes:

- strict separation between customers;
- practical multi-branch operation;
- understandable roles and permissions;
- a simple, transparent commercial model;
- mobile-first onboarding and daily use;
- controlled AI and infrastructure costs;
- honest trial and referral rules;
- a migration path that preserves existing customer data.

This is an architecture design, not an implementation plan. Each delivery workstream listed later must receive a focused implementation plan and risk-appropriate tests before code or schema changes are made.

## 2. Current-State Assessment

The existing system already has a sound tenant-isolation foundation:

- `organizations` separates customer data;
- `organization_members` associates users with organizations;
- membership status distinguishes active and inactive access;
- roles include owner, admin, manager, accountant, and staff;
- a user can belong to more than one organization;
- an active organization is persisted as a user preference;
- business records are increasingly protected with organization-scoped RLS and RPC checks.

The main modeling limitation is that `organization` currently carries three meanings at once: customer account, business, and sometimes branch. This works for a single-location customer but does not adequately support central management, consolidated reporting, or branch-scoped permissions for a growing chain.

The target model retains `organization` as the security tenant and commercial customer account, then adds an explicit branch/location layer.

## 3. Terminology and Hierarchy

```text
Motto SaaS platform
└── Organization (customer account / commercial tenant)
    ├── Subscription and entitlements
    ├── Organization members
    ├── Shared catalogs and definitions
    └── Locations (branches, stores, or operational sites)
        ├── Location-scoped users and roles
        ├── Inventory and movements
        ├── Sales and Z reports
        ├── Cash and operational finance
        └── Location-owned documents
```

### Organization

An organization represents the customer that buys and owns the Motto SaaS subscription. It is the primary security and billing tenant. Customer data must never cross an organization boundary.

### Location

A location represents a restaurant, cafe, warehouse, branch, or sales point operated by the organization. Operational records belong to a concrete location unless the domain explicitly defines an organization-wide record.

### User

A user is a human identity. One user may belong to multiple organizations and may have different assignments in each one. User identity is not itself an authorization grant.

### Membership and assignment

Organization membership establishes that a user belongs to the customer account. Role assignments define what the user can do and whether that grant applies organization-wide or only to selected locations.

### Platform operator

A platform operator is a Motto SaaS internal administrator. Platform operators are not customer members and must not be inserted into `organization_members` to obtain support access.

## 4. Authorization Model

Authorization uses scoped role-based access control. A role assignment conceptually contains:

```text
User + Role + Organization + Optional Location
```

- A null location means that the role is organization-wide.
- A concrete location means that the role applies only to that location.
- A user may hold multiple compatible assignments.
- Effective permissions are the union of valid assignments, subject to explicit platform safety restrictions.

### Built-in role templates

| Role             | Default scope and responsibility                                                 |
| ---------------- | -------------------------------------------------------------------------------- |
| Owner            | Subscription, ownership, all locations, users, roles, and customer data          |
| Admin            | Broad organization administration except protected ownership and billing actions |
| Accountant       | Finance, expenses, investments, exports, and reports in the assigned scope       |
| Location manager | Operational management for assigned locations                                    |
| Staff            | Permitted daily operations in assigned locations                                 |
| Viewer           | Read-only access to explicitly permitted modules and locations                   |

Owners can create custom roles from templates. Permissions are expressed as understandable actions such as view, create, update, delete, approve, and export for each module. Custom per-user exceptions are supported only when a role cannot reasonably express the requirement.

### Ownership safeguards

- At least one owner must always remain.
- Assigning a new owner is a separate ownership-transfer operation.
- Ownership transfer requires recent authentication and should support stronger verification.
- Admins cannot change or remove owners.
- Users cannot grant themselves permissions.
- Every membership, role, permission, and location-assignment change is audited.

### Membership lifecycle

Membership states are `invited`, `active`, `suspended`, and `removed`. Suspended and removed users immediately lose authorization even if an older browser session remains open.

### Enforcement

Permission checks are enforced in the server and database. Hiding a button is only a user-experience behavior and is never an authorization boundary. Browser-supplied organization, location, role, or permission values are treated as untrusted input.

## 5. Data Ownership and Scope

The model separates shared definitions from location-specific operations.

| Domain                                          | Target scope                                        |
| ----------------------------------------------- | --------------------------------------------------- |
| Subscription, organization settings             | Organization                                        |
| Users, role definitions, permission assignments | Organization                                        |
| Locations                                       | Organization                                        |
| Product and category catalog                    | Organization definition                             |
| Recipe templates                                | Organization definition                             |
| Material catalog and units                      | Organization definition                             |
| Product availability and sale price             | Location override                                   |
| Inventory quantities and stock movements        | Location                                            |
| Sales and Z reports                             | Location                                            |
| Cash registers                                  | Location                                            |
| Bank accounts                                   | Organization or explicitly assigned locations       |
| Supplier directory                              | Organization definition                             |
| Supplier transactions and balances              | Location, with consolidated organization reporting  |
| Expenses                                        | Location or explicit central-office scope           |
| Investments                                     | Organization, optionally attributed to a location   |
| Documents                                       | Inherit the scope of their parent business record   |
| Audit history                                   | Organization, with location context when applicable |

Every operational record carries both `organization_id` and a valid `location_id`. Organization-wide records are modeled explicitly; a missing location must not accidentally turn an operational record into a global record.

Shared products, recipes, and materials can be published from the organization to selected locations. Locations can override only the fields the product permits, such as availability and sale price. Inventory quantities and local acquisition costs remain location-specific.

## 6. Customer Onboarding

The customer journey is:

1. Create and verify a user account.
2. Start the three-day trial.
3. Create the organization.
4. Create the first location.
5. Configure local settings, accounts, products, materials, and opening balances.
6. Invite team members and assign roles and locations.
7. Complete a readiness checklist.
8. Start the paid subscription without recreating data.

The organization, initial location, profile, and owner membership are provisioned atomically and idempotently. A failure must not leave a partially usable customer account.

The onboarding wizard is mobile-friendly, saves progress, and offers three data-start modes:

- start with an empty business;
- import supported data;
- use removable example data.

Example data is visibly marked, isolated from real financial reporting, and removable in one deliberate operation.

An invited user joins the existing organization rather than accidentally creating a second customer account.

## 7. Branding

Motto SaaS uses a co-branded model.

### Motto SaaS branding

Motto branding is primary on the marketing site, general sign-up and sign-in, password and security screens, subscription management, platform notices, and the default PWA/application icon.

### Customer branding

The organization name and logo are primary inside the customer workspace, on reports, exported documents, invitations, and customer-facing business materials. A subtle “Powered by Motto SaaS” treatment may remain where appropriate.

### Login behavior

- A generic Motto URL uses Motto branding.
- An organization-specific slug uses the organization logo and name with Motto trust branding.
- A custom domain is a later enterprise capability and never hides security-critical domain information.

Organization branding is the default for all locations. A location may have an optional display override. A separate brand entity is deferred until real multi-brand demand exists; the hierarchy allows it to be inserted between organization and location later.

## 8. Workspace Navigation and Active Context

The organization and location context appears in the URL:

```text
/app/{organizationSlug}/{locationSlug}/dashboard
/app/{organizationSlug}/{locationSlug}/stok
/app/{organizationSlug}/{locationSlug}/satislar
/app/{organizationSlug}/genel-bakis
```

This makes deep links and simultaneous tabs predictable. A persisted active organization or location is only a convenience preference, never the authorization source.

Users with a single organization and location enter directly. Users with more access can switch from an always-visible, mobile-accessible control.

Authorized owners and managers can use an all-locations overview for consolidated reports and comparisons. A concrete location is mandatory for operational mutations; records cannot be created from an ambiguous “all locations” context.

Changing context while a form contains unsaved work requires a clear confirmation flow. Losing access redirects the user to a safe authorized context without waiting for a full sign-out.

## 9. Security and Reliability Invariants

Each protected operation validates:

1. authenticated user identity;
2. active organization membership;
3. valid location assignment when location-scoped;
4. module and action permission;
5. subscription entitlement and quota;
6. input contract;
7. atomic business invariants.

Financial and inventory workflows are atomic and idempotent. Retrying a request must not create a duplicate transaction. Corrections prefer cancellation or compensating entries over destructive deletion.

Organizations and locations are archived before any irreversible lifecycle action. Historical financial records remain attributable and reportable.

User-facing failures use clear Turkish language and never reveal raw database or provider errors. Technical failures go to observability; user and administrative actions go to the audit trail.

Private documents inherit organization and location access from their parent record. Financial-document buckets are private, new objects use organization-scoped paths, stable storage references are persisted, and time-limited signed URLs are generated only after authorization. Legacy document references receive a migration-safe organization mapping. Public login-branding assets remain separate.

## 10. Subscription and Entitlement Model

Permissions and subscription entitlements are separate:

- permissions define what a user may do;
- entitlements define what the customer has purchased;
- quotas define how much of a variable-cost capability the organization may use.

Subscription states include trial, active, payment-past-due, restricted/read-only, cancelled, and archived. Payment problems do not silently delete customer data.

### Public pricing

The primary offer is intentionally simple:

#### Motto İşletme

- ₺990 per month plus applicable tax;
- ₺9,900 per year, equivalent to two months free;
- one location;
- all standard product modules;
- unlimited human staff users, with no per-seat fee;
- 300 included AI operations per month;
- standard secure document storage;
- updates and standard support.

#### Additional location

- ₺490 per month;
- separate operational data;
- central catalog and consolidated reporting;
- 200 additional included AI operations;
- additional document capacity.

#### Enterprise

Enterprise pricing is quoted for large chains, custom integrations, SSO, custom domains, BYOK, migrations, enhanced support, and negotiated service requirements.

No essential module is sold as a surprise add-on. Optional charges are limited to genuinely variable or labor-intensive services: additional AI usage, assisted data migration/training, and customer-specific integrations.

Human staff accounts are not metered. Automated users, bots, and service accounts are not treated as staff seats and require an approved integration contract. An “AI operation” is a published, customer-visible unit tied to a concrete feature. Its definition and consumption appear in the usage screen and do not change retroactively during a billing period.

### Commercial safeguards

- There is no permanent free plan.
- AI is never marketed as economically unlimited.
- Usage warnings occur before a customer incurs an optional charge.
- Monthly customers can cancel without a hidden long-term commitment.
- Annual pricing is locked for its paid term.
- Early-customer discounts are time-limited, non-stacking launch campaigns rather than lifetime price promises.
- A seasonal read-only retention plan may be offered at ₺149 per month.
- Real unit economics are reviewed before prices are treated as permanent.

The public message is: “Tek fiyat. Tüm özellikler. Gizli modül ücreti yok. İşletmeniz büyüdüğünde yalnızca yeni şubeniz için ödeme yapın.”

## 11. Three-Day Trial

The trial lasts exactly 72 hours and requires no payment card. It begins only when the user explicitly starts it, not merely when an email address is registered.

The trial permits one organization and one location, normal core modules, and a controlled AI allowance. Automatic charging is prohibited.

The interface displays the exact start time, end time, and remaining duration. Notifications are limited to trial start, 24 hours remaining, trial end, and the final data-retention warning.

After expiry:

- the workspace becomes read-only;
- customer data remains visible and exportable;
- data is retained for 30 days;
- the exact deletion date is visible;
- subscribing restores the same workspace;
- deletion warnings are sent before retention expires.

A business cannot obtain repeated trials through alternate email addresses. Identity and payment signals may contribute to review, but shared IP addresses are never sufficient evidence by themselves.

## 12. Referral and Motto Balance

The customer-facing promise is:

> Yeni işletme ilk üç başarılı ücretli ayında %20 indirim kazanır. Tavsiye eden müşteri tamamlanan her ay için ₺198, toplam ₺594 Motto Bakiyesi kazanır.

### Referred customer

At the current base price, the referred customer pays ₺792 for each of the first three paid monthly periods. The free trial does not consume a discounted period. An annual customer receives an equivalent ₺594 first-term discount, not 20% off the entire year.

### Referrer

The referrer earns ₺198 only after each corresponding referred-customer payment succeeds and remains undisputed for a transparent 30-calendar-day pending period. A customer who completes only one paid month creates only one ₺198 reward. For an annually billed referred customer, the three ₺198 rewards become available after 30, 60, and 90 days while the subscription remains active and the annual payment has not been refunded or disputed.

Motto Balance is promotional service credit denominated in Turkish lira for clarity. It is not withdrawable cash and cannot be transferred. It can be applied to subscription invoices, additional locations, AI packs, and eligible Motto training/support services.

### Transparency

The Referral Center displays:

- the unique share link;
- plain-language program rules;
- invited, trial, payment-pending, reward-pending, available, ineligible, and cancelled states;
- an explanation for every ineligible or cancelled state;
- available, pending, earned, spent, and expiring balances;
- every balance transaction and invoice application;
- exact expiry dates and advance expiry reminders;
- a support-review path for disputed eligibility decisions.

Earned balance is valid for 12 months. Terms changes apply prospectively and never remove a valid earned reward.

### Abuse prevention

- Only genuinely new paid customer organizations qualify.
- Self-referrals and duplicate businesses do not qualify.
- Matching tax, ownership, and payment identity signals trigger deterministic checks or review.
- IP similarity alone never rejects a referral.
- Rewards are not granted upfront.
- Refunds and payment disputes prevent pending rewards from becoming available.
- Acquisition campaigns do not stack; the customer sees and receives the applicable better offer.
- All referral and balance transitions are auditable.

The initial program is a capped pilot. Management tracks conversion, 30/90-day retention, direct cost, reward liability, redemption, fraud review, and payback before expanding it.

## 13. AI and Integration Credentials

The default model is platform-managed AI:

- Motto owns provider accounts and server-side keys;
- customers never receive infrastructure secrets;
- usage is metered per organization and feature;
- plan quotas, budgets, and rate limits are enforced server-side;
- keys never enter browser bundles or public environment variables.

Enterprise BYOK is optional later. Customer-provided secrets are stored in an encrypted secret-management system, shown only in masked form, validated, rotatable, revocable, and used only by trusted server-side code.

Integration classes are separated:

- platform secrets: database, signing, email, monitoring, billing, and Motto AI credentials;
- customer OAuth connections: supported accounting, productivity, or delivery providers;
- customer credentials: only where a provider lacks a safer delegated connection.

The customer sees its own usage and quota. Platform operators see aggregate cost and health without exposing customer content unnecessarily.

## 14. Motto SaaS Platform Management Center

Motto internal administration lives in a separate control plane such as `admin.mottosaas.com`. It is not a hidden customer organization.

Platform roles include platform owner, system administrator, support specialist, billing specialist, security/auditor, and read-only operations.

The management center supports:

- customer, subscription, location, and user counts;
- trial, active, past-due, restricted, cancelled, and archived lifecycle views;
- plan, entitlement, quota, AI, storage, and infrastructure usage;
- billing and referral-balance operations;
- product and integration health;
- support requests and security events;
- controlled feature rollout;
- export, archive, and retention workflows.

Platform staff do not receive blanket access to customer financial data. Support access is just-in-time, reason-bound, time-limited, visibly indicated, and audited. Sensitive exports, ownership changes, and destructive lifecycle operations require recent authentication and may require a second approval.

No normal support workflow depends on direct production-database editing.

## 15. Verification Strategy

The implementation program requires automated coverage for:

- role and permission matrices;
- cross-organization denial;
- cross-location denial;
- owner, admin, accountant, manager, staff, and viewer scenarios;
- suspended and removed memberships;
- ownership-transfer and last-owner safeguards;
- entitlement and quota enforcement;
- atomic financial and inventory operations;
- idempotent retries;
- private-document and signed-URL access;
- onboarding resumption and duplicate prevention;
- three-day trial transitions and retention;
- referral qualification, pending rewards, refunds, expiry, and ledger integrity;
- platform-support access and auditing;
- responsive onboarding, context switching, and permission changes on mobile.

Database tests include positive, negative, and cross-tenant/location cases. End-to-end tests cover URL-scoped context, multiple browser tabs, role changes during a session, and read-only lifecycle states.

## 16. Delivery Decomposition

This architecture is intentionally decomposed into bounded workstreams:

1. **Immediate document security:** make financial buckets private, add stable storage references, organization-safe legacy mapping, and signed previews. This can ship against the existing organization boundary and later inherit location scope.
2. **Location foundation:** add locations, default-location backfill, context contracts, and organization-safe migration helpers.
3. **Location-scoped domain migration:** migrate operational tables and RPCs in audited batches.
4. **Scoped authorization:** introduce role definitions, permissions, assignments, owner safeguards, and management UI.
5. **URL-scoped workspace:** update routing, switching, deep links, and consolidated views.
6. **Onboarding and trial:** implement atomic provisioning, setup progress, trial lifecycle, read-only state, and retention.
7. **Subscriptions and entitlements:** implement the single-plan commercial model, quotas, additional locations, and lifecycle automation.
8. **Referral and Motto Balance:** add qualified referrals, an immutable credit ledger, invoice application, transparency UI, and abuse controls.
9. **Platform management center:** add isolated operator identity, customer lifecycle management, health, support access, and audits.
10. **Enterprise integrations:** add BYOK, custom domains, SSO, and negotiated integrations only when customer demand justifies them.

Each workstream uses additive migrations, backward-compatible application releases, feature flags where needed, explicit rollback behavior, and independent verification. Existing organization data receives a default location before any location field becomes mandatory. No large-bang tenant migration is permitted.

## 17. Success Criteria

The architecture succeeds when:

- two customers cannot access each other under any supported path;
- users see and mutate only authorized locations and modules;
- owners can safely manage roles, permissions, and location assignments;
- single-location customers experience no unnecessary complexity;
- multi-location customers receive centralized definitions and consolidated reporting;
- commercial terms are understandable before purchase;
- trials and referrals show exact rules, states, and monetary effects;
- AI and infrastructure costs are measurable and bounded;
- platform support does not require permanent customer-data access;
- existing data migrates without loss or ambiguous ownership;
- all critical transitions are testable and auditable.

## 18. External Reference Snapshot

The commercial design was compared on 2026-08-07 against public pricing and billing references, including:

- Adisyo pricing: <https://adisyo.com/adisyon-programi-pos-sistemi-fiyatlari>
- MasaLine pricing: <https://adisyonsistemi.com/site/paketler-fiyatlar/>
- adisyon.ai pricing: <https://adisyon.ai/>
- Stripe recurring pricing models: <https://docs.stripe.com/products-prices/pricing-models>
- Stripe subscription discounts: <https://docs.stripe.com/billing/subscriptions/coupons>
- Supabase pricing: <https://supabase.com/pricing>
- Vercel pricing: <https://vercel.com/pricing>
- Gemini API pricing: <https://ai.google.dev/gemini-api/docs/pricing>

Pricing is a launch hypothesis, not an immutable promise. It must be validated with pilot conversion, retention, support effort, infrastructure usage, AI cost, payment cost, and referral-redemption data.
