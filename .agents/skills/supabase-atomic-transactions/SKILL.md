---
name: supabase-atomic-transactions
description: Enforce atomic RPC transactions for complex database operations
---

# Database (Supabase) Transaction Policy

When performing complex database operations that span multiple tables (e.g., saving a receipt which affects stock_movements, supplier_transactions, and materials):
1. Do NOT use multiple, sequential API calls from the frontend or backend that could leave data in an inconsistent state if interrupted.
2. ALWAYS create atomic RPC functions (Migration SQL files) in the `supabase/migrations/functions` directory.
3. Call the RPC function once to ensure atomicity, security, and performance.
