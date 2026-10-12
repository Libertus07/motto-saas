import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import {
  canonicalBytes,
  identifyObject,
  requireValue,
  validUtc,
  validateConfig,
  validateTargetEvidence,
  retentionUntil,
} from './contract.mjs'
import { copyObject, PART_BYTES, CHUNK_BYTES } from './transfer.mjs'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => canonicalBytes(a).equals(canonicalBytes(b))
const hex = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const exact = (value, fields) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === fields.length &&
  fields.every((f) => Object.hasOwn(value, f))
const result = (status, totals) => ({
  status,
  code: status === 'COMPLETE' ? 'VERIFIED_SYNTHETIC' : 'INCOMPLETE',
  totals,
  evidenceLevel: 'synthetic',
  productionReady: false,
  physicalBytesVerifiedInProduction: false,
})

function entryValid(entry, config) {
  requireValue(
    exact(entry, ['objectId', 'revision', 'plaintextSha256', 'target', 'attempts']) &&
      hex(entry.objectId) &&
      hex(entry.plaintextSha256) &&
      typeof entry.revision === 'string' &&
      entry.revision.length > 0 &&
      Number.isInteger(entry.attempts) &&
      entry.attempts >= 1 &&
      entry.attempts <= 3,
    'JOURNAL_INVALID',
  )
  const t = entry.target
  requireValue(
    exact(t, [
      'key',
      'versionId',
      'sizeBytes',
      'checksumAlgorithm',
      'checksumType',
      'checksum',
      'encryption',
      'kmsKeyId',
      'lockMode',
      'retainUntilUtc',
    ]),
    'JOURNAL_INVALID',
  )
  const multipart = t.sizeBytes > PART_BYTES
  requireValue(
    t.checksumType === (multipart ? 'COMPOSITE' : 'FULL_OBJECT') &&
      typeof t.checksum === 'string' &&
      (multipart
        ? /^[A-Za-z0-9+/]{43}=-(?:[2-9]|[1-9][0-9]{1,3}|10000)$/.test(t.checksum)
        : t.checksum === Buffer.from(entry.plaintextSha256, 'hex').toString('base64')),
    'JOURNAL_INVALID',
  )
  validateTargetEvidence(t, {
    key: `backup-sets/${config.backupClass}/${config.setId}/objects/${entry.objectId}`,
    sizeBytes: t.sizeBytes,
    checksumType: t.checksumType,
    checksum: t.checksum,
    kmsKeyId: config.expectedKmsKeyId,
    minimumRetainUntilUtc: retentionUntil(config),
  })
}

/** Authenticate the exact canonical manifest; never equate manifest existence with completion. */
export function isComplete(manifest, attestation, signingKey) {
  try {
    requireValue(Buffer.isBuffer(signingKey) && signingKey.length >= 32, 'KEY_INVALID')
    requireValue(
      exact(manifest, ['schemaVersion', 'config', 'inventories', 'objects', 'totals', 'completedAtUtc']) &&
        manifest.schemaVersion === 1 &&
        validUtc(manifest.completedAtUtc),
      'MANIFEST_INVALID',
    )
    const config = validateConfig(manifest.config)
    requireValue(Date.parse(manifest.completedAtUtc) >= Date.parse(config.startedAtUtc), 'MANIFEST_INVALID')
    requireValue(
      Array.isArray(manifest.inventories) &&
        manifest.inventories.length === 2 &&
        manifest.inventories.every(
          (i) =>
            exact(i, ['id', 'digest']) && typeof i.id === 'string' && i.id.startsWith('synthetic:') && hex(i.digest),
        ) &&
        manifest.inventories[0].digest === manifest.inventories[1].digest,
      'MANIFEST_INVALID',
    )
    requireValue(Array.isArray(manifest.objects) && exact(manifest.totals, ['objects', 'bytes']), 'MANIFEST_INVALID')
    let bytes = 0
    let previous = ''
    for (const entry of manifest.objects) {
      entryValid(entry, config)
      requireValue(entry.objectId > previous, 'MANIFEST_INVALID')
      previous = entry.objectId
      bytes += entry.target.sizeBytes
      requireValue(Number.isSafeInteger(bytes), 'MANIFEST_INVALID')
    }
    requireValue(
      manifest.totals.objects === manifest.objects.length && manifest.totals.bytes === bytes,
      'MANIFEST_INVALID',
    )
    requireValue(
      exact(attestation, ['manifestSha256', 'keyVersion', 'hmacSha256']) &&
        attestation.keyVersion === 'synthetic:attestation-v1' &&
        hex(attestation.hmacSha256),
      'ATTESTATION_INVALID',
    )
    const encoded = canonicalBytes(manifest)
    const expected = createHmac('sha256', signingKey).update(encoded).digest()
    return (
      attestation.manifestSha256 === sha(encoded) &&
      timingSafeEqual(expected, Buffer.from(attestation.hmacSha256, 'hex'))
    )
  } catch {
    return false
  }
}

function snapshotView(snapshot, config, identityKey, expectedEmpty) {
  requireValue(
    exact(snapshot, ['id', 'capturedAtUtc', 'objects', 'referenceDigest', 'missingReferences', 'invalidReferences']) &&
      typeof snapshot.id === 'string' &&
      snapshot.id.startsWith('synthetic:') &&
      validUtc(snapshot.capturedAtUtc) &&
      Date.parse(snapshot.capturedAtUtc) >= Date.parse(config.startedAtUtc) &&
      Array.isArray(snapshot.objects) &&
      hex(snapshot.referenceDigest) &&
      snapshot.missingReferences === 0 &&
      snapshot.invalidReferences === 0,
    'INVENTORY_INVALID',
  )
  requireValue(snapshot.objects.length > 0 || expectedEmpty === true, 'INVENTORY_EMPTY')
  const objects = snapshot.objects
    .map((object) => ({ object: structuredClone(object), objectId: identifyObject(object, identityKey) }))
    .sort((a, b) => (a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0))
  let bytes = 0
  const ids = new Set()
  for (const item of objects) {
    requireValue(!ids.has(item.objectId), 'INVENTORY_DUPLICATE')
    ids.add(item.objectId)
    bytes += item.object.sizeBytes
    requireValue(Number.isSafeInteger(bytes), 'INVENTORY_INVALID')
  }
  const digest = sha(
    canonicalBytes({
      objects: objects.map(({ object, objectId }) => ({
        objectId,
        sizeBytes: object.sizeBytes,
        revision: object.revision,
      })),
      referenceDigest: snapshot.referenceDigest,
    }),
  )
  return { objects, digest, totals: { objects: objects.length, bytes } }
}

/** Re-read source hashes on resume; untrusted checkpoint hashes cannot authorize a skip. */
async function verifyEntry(entry, object, dependencies) {
  const { config, source, target, signal } = dependencies
  entryValid(entry, config)
  requireValue(entry.revision === object.revision && entry.target.sizeBytes === object.sizeBytes, 'JOURNAL_INVALID')
  const check = async () => {
    requireValue(!signal?.aborted, 'CANCELLED')
    const current = await source.stat(object)
    requireValue(current.revision === object.revision && current.sizeBytes === object.sizeBytes, 'SOURCE_CHANGED')
  }
  await check()
  const whole = createHash('sha256')
  let part = createHash('sha256')
  const composite = createHash('sha256')
  let count = 0
  let partBytes = 0
  let parts = 0
  for await (const chunk of source.open(object, { signal })) {
    requireValue(!signal?.aborted, 'CANCELLED')
    requireValue(
      chunk instanceof Uint8Array && chunk.byteLength > 0 && chunk.byteLength <= CHUNK_BYTES,
      'CHUNK_INVALID',
    )
    count += chunk.byteLength
    requireValue(count <= object.sizeBytes, 'SIZE_MISMATCH')
    whole.update(chunk)
    for (let offset = 0; offset < chunk.byteLength;) {
      const length = Math.min(PART_BYTES - partBytes, chunk.byteLength - offset)
      part.update(chunk.subarray(offset, offset + length))
      offset += length
      partBytes += length
      if (partBytes === PART_BYTES) {
        composite.update(part.digest())
        part = createHash('sha256')
        partBytes = 0
        parts++
      }
    }
  }
  requireValue(count === object.sizeBytes, 'SIZE_MISMATCH')
  if (partBytes > 0) {
    composite.update(part.digest())
    parts++
  }
  const plaintext = whole.digest('hex')
  const checksum =
    object.sizeBytes > PART_BYTES
      ? composite.digest('base64') + `-${parts}`
      : Buffer.from(plaintext, 'hex').toString('base64')
  requireValue(entry.plaintextSha256 === plaintext && entry.target.checksum === checksum, 'CHECKSUM_MISMATCH')
  await check()
  const receipt = await target.evidence({ key: entry.target.key, versionId: entry.target.versionId })
  requireValue(same(receipt, entry.target), 'EVIDENCE_INVALID')
}

/** Offline set coordinator. All external exceptions are collapsed to an allowlisted result. */
export async function runBackup({
  config,
  source,
  target,
  journal,
  identityKey,
  signingKey,
  clock,
  sleep,
  random,
  signal = /** @type {AbortSignal | undefined} */ (undefined),
}) {
  let totals = { objects: 0, bytes: 0 }
  try {
    config = validateConfig(config)
    requireValue(
      Buffer.isBuffer(identityKey) &&
        identityKey.length >= 32 &&
        Buffer.isBuffer(signingKey) &&
        signingKey.length >= 32 &&
        !identityKey.equals(signingKey),
      'KEY_INVALID',
    )
    const check = () => requireValue(!signal?.aborted, 'CANCELLED')
    check()
    const first = await source.inventory()
    const before = snapshotView(first, config, identityKey, source.expectedEmpty)
    const configDigest = sha(canonicalBytes(config))
    let state = await journal.load()
    if (state === null) {
      state = { schemaVersion: 1, configDigest, state: 'INCOMPLETE', entries: [] }
      await journal.save(state)
    }
    requireValue(
      state &&
        state.schemaVersion === 1 &&
        state.configDigest === configDigest &&
        ['INCOMPLETE', 'COMPLETE'].includes(state.state) &&
        Array.isArray(state.entries) &&
        Object.keys(state).every((k) =>
          ['schemaVersion', 'configDigest', 'state', 'entries', 'manifest', 'attestation'].includes(k),
        ),
      'JOURNAL_INVALID',
    )
    const deps = { config, source, target, signal }
    const entries = new Map()
    for (const entry of state.entries) {
      requireValue(!entries.has(entry.objectId), 'JOURNAL_INVALID')
      const item = before.objects.find((i) => i.objectId === entry.objectId)
      requireValue(item, 'JOURNAL_INVALID')
      await verifyEntry(entry, item.object, deps)
      entries.set(entry.objectId, entry)
    }
    if (state.state === 'COMPLETE')
      requireValue(isComplete(state.manifest, state.attestation, signingKey), 'JOURNAL_INVALID')
    for (const { object, objectId } of before.objects) {
      check()
      if (!entries.has(objectId)) {
        requireValue(!state.manifest && !state.attestation, 'JOURNAL_INVALID')
        const entry = await copyObject({ object, objectId, ...deps, sleep, random })
        entryValid(entry, config)
        entries.set(objectId, entry)
        state.entries = [...entries.values()].sort((a, b) => (a.objectId < b.objectId ? -1 : 1))
        await journal.save(state)
      }
    }
    const second = await source.inventory()
    const after = snapshotView(second, config, identityKey, source.expectedEmpty)
    requireValue(
      before.digest === after.digest && Date.parse(second.capturedAtUtc) >= Date.parse(first.capturedAtUtc),
      'INVENTORY_CHANGED',
    )
    // Verify content again after the second inventory, including equal-length fixture mutations.
    for (const { object, objectId } of after.objects) await verifyEntry(entries.get(objectId), object, deps)
    check()
    const completedAtUtc = clock()
    requireValue(
      validUtc(completedAtUtc) && Date.parse(completedAtUtc) >= Date.parse(second.capturedAtUtc),
      'CLOCK_INVALID',
    )
    const manifest = state.manifest ?? {
      schemaVersion: 1,
      config,
      inventories: [
        { id: first.id, digest: before.digest },
        { id: second.id, digest: after.digest },
      ],
      objects: state.entries,
      totals: before.totals,
      completedAtUtc,
    }
    requireValue(
      same(manifest.config, config) &&
        same(manifest.objects, state.entries) &&
        same(manifest.totals, before.totals) &&
        manifest.inventories.every((i) => i.digest === before.digest),
      'MANIFEST_INVALID',
    )
    const encoded = canonicalBytes(manifest)
    const attestation = {
      manifestSha256: sha(encoded),
      keyVersion: 'synthetic:attestation-v1',
      hmacSha256: createHmac('sha256', signingKey).update(encoded).digest('hex'),
    }
    requireValue(isComplete(manifest, attestation, signingKey), 'MANIFEST_INVALID')
    const remote = await target.finalization({ setId: config.setId })
    requireValue(!remote.manifest || same(remote.manifest, manifest), 'FINALIZATION_CONFLICT')
    requireValue(!remote.attestation || same(remote.attestation, attestation), 'FINALIZATION_CONFLICT')
    if (state.state === 'COMPLETE') requireValue(remote.manifest && remote.attestation, 'FINALIZATION_MISSING')
    state.manifest = manifest
    if (state.state !== 'COMPLETE') await journal.save(state)
    check()
    if (!remote.manifest) await target.publishManifest(encoded)
    check()
    if (!remote.attestation) await target.publishAttestation(canonicalBytes(attestation))
    check()
    const published = await target.finalization({ setId: config.setId })
    requireValue(
      same(published.manifest, manifest) &&
        same(published.attestation, attestation) &&
        isComplete(published.manifest, published.attestation, signingKey),
      'FINALIZATION_INVALID',
    )
    if (state.state !== 'COMPLETE') {
      state.attestation = attestation
      state.state = 'COMPLETE'
      await journal.save(state)
    }
    check()
    totals = before.totals
    return result('COMPLETE', totals)
  } catch {
    return result('INCOMPLETE', totals)
  }
}
