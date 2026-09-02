type SupplierReceiptSourceSelectionDependencies = {
  clear(): void
  cancelSpreadsheetParsing(): void
}

type SupplierReceiptSourceSelection = {
  begin(): number
  currentGeneration(): number
  isCurrent(generation: number): boolean
  stage(generation: number, persistenceFile: File | null): boolean
  markReviewed(generation: number): boolean
  persistReviewed<Result>(generation: number, persist: (persistenceFile: File | null) => Result): Result | undefined
  dispose(): void
}

export function createSupplierReceiptSourceSelection(
  dependencies: SupplierReceiptSourceSelectionDependencies,
): SupplierReceiptSourceSelection {
  let generation = 0
  let stagedGeneration: number | null = null
  let stagedFile: File | null = null
  let reviewedGeneration: number | null = null

  const invalidate = () => {
    generation += 1
    stagedGeneration = null
    stagedFile = null
    reviewedGeneration = null
    dependencies.clear()
    dependencies.cancelSpreadsheetParsing()
    return generation
  }

  return {
    begin() {
      return invalidate()
    },
    currentGeneration() {
      return generation
    },
    isCurrent(value) {
      return value === generation
    },
    stage(value, persistenceFile) {
      if (value !== generation) {
        return false
      }

      stagedGeneration = value
      stagedFile = persistenceFile
      return true
    },
    markReviewed(value) {
      if (value !== generation || stagedGeneration !== value) {
        return false
      }

      reviewedGeneration = value
      return true
    },
    persistReviewed(value, persist) {
      if (value !== generation || stagedGeneration !== value || reviewedGeneration !== value) {
        return undefined
      }

      return persist(stagedFile)
    },
    dispose() {
      generation += 1
      stagedGeneration = null
      stagedFile = null
      reviewedGeneration = null
      dependencies.cancelSpreadsheetParsing()
    },
  }
}
