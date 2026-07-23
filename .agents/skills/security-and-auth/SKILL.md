---
name: security-and-auth
description: Guidelines for server-side authentication and input sanitization
---

# Security and Authentication

1. In all Next.js API routes (App Router), ALWAYS authenticate the user using the `requireUser()` helper from `@/lib/supabase-server`. Never skip authentication for internal endpoints.
2. Always validate and sanitize external inputs (e.g., using `isSafeImageUrl()` for incoming URLs) before passing them to external APIs like Google Gemini.
