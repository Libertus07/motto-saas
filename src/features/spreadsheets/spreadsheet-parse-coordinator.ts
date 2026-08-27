import { parseSpreadsheet } from './parse-spreadsheet'
import type { SpreadsheetParseResult } from './spreadsheet-types'

type CoordinatorDependencies = {
  parse?: typeof parseSpreadsheet
}

type CoordinatorResult = {
  organizationId: string
  result: SpreadsheetParseResult
}

export function createSpreadsheetParseCoordinator(dependencies: CoordinatorDependencies = {}): {
  run(file: File, organizationId: string): Promise<CoordinatorResult | null>
  cancel(): void
} {
  const parse = dependencies.parse ?? parseSpreadsheet
  let generation = 0
  let activeController: AbortController | null = null

  const invalidate = () => {
    generation += 1
    activeController?.abort()
    activeController = null
    return generation
  }

  return {
    async run(file, organizationId) {
      const activeGeneration = invalidate()
      const controller = new AbortController()
      activeController = controller

      try {
        const result = await parse(file, { signal: controller.signal })
        if (generation !== activeGeneration || activeController !== controller) {
          return null
        }

        return { organizationId, result }
      } catch (error) {
        if (generation !== activeGeneration || activeController !== controller) {
          return null
        }

        throw error
      } finally {
        if (activeController === controller) {
          activeController = null
        }
      }
    },
    cancel() {
      invalidate()
    },
  }
}
