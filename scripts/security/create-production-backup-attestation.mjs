import { createHash, createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const SHA_PATTERN = /^[a-f0-9]{40}$/i
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/
const BACKUP_REFERENCE_PATTERN = /^motto-saas-(?:enforcement|post-rollout|pre-deploy)-\d{8}T\d{6}Z\.zip\.dpapi$/
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

async function createAttestation() {
  const backupFile = readRequired('BACKUP_FILE')
  const projectRef = readRequired('TARGET_PROJECT_REF')
  const releaseSha = readRequired('RELEASE_SHA')
  const backupCreatedAt = readRequired('BACKUP_CREATED_AT_UTC')
  const encodedKey = readRequired('PRODUCTION_BACKUP_ATTESTATION_KEY')
  if (!backupFile || !projectRef || !releaseSha || !backupCreatedAt || !encodedKey) return

  if (process.env.BACKUP_RESTORE_VERIFIED !== 'true') {
    fail('restore_verification_required', 'The encrypted backup must pass an isolated restore test first.')
    return
  }

  if (!PROJECT_REF_PATTERN.test(projectRef) || !SHA_PATTERN.test(releaseSha)) {
    fail('release_scope_invalid', 'Project reference and release SHA must be exact production values.')
    return
  }

  const backupTime = Date.parse(backupCreatedAt)
  if (!Number.isFinite(backupTime)) {
    fail('backup_timestamp_invalid', 'Backup creation time must be valid ISO-8601 UTC.')
    return
  }

  const backupReference = path.basename(backupFile)
  if (!BACKUP_REFERENCE_PATTERN.test(backupReference)) {
    fail('backup_reference_invalid', 'Backup filename does not match the encrypted production backup contract.')
    return
  }

  const key = Buffer.from(encodedKey, 'base64')
  if (key.length < 32 || key.toString('base64').replace(/=+$/, '') !== encodedKey.replace(/=+$/, '')) {
    fail('backup_attestation_key_invalid', 'Backup attestation key must be valid base64 with at least 32 bytes.')
    return
  }

  let encryptedBackup
  try {
    encryptedBackup = await readFile(backupFile)
  } catch {
    fail('backup_file_unavailable', 'Encrypted backup file could not be read.')
    return
  }

  if (encryptedBackup.length === 0) {
    fail('backup_file_empty', 'Encrypted backup file must not be empty.')
    return
  }

  const normalizedBackupCreatedAt = new Date(backupTime).toISOString()
  const backupSha256 = createHash('sha256').update(encryptedBackup).digest('hex')
  const canonicalEvidence = [
    ATTESTATION_VERSION,
    projectRef,
    releaseSha.toLowerCase(),
    normalizedBackupCreatedAt,
    backupSha256,
    backupReference,
    'restore_verified=true',
  ].join('\n')
  const backupAttestation = createHmac('sha256', key).update(canonicalEvidence).digest('hex')

  process.stdout.write(
    `${JSON.stringify({
      status: 'PASS',
      project_ref: projectRef,
      release_sha: releaseSha.toLowerCase(),
      backup_created_at_utc: normalizedBackupCreatedAt,
      backup_sha256: backupSha256,
      backup_reference: backupReference,
      backup_attestation: backupAttestation,
      restore_verified: true,
    })}\n`,
  )
}

await createAttestation()
