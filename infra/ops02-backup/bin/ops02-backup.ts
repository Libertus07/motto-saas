import { App } from 'aws-cdk-lib'
import { parseOps02FoundationConfig } from '../src/config.js'
import { Ops02FoundationStack } from '../src/ops02-foundation-stack.js'

const app = new App()
const config = parseOps02FoundationConfig({
  stage: app.node.tryGetContext('stage'),
  account: app.node.tryGetContext('account'),
  region: app.node.tryGetContext('region'),
  securityPrincipalArn: app.node.tryGetContext('securityPrincipalArn'),
  verificationPrincipalArn: app.node.tryGetContext('verificationPrincipalArn'),
  recoveryPrincipalArn: app.node.tryGetContext('recoveryPrincipalArn'),
})

new Ops02FoundationStack(app, `Ops02BackupFoundation-${config.stage}`, {
  config,
  env: { account: config.account, region: config.region },
  terminationProtection: true,
})
