# Agent Skill Authoring Rules

These instructions apply only while changing files under `.agents/`. Read
`README.md` before adding or modifying a project skill.

- Keep durable repository and subtree constraints in the nearest applicable
  `AGENTS.md`; do not duplicate them in skills.
- Create a skill only for a specialized, reusable workflow with a clear trigger.
- Keep skill frontmatter, paths, examples, verification, and failure behavior
  current with the repository.
- Do not include credentials, tenant data, machine-specific paths, or rules that
  contradict the root engineering contract.
