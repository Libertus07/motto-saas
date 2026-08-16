import { spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRef = 'zahdmrvhxsmqpeesrfkt'
const releaseSha = 'a'.repeat(40)
const backupSha = 'b'.repeat(64)
const backupReference = 'motto-saas-post-rollout-20260816T163839Z.zip.dpapi'
const backupCreatedAt = new Date(Date.now() - 60_000).toISOString()
const backupAttestationKey = Buffer.from('motto-saas-production-backup-test-key').toString('base64')
const scriptPath = path.resolve(process.cwd(), 'scripts/ci/validate-production-deployment.mjs')

function createBackupAttestation(overrides: Record<string, string> = {}) {
  const values = {
    projectRef,
    releaseSha,
    backupCreatedAt,
    backupSha,
    backupReference,
    ...overrides,
  }
  const canonicalEvidence = [
    'motto-saas-backup-v1',
    values.projectRef,
    values.releaseSha,
    values.backupCreatedAt,
    values.backupSha,
    values.backupReference,
    'restore_verified=true',
  ].join('\n')

  return createHmac('sha256', Buffer.from(backupAttestationKey, 'base64')).update(canonicalEvidence).digest('hex')
}

function runGate(overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF_NAME: 'master',
      GITHUB_SHA: releaseSha,
      RELEASE_SHA: releaseSha,
      TARGET_PROJECT_REF: projectRef,
      EXPECTED_PROJECT_REF: projectRef,
      BACKUP_CREATED_AT_UTC: backupCreatedAt,
      BACKUP_SHA256: backupSha,
      BACKUP_REFERENCE: backupReference,
      BACKUP_ATTESTATION: createBackupAttestation(),
      BACKUP_ATTESTATION_KEY: backupAttestationKey,
      VALIDATION_PHASE: 'trusted',
      CONFIRMATION: `DEPLOY ${projectRef}`,
      ...overrides,
    },
  })
}

describe('production deployment gate', () => {
  it('accepts a fresh, traceable backup for the exact master commit and project', () => {
    const result = runGate()

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'PASS',
      project_ref: projectRef,
      release_sha: releaseSha,
      backup_sha256: backupSha,
      backup_reference: backupReference,
    })
  })

  it.each([
    ['non-manual invocation', { GITHUB_EVENT_NAME: 'push' }, 'manual_invocation_required'],
    ['non-production branch', { GITHUB_REF_NAME: 'feature' }, 'master_branch_required'],
    ['different release commit', { RELEASE_SHA: 'c'.repeat(40) }, 'release_sha_mismatch'],
    ['different project', { TARGET_PROJECT_REF: 'wrongprojectref12345' }, 'project_ref_mismatch'],
    ['weak confirmation', { CONFIRMATION: 'DEPLOY' }, 'confirmation_mismatch'],
    [
      'stale backup',
      { BACKUP_CREATED_AT_UTC: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
      'backup_expired',
    ],
    [
      'future backup',
      { BACKUP_CREATED_AT_UTC: new Date(Date.now() + 10 * 60_000).toISOString() },
      'backup_from_future',
    ],
    ['unverifiable backup hash', { BACKUP_SHA256: 'not-a-sha' }, 'backup_sha256_invalid'],
    ['unsafe backup reference', { BACKUP_REFERENCE: '../backup.zip' }, 'backup_reference_invalid'],
    ['missing backup attestation', { BACKUP_ATTESTATION: ' ' }, 'backup_attestation_missing'],
    ['forged backup attestation', { BACKUP_ATTESTATION: '0'.repeat(64) }, 'backup_attestation_invalid'],
  ])('rejects %s', (_caseName, overrides, expectedCode) => {
    const result = runGate(overrides)

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stderr)).toMatchObject({
      status: 'FAIL',
      code: expectedCode,
    })
  })

  it('allows structural validation before Production secrets are released', () => {
    const result = runGate({
      VALIDATION_PHASE: 'public',
      BACKUP_ATTESTATION: ' ',
      BACKUP_ATTESTATION_KEY: ' ',
    })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'PASS', validation_phase: 'public' })
  })
})
