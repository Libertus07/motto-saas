import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const EXPECTED_NEXT = '16.3.3'
const EXPECTED_ESLINT_CONFIG_NEXT = '16.3.3'
const EXPECTED_SHARP = '0.35.3'
const EXPECTED_NEXT_SHARP_RANGE = '^0.35.3'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireRecord(value, message) {
  if (!isRecord(value)) throw new Error(message)
  return value
}

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function readJson(filePath, message) {
  try {
    const value = JSON.parse(readFileSync(filePath, 'utf8'))
    return requireRecord(value, message)
  } catch {
    throw new Error(message)
  }
}

function assertNoDirectSharp(packageJson) {
  for (const sectionName of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const section = packageJson[sectionName]
    if (isRecord(section) && hasOwn(section, 'sharp')) {
      throw new Error('project must not declare sharp directly.')
    }
  }

  if (hasOwn(packageJson, 'overrides')) {
    throw new Error('project must not use overrides.')
  }
  if (hasOwn(packageJson, 'resolutions')) {
    throw new Error('project must not use resolutions.')
  }
}

export function verifyNextSharpCompatibility({ packageJson, packageLock }) {
  const project = requireRecord(packageJson, 'project package contract is invalid.')
  const lock = requireRecord(packageLock, 'package lock contract is invalid.')
  const dependencies = requireRecord(project.dependencies, 'project dependencies are invalid.')
  const devDependencies = requireRecord(project.devDependencies, 'project devDependencies are invalid.')

  if (dependencies.next !== EXPECTED_NEXT) {
    throw new Error('project next dependency must be exactly 16.3.3.')
  }
  if (devDependencies['eslint-config-next'] !== EXPECTED_ESLINT_CONFIG_NEXT) {
    throw new Error('project eslint-config-next dependency must be exactly 16.3.3.')
  }
  assertNoDirectSharp(project)

  if (lock.lockfileVersion !== 3) {
    throw new Error('package lock must use lockfileVersion 3.')
  }

  const packages = requireRecord(lock.packages, 'package lock packages are invalid.')
  const root = requireRecord(packages[''], 'package lock root package is missing.')
  const rootDependencies = requireRecord(root.dependencies, 'lockfile root dependencies are invalid.')
  const rootDevDependencies = requireRecord(root.devDependencies, 'lockfile root devDependencies are invalid.')

  if (rootDependencies.next !== EXPECTED_NEXT) {
    throw new Error('lockfile root next dependency must be exactly 16.3.3.')
  }
  if (rootDevDependencies['eslint-config-next'] !== EXPECTED_ESLINT_CONFIG_NEXT) {
    throw new Error('lockfile root eslint-config-next dependency must be exactly 16.3.3.')
  }

  const nextPackage = requireRecord(packages['node_modules/next'], 'installed Next package is missing.')
  if (nextPackage.version !== EXPECTED_NEXT) {
    throw new Error('installed Next package must be exactly 16.3.3.')
  }
  const nextOptionalDependencies = requireRecord(
    nextPackage.optionalDependencies,
    'Next optional dependency contract is missing.',
  )
  if (nextOptionalDependencies.sharp !== EXPECTED_NEXT_SHARP_RANGE) {
    throw new Error('Next must declare the sharp ^0.35.3 optional contract.')
  }

  const eslintPackage = requireRecord(
    packages['node_modules/eslint-config-next'],
    'installed eslint-config-next package is missing.',
  )
  if (eslintPackage.version !== EXPECTED_ESLINT_CONFIG_NEXT) {
    throw new Error('installed eslint-config-next package must be exactly 16.3.3.')
  }

  const sharpEntries = Object.entries(packages).filter(([packagePath]) => packagePath.endsWith('node_modules/sharp'))
  if (sharpEntries.length !== 1) {
    throw new Error('lockfile must contain exactly one Sharp package node.')
  }
  const [sharpPath, sharpPackageValue] = sharpEntries[0]
  if (sharpPath !== 'node_modules/sharp') {
    throw new Error('Sharp package must resolve at the root node_modules boundary.')
  }
  const sharpPackage = requireRecord(sharpPackageValue, 'installed Sharp package is invalid.')
  if (sharpPackage.version !== EXPECTED_SHARP) {
    throw new Error('installed Sharp package must be exactly 0.35.3.')
  }

  return {
    nextVersion: nextPackage.version,
    eslintConfigNextVersion: eslintPackage.version,
    sharpVersion: sharpPackage.version,
  }
}

function main() {
  try {
    const projectDir = process.cwd()
    const result = verifyNextSharpCompatibility({
      packageJson: readJson(path.join(projectDir, 'package.json'), 'project package contract is invalid.'),
      packageLock: readJson(path.join(projectDir, 'package-lock.json'), 'package lock contract is invalid.'),
    })
    process.stdout.write(
      `Next/Sharp verification passed: next=${result.nextVersion} eslint-config-next=${result.eslintConfigNextVersion} sharp=${result.sharpVersion}\n`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Next/Sharp verification failed: ${message}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
