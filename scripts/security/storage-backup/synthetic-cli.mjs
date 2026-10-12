import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runBackup } from './run.mjs'
import { fixtureConfig, createSource, createTarget, createJournal } from './fixtures.mjs'

const scenarios = new Set(['happy', 'mutation', 'checksum-mismatch', 'interrupted-resume'])
const invalid = () => ({
  status: 'INCOMPLETE',
  code: 'INVALID_ARGUMENTS',
  totals: { objects: 0, bytes: 0 },
  evidenceLevel: 'synthetic',
  productionReady: false,
  physicalBytesVerifiedInProduction: false,
})

/** Select only built-in, generated memory fixtures. Never consult environment credentials. */
export async function runSyntheticScenario(name) {
  if (!scenarios.has(name)) return invalid()
  const objects = [0, 5 * 1024 * 1024 + 1].map((sizeBytes, i) => ({
    bucket: 'documents',
    path: `fixture-${i}.pdf`,
    sizeBytes,
    revision: 'v1',
  }))
  const dependencies = {
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
  if (name === 'mutation') dependencies.source.mutateAfterOpen = true
  if (name === 'checksum-mismatch') dependencies.target.corruptPart = true
  if (name === 'interrupted-resume') {
    dependencies.journal.failSaveAt = 3
    const interrupted = await runBackup(dependencies)
    if (interrupted.status !== 'INCOMPLETE') return { ...invalid(), code: 'INCOMPLETE' }
    dependencies.journal = createJournal(dependencies.journal.serialize())
    dependencies.source = createSource(objects)
  }
  return runBackup(dependencies)
}

/** @param {string[]} args @param {{write:(text:string)=>void}} io */
export async function main(args, io) {
  if (args.length !== 2 || args[0] !== '--scenario' || !scenarios.has(args[1])) {
    io.write(JSON.stringify(invalid()) + '\n')
    return 2
  }
  let outcome
  try {
    outcome = await runSyntheticScenario(args[1])
  } catch {
    outcome = { ...invalid(), code: 'INCOMPLETE' }
  }
  io.write(JSON.stringify(outcome) + '\n')
  return outcome.status === 'COMPLETE' ? 0 : 1
}

// Importing this module does not run a scenario or print output.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2), { write: (text) => process.stdout.write(text) })
}
