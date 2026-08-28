import { describe, expect, it } from 'vitest'

import { createZReportWorkflowSession } from './z-report-workflow-session'

const ORGANIZATION_A = '11111111-1111-4111-8111-111111111111'
const ORGANIZATION_B = '22222222-2222-4222-8222-222222222222'

function document(name: string): File {
  return { name } as File
}

describe('Z-report workflow session', () => {
  it('permits review then one approval with the retained XLSX document', () => {
    const session = createZReportWorkflowSession()
    const generation = session.beginSource(ORGANIZATION_A)
    const xlsx = document('gun-sonu.xlsx')

    expect(session.stage(generation, xlsx)).toBe(true)
    const analysis = session.beginAnalysis(ORGANIZATION_A)
    expect(analysis).not.toBeNull()
    if (!analysis) throw new Error('Expected an analysis attempt')
    expect(session.markReviewed(analysis, ORGANIZATION_A)).toBe(true)
    expect(session.finishAnalysis(analysis, ORGANIZATION_A)).toBe(true)

    const approval = session.beginApproval(ORGANIZATION_A)
    expect(approval).not.toBeNull()
    if (!approval) throw new Error('Expected an approval attempt')
    expect(session.documentForApproval(approval, ORGANIZATION_A)).toBe(xlsx)
  })

  it('keeps CSV analysis-only by supplying null to the approved persistence path', () => {
    const session = createZReportWorkflowSession()
    const generation = session.beginSource(ORGANIZATION_A)

    session.stage(generation, null)
    const analysis = session.beginAnalysis(ORGANIZATION_A)
    if (!analysis) throw new Error('Expected an analysis attempt')
    session.markReviewed(analysis, ORGANIZATION_A)
    session.finishAnalysis(analysis, ORGANIZATION_A)
    const approval = session.beginApproval(ORGANIZATION_A)
    if (!approval) throw new Error('Expected an approval attempt')

    expect(session.documentForApproval(approval, ORGANIZATION_A)).toBeNull()
  })

  it('invalidates pending analysis and approval continuations on reset or organization change', () => {
    const session = createZReportWorkflowSession()
    const generation = session.beginSource(ORGANIZATION_A)
    session.stage(generation, document('gun-sonu.xlsx'))
    const analysis = session.beginAnalysis(ORGANIZATION_A)
    if (!analysis) throw new Error('Expected an analysis attempt')

    session.invalidate()
    expect(session.isCurrentAnalysis(analysis, ORGANIZATION_A)).toBe(false)
    expect(session.markReviewed(analysis, ORGANIZATION_A)).toBe(false)

    const replacementGeneration = session.beginSource(ORGANIZATION_B)
    session.stage(replacementGeneration, document('yeni.xlsx'))
    const replacementAnalysis = session.beginAnalysis(ORGANIZATION_B)
    if (!replacementAnalysis) throw new Error('Expected a replacement analysis attempt')
    session.markReviewed(replacementAnalysis, ORGANIZATION_B)
    session.finishAnalysis(replacementAnalysis, ORGANIZATION_B)
    const approval = session.beginApproval(ORGANIZATION_B)
    if (!approval) throw new Error('Expected an approval attempt')

    session.invalidate()
    expect(session.isCurrentApproval(approval, ORGANIZATION_B)).toBe(false)
    expect(session.finishApproval(approval, ORGANIZATION_B)).toBe(false)
  })

  it('allows only one analysis and one approval attempt for the current source', () => {
    const session = createZReportWorkflowSession()
    const generation = session.beginSource(ORGANIZATION_A)
    session.stage(generation, document('gun-sonu.xlsx'))

    const analysis = session.beginAnalysis(ORGANIZATION_A)
    expect(analysis).not.toBeNull()
    expect(session.beginAnalysis(ORGANIZATION_A)).toBeNull()
    if (!analysis) throw new Error('Expected an analysis attempt')
    session.markReviewed(analysis, ORGANIZATION_A)
    session.finishAnalysis(analysis, ORGANIZATION_A)

    const approval = session.beginApproval(ORGANIZATION_A)
    expect(approval).not.toBeNull()
    expect(session.beginApproval(ORGANIZATION_A)).toBeNull()
  })
})
