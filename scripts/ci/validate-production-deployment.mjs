import { createHmac, timingSafeEqual } from 'node:crypto'

const MAX_BACKUP_AGE_MS = 24 * 60 * 60 * 1000
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
const SHA_PATTERN = /^[a-f0-9]{40}$/i
const SHA256_PATTERN = /^[a-f0-9]{64}$/i
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/
const BACKUP_REFERENCE_PATTERN = /^motto-saas-(?:enforcement|post-rollout|pre-deploy)-\d{8}T\d{6}Z\.zip\.dpapi$/
const ATTESTATION_PATTERN = /^[a-f0-9]{64}$/i
const ATTESTATION_VERSION = 'motto-saas-backup-v1'

function fail(code, message) {
  process.stderr.write(`${JSON.stringify({ status: 'FAIL', code, message })}\n`)
  process.exitCode = 1
}

function readRequired(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    fail('required_value_missing', `${name} is required.`)
    return null
  }

  return value
}

function createCanonicalBackupEvidence({ projectRef, releaseSha, backupCreatedAt, backupSha256, backupReference }) {
  return [
    ATTESTATION_VERSION,
    projectRef,
    releaseSha.toLowerCase(),
    backupCreatedAt,
    backupSha256.toLowerCase(),
    backupReference,
    'restore_verified=true',
  ].join('\n')
}

function verifyBackupAttestation(evidence) {
  const attestation = process.env.BACKUP_ATTESTATION?.trim()
  if (!attestation) {
    fail('backup_attestation_missing', 'A signed backup attestation is required.')
    return false
  }

  if (!ATTESTATION_PATTERN.test(attestation)) {
    fail('backup_attestation_invalid', 'Backup attestation must be a 64-character HMAC-SHA256 value.')
    return false
  }

  const encodedKey = process.env.BACKUP_ATTESTATION_KEY?.trim()
  if (!encodedKey) {
    fail('backup_attestation_key_missing', 'The protected backup attestation key is unavailable.')
    return false
  }

  const key = Buffer.from(encodedKey, 'base64')
  if (key.length < 32 || key.toString('base64').replace(/=+$/, '') !== encodedKey.replace(/=+$/, '')) {
    fail('backup_attestation_key_invalid', 'The protected backup attestation key is invalid.')
    return false
  }

  const expected = createHmac('sha256', key).update(createCanonicalBackupEvidence(evidence)).digest()
  const received = Buffer.from(attestation, 'hex')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    fail('backup_attestation_invalid', 'Backup attestation does not match the approved backup evidence.')
    return false
  }

  return true
}

function validate() {
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    fail('manual_invocation_required', 'Production deployment must be started manually.')
    return
  }

  if (process.env.GITHUB_REF_NAME !== 'master') {
    fail('master_branch_required', 'Production deployment must target master.')
    return
  }

  const githubSha = readRequired('GITHUB_SHA')
  const releaseSha = readRequired('RELEASE_SHA')
  if (!githubSha || !releaseSha) return

  if (!SHA_PATTERN.test(githubSha) || !SHA_PATTERN.test(releaseSha)) {
    fail('release_sha_invalid', 'Release SHA must be a full 40-character Git commit SHA.')
    return
  }

  if (githubSha.toLowerCase() !== releaseSha.toLowerCase()) {
    fail('release_sha_mismatch', 'Approved release SHA does not match the selected master commit.')
    return
  }

  const expectedProjectRef = readRequired('EXPECTED_PROJECT_REF')
  const targetProjectRef = readRequired('TARGET_PROJECT_REF')
  if (!expectedProjectRef || !targetProjectRef) return

  if (!PROJECT_REF_PATTERN.test(expectedProjectRef)) {
    fail('expected_project_ref_invalid', 'Configured production project reference is invalid.')
    return
  }

  if (targetProjectRef !== expectedProjectRef) {
    fail('project_ref_mismatch', 'Requested project does not match the configured production project.')
    return
  }

  if (process.env.CONFIRMATION?.trim() !== `DEPLOY ${expectedProjectRef}`) {
    fail('confirmation_mismatch', 'Explicit project-specific deployment confirmation is required.')
    return
  }

  const backupCreatedAt = readRequired('BACKUP_CREATED_AT_UTC')
  if (!backupCreatedAt) return

  const backupTime = Date.parse(backupCreatedAt)
  if (!Number.isFinite(backupTime)) {
    fail('backup_timestamp_invalid', 'Backup timestamp must be a valid ISO-8601 value.')
    return
  }

  const backupAge = Date.now() - backupTime
  if (backupAge < -MAX_CLOCK_SKEW_MS) {
    fail('backup_from_future', 'Backup timestamp is too far in the future.')
    return
  }

  if (backupAge > MAX_BACKUP_AGE_MS) {
    fail('backup_expired', 'Backup must be less than 24 hours old.')
    return
  }

  const backupSha256 = readRequired('BACKUP_SHA256')
  if (!backupSha256) return

  if (!SHA256_PATTERN.test(backupSha256)) {
    fail('backup_sha256_invalid', 'Backup SHA-256 must contain exactly 64 hexadecimal characters.')
    return
  }

  const backupReference = readRequired('BACKUP_REFERENCE')
  if (!backupReference) return

  if (!BACKUP_REFERENCE_PATTERN.test(backupReference)) {
    fail('backup_reference_invalid', 'Backup reference must be an approved encrypted backup filename.')
    return
  }

  const validationPhase = process.env.VALIDATION_PHASE?.trim() || 'trusted'
  if (!['public', 'trusted'].includes(validationPhase)) {
    fail('validation_phase_invalid', 'Validation phase must be public or trusted.')
    return
  }

  const normalizedBackupCreatedAt = new Date(backupTime).toISOString()
  if (
    validationPhase === 'trusted' &&
    !verifyBackupAttestation({
      projectRef: expectedProjectRef,
      releaseSha,
      backupCreatedAt: normalizedBackupCreatedAt,
      backupSha256,
      backupReference,
    })
  ) {
    return
  }

  process.stdout.write(
    `${JSON.stringify({
      status: 'PASS',
      project_ref: expectedProjectRef,
      release_sha: releaseSha.toLowerCase(),
      backup_sha256: backupSha256.toLowerCase(),
      backup_reference: backupReference,
      backup_created_at_utc: normalizedBackupCreatedAt,
      validation_phase: validationPhase,
    })}\n`,
  )
}

validate()
