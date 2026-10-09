import { describe, expect, it } from 'vitest'
import { OPS02_RETENTION, parseOps02FoundationConfig } from '../src/config.js'

const offlineConfig = {
  stage: 'test',
  account: '111111111111',
  region: 'eu-central-1',
  securityPrincipalArn: 'arn:aws:iam::111111111111:role/Ops02Security',
  verificationPrincipalArn: 'arn:aws:iam::111111111111:role/Ops02Verification',
  recoveryPrincipalArn: 'arn:aws:iam::111111111111:role/Ops02Recovery',
}

describe('parseOps02FoundationConfig', () => {
  it('normalizes a complete offline test configuration', () => {
    const input = Object.fromEntries(Object.entries(offlineConfig).map(([key, value]) => [key, ` ${value} `]))

    expect(parseOps02FoundationConfig(input)).toEqual({
      stage: 'test',
      account: '111111111111',
      region: 'eu-central-1',
      securityPrincipalArn: 'arn:aws:iam::111111111111:role/Ops02Security',
      verificationPrincipalArn: 'arn:aws:iam::111111111111:role/Ops02Verification',
      recoveryPrincipalArn: 'arn:aws:iam::111111111111:role/Ops02Recovery',
      dailyRetentionDays: 90,
      monthlyRetentionDays: 365,
      auditRetentionDays: 365,
    })
    expect(input.stage).toBe(' test ')
  })

  it.each(['', '123', '1234567890123'])('rejects malformed account %s', (account) => {
    expect(() => parseOps02FoundationConfig({ ...offlineConfig, account })).toThrowError(
      /^account: 12 haneli AWS hesap kimliği gerekli$/,
    )
  })

  it.each(['us-east-1', 'ap-southeast-1', ''])('rejects non-EU region %s', (region) => {
    expect(() => parseOps02FoundationConfig({ ...offlineConfig, region })).toThrowError(
      /^region: eu- ile başlayan AWS bölgesi gerekli$/,
    )
  })

  it('rejects a trusted principal from another AWS account', () => {
    expect(() =>
      parseOps02FoundationConfig({
        ...offlineConfig,
        securityPrincipalArn: 'arn:aws:iam::222222222222:role/PrivatePrincipal',
      }),
    ).toThrowError(/^securityPrincipalArn: rol yapılandırılan AWS hesabına ait olmalı$/)
  })

  it('rejects duplicate production duty principals', () => {
    expect(() =>
      parseOps02FoundationConfig({
        ...offlineConfig,
        stage: 'production',
        recoveryPrincipalArn: ` ${offlineConfig.securityPrincipalArn} `,
      }),
    ).toThrowError(/^recoveryPrincipalArn: üretim görevleri farklı rol ARN değerleri gerektirir$/)
  })

  it('rejects a production verification principal shared with security', () => {
    expect(() =>
      parseOps02FoundationConfig({
        ...offlineConfig,
        stage: 'production',
        verificationPrincipalArn: offlineConfig.securityPrincipalArn,
      }),
    ).toThrowError(/^verificationPrincipalArn: üretim görevleri farklı rol ARN değerleri gerektirir$/)
  })

  it('rejects a production recovery principal shared with verification', () => {
    expect(() =>
      parseOps02FoundationConfig({
        ...offlineConfig,
        stage: 'production',
        recoveryPrincipalArn: offlineConfig.verificationPrincipalArn,
      }),
    ).toThrowError(/^recoveryPrincipalArn: üretim görevleri farklı rol ARN değerleri gerektirir$/)
  })

  it('pins daily and monthly retention to 90 and 365 days', () => {
    const result = parseOps02FoundationConfig({
      ...offlineConfig,
      dailyRetentionDays: '1',
      monthlyRetentionDays: '2',
    })

    expect(result.dailyRetentionDays).toBe(90)
    expect(result.monthlyRetentionDays).toBe(365)
    expect(result.auditRetentionDays).toBe(365)
    expect(OPS02_RETENTION).toEqual({ dailyDays: 90, monthlyDays: 365, auditDays: 365 })
  })

  it('accepts distinct production principals including IAM role paths', () => {
    expect(
      parseOps02FoundationConfig({
        ...offlineConfig,
        stage: 'production',
        recoveryPrincipalArn: 'arn:aws:iam::111111111111:role/ops02/recovery/Ops02Recovery',
      }),
    ).toMatchObject({
      stage: 'production',
      recoveryPrincipalArn: 'arn:aws:iam::111111111111:role/ops02/recovery/Ops02Recovery',
    })
  })

  it('allows a shared synthetic test principal', () => {
    expect(
      parseOps02FoundationConfig({
        ...offlineConfig,
        verificationPrincipalArn: offlineConfig.securityPrincipalArn,
        recoveryPrincipalArn: offlineConfig.securityPrincipalArn,
      }),
    ).toMatchObject({ stage: 'test' })
  })

  it.each(['development', '', 'sensitive-arbitrary-input'])('rejects unsupported stage %s', (stage) => {
    expect(() => parseOps02FoundationConfig({ ...offlineConfig, stage })).toThrowError(
      /^stage: test veya production gerekli$/,
    )
  })

  it.each(['securityPrincipalArn', 'verificationPrincipalArn', 'recoveryPrincipalArn'])(
    'rejects a non-role principal for %s without echoing it',
    (field) => {
      expect(() =>
        parseOps02FoundationConfig({
          ...offlineConfig,
          [field]: 'arn:aws:iam::111111111111:user/PrivatePrincipal',
        }),
      ).toThrowError(new RegExp(`^${field}: geçerli IAM rol ARN değeri gerekli$`))
    },
  )

  describe.each(Object.keys(offlineConfig))('own enumerable string boundary for %s', (field) => {
    it.each(['missing', 'inherited', 'non-enumerable', 'non-string', 'accessor'])(
      'rejects %s context values',
      (kind) => {
        const input: Record<string, unknown> = { ...offlineConfig }
        const value = input[field]
        delete input[field]
        if (kind === 'inherited') Object.setPrototypeOf(input, { [field]: value })
        if (kind === 'non-enumerable') Object.defineProperty(input, field, { value, enumerable: false })
        if (kind === 'non-string') input[field] = 111111111111
        if (kind === 'accessor') {
          Object.defineProperty(input, field, {
            enumerable: true,
            get: () => {
              throw new Error('getter must not execute')
            },
          })
        }

        expect(() => parseOps02FoundationConfig(input)).toThrowError(
          new RegExp(`^${field}: kendi numaralandırılabilir dize değeri gerekli$`),
        )
      },
    )
  })
})
