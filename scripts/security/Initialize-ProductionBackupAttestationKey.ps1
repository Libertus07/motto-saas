[CmdletBinding()]
param(
    [string]$KeyBase64 = $env:PRODUCTION_BACKUP_ATTESTATION_KEY,
    [string]$KeyPath = (Join-Path $env:LOCALAPPDATA 'MottoSaaS\production-backup-attestation-key.dpapi')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

if ([string]::IsNullOrWhiteSpace($KeyBase64)) {
    throw 'PRODUCTION_BACKUP_ATTESTATION_KEY must contain the approved base64 key.'
}

try {
    $keyBytes = [Convert]::FromBase64String($KeyBase64)
} catch {
    throw 'The backup attestation key is not valid base64.'
}

if ($keyBytes.Length -lt 32) {
    [Array]::Clear($keyBytes, 0, $keyBytes.Length)
    throw 'The backup attestation key must contain at least 32 bytes.'
}

if (Test-Path -LiteralPath $KeyPath) {
    [Array]::Clear($keyBytes, 0, $keyBytes.Length)
    throw "A protected backup attestation key already exists at $KeyPath. Rotate it explicitly instead of overwriting it."
}

$keyDirectory = Split-Path -Parent $KeyPath
[IO.Directory]::CreateDirectory($keyDirectory) | Out-Null

try {
    $protectedBytes = [System.Security.Cryptography.ProtectedData]::Protect(
        $keyBytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [IO.File]::WriteAllBytes($KeyPath, $protectedBytes)
    Write-Output "Protected backup attestation key stored for the current Windows user at $KeyPath."
} finally {
    if ($null -ne $protectedBytes) {
        [Array]::Clear($protectedBytes, 0, $protectedBytes.Length)
    }
    [Array]::Clear($keyBytes, 0, $keyBytes.Length)
}
