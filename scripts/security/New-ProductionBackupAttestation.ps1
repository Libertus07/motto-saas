[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$BackupFile,

    [Parameter(Mandatory)]
    [ValidatePattern('^[a-fA-F0-9]{40}$')]
    [string]$ReleaseSha,

    [Parameter(Mandatory)]
    [datetime]$BackupCreatedAtUtc,

    [Parameter(Mandatory)]
    [switch]$RestoreVerified,

    [ValidatePattern('^[a-z0-9]{20}$')]
    [string]$ProjectRef = 'zahdmrvhxsmqpeesrfkt',

    [string]$KeyPath = (Join-Path $env:LOCALAPPDATA 'MottoSaaS\production-backup-attestation-key.dpapi')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) {
    throw "Encrypted backup file was not found: $BackupFile"
}

if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
    throw "Protected backup attestation key was not found: $KeyPath"
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$signer = Join-Path $projectRoot 'scripts\security\create-production-backup-attestation.mjs'
$protectedBytes = [IO.File]::ReadAllBytes($KeyPath)
$keyBytes = $null
$previousEnvironment = @{}
$environmentNames = @(
    'BACKUP_FILE',
    'TARGET_PROJECT_REF',
    'RELEASE_SHA',
    'BACKUP_CREATED_AT_UTC',
    'BACKUP_RESTORE_VERIFIED',
    'PRODUCTION_BACKUP_ATTESTATION_KEY'
)

foreach ($name in $environmentNames) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
    $keyBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $protectedBytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )

    $env:BACKUP_FILE = (Resolve-Path -LiteralPath $BackupFile).Path
    $env:TARGET_PROJECT_REF = $ProjectRef
    $env:RELEASE_SHA = $ReleaseSha.ToLowerInvariant()
    $env:BACKUP_CREATED_AT_UTC = $BackupCreatedAtUtc.ToUniversalTime().ToString('o')
    $env:BACKUP_RESTORE_VERIFIED = 'true'
    $env:PRODUCTION_BACKUP_ATTESTATION_KEY = [Convert]::ToBase64String($keyBytes)

    & node $signer
    if ($LASTEXITCODE -ne 0) {
        throw "Backup attestation generation failed with exit code $LASTEXITCODE."
    }
} finally {
    foreach ($name in $environmentNames) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
    if ($null -ne $keyBytes) {
        [Array]::Clear($keyBytes, 0, $keyBytes.Length)
    }
    [Array]::Clear($protectedBytes, 0, $protectedBytes.Length)
}
