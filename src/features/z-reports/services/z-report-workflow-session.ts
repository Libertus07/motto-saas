type Attempt = {
  id: number
  generation: number
  organizationId: string
}

type Source = {
  generation: number
  organizationId: string
  document: File | null
  reviewed: boolean
}

export function createZReportWorkflowSession() {
  let generation = 0
  let nextAttemptId = 0
  let source: Source | null = null
  let activeAnalysis: Attempt | null = null
  let activeApproval: Attempt | null = null

  const matches = (attempt: Attempt, activeOrganizationId: string | null | undefined) => {
    return (
      activeOrganizationId === attempt.organizationId &&
      source?.generation === attempt.generation &&
      source.organizationId === attempt.organizationId
    )
  }

  const currentAttempt = (
    attempt: Attempt,
    active: Attempt | null,
    activeOrganizationId: string | null | undefined,
  ) => {
    return active?.id === attempt.id && matches(attempt, activeOrganizationId)
  }

  return {
    beginSource(organizationId: string) {
      generation += 1
      source = { generation, organizationId, document: null, reviewed: false }
      activeAnalysis = null
      activeApproval = null
      return generation
    },
    invalidate() {
      generation += 1
      source = null
      activeAnalysis = null
      activeApproval = null
      return generation
    },
    isCurrentSource(sourceGeneration: number, activeOrganizationId: string | null | undefined) {
      return source?.generation === sourceGeneration && source.organizationId === activeOrganizationId
    },
    stage(sourceGeneration: number, document: File | null) {
      if (source?.generation !== sourceGeneration) return false
      source.document = document
      source.reviewed = false
      return true
    },
    beginAnalysis(activeOrganizationId: string | null | undefined): Attempt | null {
      if (!source || source.organizationId !== activeOrganizationId || activeAnalysis) return null
      source.reviewed = false
      const attempt = { id: (nextAttemptId += 1), generation: source.generation, organizationId: source.organizationId }
      activeAnalysis = attempt
      return attempt
    },
    isCurrentAnalysis(attempt: Attempt, activeOrganizationId: string | null | undefined) {
      return currentAttempt(attempt, activeAnalysis, activeOrganizationId)
    },
    markReviewed(attempt: Attempt, activeOrganizationId: string | null | undefined) {
      if (!currentAttempt(attempt, activeAnalysis, activeOrganizationId) || !source) return false
      source.reviewed = true
      return true
    },
    finishAnalysis(attempt: Attempt, activeOrganizationId: string | null | undefined) {
      if (!currentAttempt(attempt, activeAnalysis, activeOrganizationId)) return false
      activeAnalysis = null
      return true
    },
    beginApproval(activeOrganizationId: string | null | undefined): Attempt | null {
      if (!source || source.organizationId !== activeOrganizationId || !source.reviewed || activeApproval) return null
      const attempt = { id: (nextAttemptId += 1), generation: source.generation, organizationId: source.organizationId }
      activeApproval = attempt
      return attempt
    },
    isCurrentApproval(attempt: Attempt, activeOrganizationId: string | null | undefined) {
      return currentAttempt(attempt, activeApproval, activeOrganizationId)
    },
    documentForApproval(attempt: Attempt, activeOrganizationId: string | null | undefined) {
      return currentAttempt(attempt, activeApproval, activeOrganizationId) ? source?.document : undefined
    },
    finishApproval(attempt: Attempt, activeOrganizationId: string | null | undefined) {
      if (!currentAttempt(attempt, activeApproval, activeOrganizationId)) return false
      activeApproval = null
      return true
    },
  }
}
