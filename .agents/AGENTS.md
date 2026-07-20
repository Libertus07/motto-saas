<RULE[auto_sync_state]>
# Automatic State Syncing
When a significant task, feature, or refactor is completed:
1. Automatically add and commit the changes to Git with a descriptive commit message. Do NOT ask for permission to commit unless the changes are highly experimental. Push to the remote branch if appropriate.
2. If the workspace uses codebase-memory-mcp, automatically run `call_mcp_tool` with `index_repository` to update the codebase index.
3. If the workspace uses graphiti-memory, automatically run `call_mcp_tool` with `add_memory` to persist the high-level architectural decisions, major bug fixes, or task completion summaries.
Do this automatically at the end of the task, and just mention it briefly in your final response to the user. You must NEVER wait for the user to explicitly tell you to "save to github" or "update MCPs". It is your responsibility to keep the state synced.
</RULE[auto_sync_state]>

<RULE[ai_cost_optimization]>
# AI Cost and Token Optimization
When creating or modifying AI integration code (e.g., Gemini API):
1. Always prioritize token efficiency.
2. NEVER embed large database lists (such as all ingredients, suppliers, or users) directly into the AI prompt unless heavily filtered.
3. Use the AI strictly as a text/image parser. Perform data matching (e.g., mapping parsed names to database IDs) in the backend code rather than forcing the AI to do exact matching.
</RULE[ai_cost_optimization]>

<RULE[supabase_atomic_transactions]>
# Database (Supabase) Transaction Policy
When performing complex database operations that span multiple tables (e.g., saving a receipt which affects stock_movements, supplier_transactions, and materials):
1. Do NOT use multiple, sequential API calls from the frontend or backend that could leave data in an inconsistent state if interrupted.
2. ALWAYS create atomic RPC functions (Migration SQL files) in the `supabase/migrations/functions` directory.
3. Call the RPC function once to ensure atomicity, security, and performance.
</RULE[supabase_atomic_transactions]>

<RULE[ui_ux_design]>
# Modern UI/UX and TailwindCSS Guidelines
1. Motto-SaaS is a modern, premium web application. Always use TailwindCSS for styling components.
2. NEVER use inline styles or raw CSS files unless absolutely necessary for complex animations.
3. Prioritize premium aesthetics: use glassmorphism (backdrop-blur), smooth transitions, and professional color palettes (e.g., Indigo, Emerald, Rose).
4. All user-facing texts, success messages, warnings, and error alerts MUST be in Turkish.
</RULE[ui_ux_design]>

<RULE[security_and_auth]>
# Security and Authentication
1. In all Next.js API routes (App Router), ALWAYS authenticate the user using the `requireUser()` helper from `@/lib/supabase-server`. Never skip authentication for internal endpoints.
2. Always validate and sanitize external inputs (e.g., using `isSafeImageUrl()` for incoming URLs) before passing them to external APIs like Google Gemini.
</RULE[security_and_auth]>
