export type Ops02Stage = 'test' | 'production'

export interface Ops02FoundationConfig {
  readonly stage: Ops02Stage
  readonly account: string
  readonly region: `eu-${string}`
  readonly securityPrincipalArn: string
  readonly verificationPrincipalArn: string
  readonly recoveryPrincipalArn: string
  readonly dailyRetentionDays: 90
  readonly monthlyRetentionDays: 365
}

export const OPS02_RETENTION: {
  readonly dailyDays: 90
  readonly monthlyDays: 365
} = Object.freeze({ dailyDays: 90, monthlyDays: 365 })

function readContextString(input: Readonly<Record<string, unknown>>, field: string): string {
  const descriptor = Object.getOwnPropertyDescriptor(input, field)
  if (!descriptor?.enumerable || typeof descriptor.value !== 'string') {
    throw new Error(`${field}: kendi numaralandırılabilir dize değeri gerekli`)
  }
  return descriptor.value.trim()
}

function readPrincipalArn(input: Readonly<Record<string, unknown>>, field: string, account: string): string {
  const value = readContextString(input, field)
  const match = /^arn:aws:iam::([0-9]{12}):role\/(?:[A-Za-z0-9+=,.@_-]+\/)*[A-Za-z0-9+=,.@_-]+$/.exec(value)
  if (!match) {
    throw new Error(`${field}: geçerli IAM rol ARN değeri gerekli`)
  }
  if (match[1] !== account) {
    throw new Error(`${field}: rol yapılandırılan AWS hesabına ait olmalı`)
  }
  return value
}

export function parseOps02FoundationConfig(input: Readonly<Record<string, unknown>>): Ops02FoundationConfig {
  const stage = readContextString(input, 'stage')
  if (stage !== 'test' && stage !== 'production') {
    throw new Error('stage: test veya production gerekli')
  }

  const account = readContextString(input, 'account')
  if (!/^[0-9]{12}$/.test(account)) {
    throw new Error('account: 12 haneli AWS hesap kimliği gerekli')
  }

  const region = readContextString(input, 'region')
  if (!region.startsWith('eu-')) {
    throw new Error('region: eu- ile başlayan AWS bölgesi gerekli')
  }

  const securityPrincipalArn = readPrincipalArn(input, 'securityPrincipalArn', account)
  const verificationPrincipalArn = readPrincipalArn(input, 'verificationPrincipalArn', account)
  const recoveryPrincipalArn = readPrincipalArn(input, 'recoveryPrincipalArn', account)
  if (stage === 'production') {
    if (verificationPrincipalArn === securityPrincipalArn) {
      throw new Error('verificationPrincipalArn: üretim görevleri farklı rol ARN değerleri gerektirir')
    }
    if (recoveryPrincipalArn === securityPrincipalArn || recoveryPrincipalArn === verificationPrincipalArn) {
      throw new Error('recoveryPrincipalArn: üretim görevleri farklı rol ARN değerleri gerektirir')
    }
  }

  return {
    stage,
    account,
    region: region as `eu-${string}`,
    securityPrincipalArn,
    verificationPrincipalArn,
    recoveryPrincipalArn,
    dailyRetentionDays: OPS02_RETENTION.dailyDays,
    monthlyRetentionDays: OPS02_RETENTION.monthlyDays,
  }
}
