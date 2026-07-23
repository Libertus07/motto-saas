---
name: auto-sync-state
description: Automatically sync project state to Git and codebase-memory MCP index
---

# Automatic State Syncing

When a significant task, feature, or refactor is completed:
1. Automatically add and commit the changes to Git with a descriptive commit message. Do NOT ask for permission to commit unless the changes are highly experimental. Push to the remote branch if appropriate.
2. If the workspace uses codebase-memory-mcp, automatically run `call_mcp_tool` with `index_repository` to update the codebase index.
3. If the workspace uses graphiti-memory, automatically run `call_mcp_tool` with `add_memory` to persist the high-level architectural decisions, major bug fixes, or task completion summaries.

Do this automatically at the end of the task, and just mention it briefly in your final response to the user. You must NEVER wait for the user to explicitly tell you to "save to github" or "update MCPs". It is your responsibility to keep the state synced.
