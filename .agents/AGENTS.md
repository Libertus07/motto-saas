# Agent System Architecture

This project uses the Agent Skills standard for maintaining agent instructions.
Monolithic rules have been deprecated and extracted into modular skills.

## Custom Skills
All project-specific rules, guidelines, and instructions are now stored in the `.agents/skills/` directory. Each skill follows the standardized `SKILL.md` format.

When working on tasks, the agent should automatically discover and adhere to these skills.

If you need to add a new project rule, create a new folder under `.agents/skills/` with a corresponding `SKILL.md` file rather than adding it here.
