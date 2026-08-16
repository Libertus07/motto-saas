import { describe, expect, it } from 'vitest'

import { createOrganizationSelectionTracker } from './organization-selection'

describe('organization selection tracker', () => {
  it('publishes each real organization transition synchronously with a monotonic version', () => {
    const tracker = createOrganizationSelectionTracker('organization-a')

    expect(tracker.getSnapshot()).toEqual({ organizationId: 'organization-a', version: 0 })
    expect(tracker.publish('organization-b')).toEqual({ organizationId: 'organization-b', version: 1 })
    expect(tracker.getSnapshot()).toEqual({ organizationId: 'organization-b', version: 1 })
    expect(tracker.publish('organization-a')).toEqual({ organizationId: 'organization-a', version: 2 })
  })

  it('does not invalidate requests when the same organization is published again', () => {
    const tracker = createOrganizationSelectionTracker('organization-a')

    tracker.publish('organization-a')

    expect(tracker.getSnapshot()).toEqual({ organizationId: 'organization-a', version: 0 })
  })
})
