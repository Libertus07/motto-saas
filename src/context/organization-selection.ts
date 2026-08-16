export interface OrganizationSelectionSnapshot {
  organizationId: string | null
  version: number
}

export function createOrganizationSelectionTracker(initialOrganizationId: string | null = null) {
  let snapshot: OrganizationSelectionSnapshot = {
    organizationId: initialOrganizationId,
    version: 0,
  }

  return {
    getSnapshot: () => snapshot,
    publish(organizationId: string | null) {
      if (snapshot.organizationId !== organizationId) {
        snapshot = {
          organizationId,
          version: snapshot.version + 1,
        }
      }
      return snapshot
    },
  }
}
