import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // This package owns its dependencies and runs in OPS-02 Infrastructure CI.
    // Keep Vitest defaults so dependencies and generated output stay excluded.
    exclude: [...configDefaults.exclude, 'infra/ops02-backup/**', '.worktrees/**'],
  },
})
