[CmdletBinding()]
param(
    [string]$DatabaseUrl = $env:OPS02_DATABASE_URL,

    [Parameter(Mandatory)]
    [string]$OutputFile,

    [Parameter(Mandatory)]
    [datetime]$CapturedAtUtc,

    [ValidatePattern('^[a-z0-9]{20}$')]
    [string]$ProjectRef = 'zahdmrvhxsmqpeesrfkt',

    [string]$KeyPath = (Join-Path $env:LOCALAPPDATA 'MottoSaaS\storage-inventory-hmac-key.dpapi')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    throw 'OPS02_DATABASE_URL must be injected into the current process by the approved secret provider.'
}

if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
    throw "Protected storage inventory key was not found: $KeyPath"
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$inventoryCommand = Join-Path $projectRoot 'scripts\security\create-storage-inventory.mjs'
$protectedBytes = [IO.File]::ReadAllBytes($KeyPath)
$keyBytes = $null
$previousEnvironment = @{}
$environmentNames = @(
    'OPS02_DATABASE_URL',
    'OPS02_TARGET_PROJECT_REF',
    'OPS02_CAPTURED_AT_UTC',
    'OPS02_INVENTORY_HMAC_KEY',
    'OPS02_OUTPUT_FILE'
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
    if ($keyBytes.Length -lt 32) {
        throw 'The protected storage inventory key must contain at least 32 bytes.'
    }

    $env:OPS02_DATABASE_URL = $DatabaseUrl
    $env:OPS02_TARGET_PROJECT_REF = $ProjectRef
    $env:OPS02_CAPTURED_AT_UTC = $CapturedAtUtc.ToUniversalTime().ToString(
        'yyyy-MM-ddTHH:mm:ss.fffZ',
        [Globalization.CultureInfo]::InvariantCulture
    )
    $env:OPS02_INVENTORY_HMAC_KEY = [Convert]::ToBase64String($keyBytes)
    $env:OPS02_OUTPUT_FILE = [IO.Path]::GetFullPath($OutputFile)

    & node $inventoryCommand
    if ($LASTEXITCODE -ne 0) {
        throw "Storage inventory generation failed with exit code $LASTEXITCODE."
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
