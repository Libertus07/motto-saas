import { describe, expect, it } from 'vitest'
import { runBackup, isComplete } from './run.mjs'
import { fixtureConfig, createSource, createTarget, createJournal } from './fixtures.mjs'

function setup() {
  const objects = ['z.pdf', 'a.pdf'].map((path) => ({ bucket: 'documents', path, sizeBytes: 3, revision: 'v1' }))
  return {
    config: fixtureConfig(),
    source: createSource(objects),
    target: createTarget(),
    journal: createJournal(),
    identityKey: Buffer.alloc(32, 7),
    signingKey: Buffer.alloc(32, 8),
    clock: () => '2026-10-12T00:02:00.000Z',
    sleep: async () => {},
    random: () => 0.5,
  }
}

describe('synthetic backup completion', () => {
  it.each(['reference', 'addition'])('never adopts a changed %s baseline on serialized restart', async (change) => {
    const d = setup()
    const original = d.source.inventory
    let calls = 0
    d.source.inventory = async () => {
      const snapshot = await original()
      if (++calls >= 2) {
        if (change === 'reference') snapshot.referenceDigest = 'f'.repeat(64)
        else snapshot.objects.push({ ...snapshot.objects[0], path: 'new.pdf' })
      }
      return snapshot
    }
    expect((await runBackup(d)).status).toBe('INCOMPLETE')
    const commits = d.target.metrics.commits
    const restarted = { ...d, journal: createJournal(d.journal.serialize()) }
    expect((await runBackup(restarted)).status).toBe('INCOMPLETE')
    expect(d.target.metrics.commits).toBe(commits)
    expect(d.target.metrics.publications).toBe(0)
  })
  it('requires a new set after observed inconsistency even if the source returns to its original state', async () => {
    const d = setup()
    const original = d.source.inventory
    let calls = 0
    d.source.inventory = async () => {
      const snapshot = await original()
      if (++calls === 2) snapshot.referenceDigest = 'f'.repeat(64)
      return snapshot
    }
    expect((await runBackup(d)).status).toBe('INCOMPLETE')
    expect((await runBackup({ ...d, journal: createJournal(d.journal.serialize()) })).status).toBe('INCOMPLETE')
    const saved = JSON.parse(d.journal.serialize())
    saved.consistencyRejected = false
    expect((await runBackup({ ...d, journal: createJournal(JSON.stringify(saved)) })).status).toBe('INCOMPLETE')
    expect(d.target.metrics.publications).toBe(0)
  })
  it('keeps the original inventory identity through legitimate interruption and rejects forged baseline metadata', async () => {
    const d = setup()
    d.journal.failSaveAt = 3
    expect((await runBackup(d)).status).toBe('INCOMPLETE')
    const serialized = d.journal.serialize()
    const altered = JSON.parse(serialized)
    altered.initialInventory = { ...altered.initialInventory, id: 'synthetic:forged' }
    expect((await runBackup({ ...d, journal: createJournal(JSON.stringify(altered)) })).status).toBe('INCOMPLETE')
    const restarted = { ...d, journal: createJournal(serialized) }
    expect((await runBackup(restarted)).status).toBe('COMPLETE')
    const saved = await restarted.journal.load()
    expect(saved.manifest.inventories[0].id).toBe('synthetic:inventory-1')
  })
  it('completes stable sorted inventories with authenticated evidence and no repeated writes', async () => {
    const d = setup()
    const result = await runBackup(d)
    expect(result).toMatchObject({
      status: 'COMPLETE',
      totals: { objects: 2, bytes: 6 },
      evidenceLevel: 'synthetic',
      productionReady: false,
      physicalBytesVerifiedInProduction: false,
    })
    const saved = await d.journal.load()
    expect(isComplete(saved.manifest, saved.attestation, d.signingKey)).toBe(true)
    expect(saved.entries.map((e: { objectId: string }) => e.objectId)).toEqual(
      saved.entries.map((e: { objectId: string }) => e.objectId).sort(),
    )
    const writes = d.target.metrics.commits + d.target.metrics.publications
    expect((await runBackup(d)).status).toBe('COMPLETE')
    expect(d.target.metrics.commits + d.target.metrics.publications).toBe(writes)
    expect(isComplete(saved.manifest, null, d.signingKey)).toBe(false)
    expect(isComplete(saved.manifest, saved.attestation, Buffer.alloc(32, 9))).toBe(false)
  })
  it.each(['addition', 'deletion', 'revision', 'reference', 'missing', 'invalid'])(
    'fails closed on inventory %s',
    async (change) => {
      const d = setup()
      const original = d.source.inventory
      let count = 0
      d.source.inventory = async () => {
        const snapshot = await original()
        if (++count === 2) {
          if (change === 'addition') snapshot.objects.push({ ...snapshot.objects[0], path: 'new.pdf' })
          if (change === 'deletion') snapshot.objects.pop()
          if (change === 'revision') snapshot.objects[0].revision = 'v2'
          if (change === 'reference') snapshot.referenceDigest = 'f'.repeat(64)
          if (change === 'missing') snapshot.missingReferences = 1
          if (change === 'invalid') snapshot.invalidReferences = 1
        }
        return snapshot
      }
      expect((await runBackup(d)).status).toBe('INCOMPLETE')
      expect(d.target.metrics.publications).toBe(0)
    },
  )
  it('requires explicit empty-source expectation and rejects duplicates', async () => {
    const d = setup()
    d.source.objects = []
    expect((await runBackup(d)).status).toBe('INCOMPLETE')
    d.source.expectedEmpty = true
    expect((await runBackup(d)).status).toBe('COMPLETE')
    const duplicate = setup()
    duplicate.source.objects.push(duplicate.source.objects[0])
    expect((await runBackup(duplicate)).status).toBe('INCOMPLETE')
  })
  it('resumes serialized checkpoints with new dependencies without copying verified objects again', async () => {
    const d = setup()
    d.journal.failSaveAt = 3
    expect((await runBackup(d)).status).toBe('INCOMPLETE')
    const serialized = d.journal.serialize()
    const next = { ...setup(), target: d.target, journal: createJournal(serialized) }
    expect((await runBackup(next)).status).toBe('COMPLETE')
    expect(d.target.metrics.commits).toBe(2)
  })
  it.each(['configDigest', 'revision', 'checksum', 'version', 'hash', 'entries'])(
    'rejects forged journal %s',
    async (field) => {
      const d = setup()
      expect((await runBackup(d)).status).toBe('COMPLETE')
      const saved = JSON.parse(d.journal.serialize())
      if (field === 'configDigest') saved.configDigest = 'x'
      if (field === 'revision') saved.entries[0].revision = 'v2'
      if (field === 'checksum') saved.entries[0].target.checksum = 'x'
      if (field === 'version') saved.entries[0].target.versionId = 'x'
      if (field === 'hash') saved.entries[0].plaintextSha256 = '0'.repeat(64)
      if (field === 'entries') saved.entries.push(saved.entries[0])
      const next = { ...d, journal: createJournal(JSON.stringify(saved)) }
      expect((await runBackup(next)).status).toBe('INCOMPLETE')
    },
  )
  it('does not attest manifest-only state until matching resume verification succeeds', async () => {
    const d = setup()
    d.target.failAttestation = true
    expect((await runBackup(d)).status).toBe('INCOMPLETE')
    const saved = await d.journal.load()
    expect(saved.manifest).toBeDefined()
    expect(isComplete(saved.manifest, saved.attestation, d.signingKey)).toBe(false)
    d.target.failAttestation = false
    expect((await runBackup({ ...d, journal: createJournal(d.journal.serialize()) })).status).toBe('COMPLETE')
    expect(d.target.metrics.publications).toBe(2)
  })
  it('cannot reuse completion with different configuration or changed equal-length content', async () => {
    const d = setup()
    expect((await runBackup(d)).status).toBe('COMPLETE')
    expect((await runBackup({ ...d, config: { ...d.config, operatorVersion: 'synthetic:v2' } })).status).toBe(
      'INCOMPLETE',
    )
    d.source.fillByte = 98
    expect((await runBackup(d)).status).toBe('INCOMPLETE')
  })
  it('refuses key-only reconciliation after a lost response', async () => {
    const d = setup()
    d.target.loseCommitResponse = true
    expect((await runBackup(d)).status).toBe('INCOMPLETE')
    d.target.loseCommitResponse = false
    expect((await runBackup(d)).status).toBe('INCOMPLETE')
    expect(d.target.metrics.publications).toBe(0)
    expect('delete' in d.target).toBe(false)
    expect('delete' in d.source).toBe(false)
  })
  it('cancels before upload and never exposes provider error messages', async () => {
    const d = setup()
    const abort = new AbortController()
    abort.abort()
    expect((await runBackup({ ...d, signal: abort.signal })).status).toBe('INCOMPLETE')
    expect(d.target.metrics.commits).toBe(0)
    d.source.inventory = async () => {
      throw new Error('SECRET/path?token=canary', { cause: new Error('nested-secret') })
    }
    const result = await runBackup(d)
    expect(result.status).toBe('INCOMPLETE')
    expect(JSON.stringify(result)).not.toMatch(/SECRET|canary|nested-secret/)
  })
})
