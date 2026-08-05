# Project Agent Skills

This directory contains task-specific workflows that complement the durable
repository rules in the root and nested `AGENTS.md` files.

## Responsibility Split

- `AGENTS.md` files define stable engineering constraints for a repository
  subtree: architecture boundaries, security invariants, verification, and
  completion criteria.
- `.agents/skills/<skill>/SKILL.md` files define detailed, reusable workflows
  that apply only when their task or trigger is relevant.
- CI configuration and executable tests enforce mechanical rules. Do not turn
  `AGENTS.md` into a second linter configuration.

Agents must read and follow the smallest set of relevant skills. A skill does not
override a closer `AGENTS.md` instruction unless a higher-priority user or system
instruction explicitly says otherwise.

## Adding or Updating a Skill

Create a new skill only when the guidance is specialized, reusable across
multiple tasks, and too detailed for the applicable `AGENTS.md`. Otherwise,
update the nearest `AGENTS.md`, project documentation, tests, or tooling.

Each skill must:

- live in a descriptively named directory under `.agents/skills/`;
- provide a complete `SKILL.md` with valid frontmatter (`name` and
  `description`);
- define precise trigger conditions, required steps, verification, and safe
  failure behavior;
- link to focused references instead of embedding unrelated material;
- avoid duplicating or contradicting repository-wide rules;
- use current project paths and commands; and
- be reviewed when the architecture or toolchain changes.

Keep examples secure and free of real credentials, tenant data, and local-only
paths. Prefer project-relative paths so skills work across machines and CI.
