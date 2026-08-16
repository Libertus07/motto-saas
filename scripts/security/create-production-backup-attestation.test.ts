import { spawnSync } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const projectRef = 'zahdmrvhxsmqpeesrfkt'
const releaseSha = 'a'.repeat(40)
const backupCreatedAt = '2026-08-16T16:39:18.384Z'
const backupReference = 'motto-saas-post-rollout-20260816T163918Z.zip.dpapi'
const key = Buffer.from('motto-saas-production-backup-attestation-test-key')
const encodedKey = key.toString('base64')
const scriptPath = path.resolve('scripts/security/create-production-backup-attestation.mjs')
let tempDirectory: string
let backupFile: string

beforeAll(() => {
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'motto-backup-attestation-'))
  backupFile = path.join(tempDirectory, backupReference)
  fs.writeFileSync(backupFile, 'encrypted-backup-fixture')
})

afterAll(() => {
  fs.rmSync(tempDirectory, { recursive: true, force: true })
})

function runSigner(overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      BACKUP_FILE: backupFile,
      TARGET_PROJECT_REF: projectRef,
      RELEASE_SHA: releaseSha,
      BACKUP_CREATED_AT_UTC: backupCreatedAt,
      BACKUP_RESTORE_VERIFIED: 'true',
      PRODUCTION_BACKUP_ATTESTATION_KEY: encodedKey,
      ...overrides,
    },
  })
}

describe('production backup attestation signer', () => {
  it('hashes the actual encrypted backup and signs its restore-verified evidence', () => {
    const result = runSigner()
    const output = JSON.parse(result.stdout)
    const backupSha256 = createHash('sha256').update('encrypted-backup-fixture').digest('hex')
    const expectedAttestation = createHmac('sha256', key)
      .update(
        [
          'motto-saas-backup-v1',
          projectRef,
          releaseSha,
          backupCreatedAt,
          backupSha256,
          backupReference,
          'restore_verified=true',
        ].join('\n'),
      )
      .digest('hex')

    expect(result.status).toBe(0)
    expect(output).toMatchObject({
      status: 'PASS',
      backup_sha256: backupSha256,
      backup_attestation: expectedAttestation,
      restore_verified: true,
    })
    expect(result.stdout).not.toContain(encodedKey)
  })

  it('refuses to attest a backup without isolated restore verification', () => {
    const result = runSigner({ BACKUP_RESTORE_VERIFIED: 'false' })

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stderr)).toMatchObject({
      status: 'FAIL',
      code: 'restore_verification_required',
    })
  })
})
