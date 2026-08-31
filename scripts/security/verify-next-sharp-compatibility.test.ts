import { describe, expect, it } from 'vitest'

import { verifyNextSharpCompatibility } from './verify-next-sharp-compatibility.mjs'

function createValidContract() {
  return {
    packageJson: {
      dependencies: { next: '16.3.3' },
      devDependencies: { 'eslint-config-next': '16.3.3' },
    },
    packageLock: {
      lockfileVersion: 3,
      packages: {
        '': {
          dependencies: { next: '16.3.3' },
          devDependencies: { 'eslint-config-next': '16.3.3' },
        },
        'node_modules/next': {
          version: '16.3.3',
          optionalDependencies: { sharp: '^0.35.3' },
        },
        'node_modules/eslint-config-next': { version: '16.3.3' },
        'node_modules/sharp': { version: '0.35.3' },
      },
    },
  }
}

type ContractFixture = ReturnType<typeof createValidContract>

const invalidCases: Array<[string, (fixture: ContractFixture) => void, string]> = [
  [
    'non-exact Next dependency',
    (fixture) => {
      fixture.packageJson.dependencies.next = '^16.3.3'
    },
    'project next dependency must be exactly 16.3.3.',
  ],
  [
    'misaligned eslint-config-next',
    (fixture) => {
      fixture.packageJson.devDependencies['eslint-config-next'] = '16.2.9'
    },
    'project eslint-config-next dependency must be exactly 16.3.3.',
  ],
  [
    'direct Sharp dependency',
    (fixture) => {
      Object.assign(fixture.packageJson.dependencies, { sharp: '0.35.3' })
    },
    'project must not declare sharp directly.',
  ],
  [
    'Sharp override',
    (fixture) => {
      Object.assign(fixture.packageJson, { overrides: { sharp: '0.35.3' } })
    },
    'project must not override sharp.',
  ],
  [
    'lockfile root drift',
    (fixture) => {
      fixture.packageLock.packages[''].dependencies.next = '16.2.12'
    },
    'lockfile root next dependency must be exactly 16.3.3.',
  ],
  [
    'unexpected Next package',
    (fixture) => {
      fixture.packageLock.packages['node_modules/next'].version = '16.2.12'
    },
    'installed Next package must be exactly 16.3.3.',
  ],
  [
    'unsupported Next Sharp range',
    (fixture) => {
      fixture.packageLock.packages['node_modules/next'].optionalDependencies.sharp = '^0.34.5'
    },
    'Next must declare the sharp ^0.35.3 optional contract.',
  ],
  [
    'old Sharp package',
    (fixture) => {
      fixture.packageLock.packages['node_modules/sharp'].version = '0.34.5'
    },
    'installed Sharp package must be exactly 0.35.3.',
  ],
  [
    'duplicate nested Sharp package',
    (fixture) => {
      Object.assign(fixture.packageLock.packages, {
        'node_modules/example/node_modules/sharp': { version: '0.35.3' },
      })
    },
    'lockfile must contain exactly one Sharp package node.',
  ],
]

describe('verify-next-sharp-compatibility', () => {
  it('accepts the exact supported Next, ESLint, and Sharp identity', () => {
    expect(verifyNextSharpCompatibility(createValidContract())).toEqual({
      nextVersion: '16.3.3',
      eslintConfigNextVersion: '16.3.3',
      sharpVersion: '0.35.3',
    })
  })

  it.each(invalidCases)('rejects %s', (_caseName, mutate, expectedMessage) => {
    const fixture = createValidContract()
    mutate(fixture)

    expect(() => verifyNextSharpCompatibility(fixture)).toThrow(expectedMessage)
  })
})
