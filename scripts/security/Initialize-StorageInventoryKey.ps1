[CmdletBinding()]
param(
    [string]$KeyBase64 = $env:OPS02_INVENTORY_HMAC_KEY,
    [string]$KeyPath = (Join-Path $env:LOCALAPPDATA 'MottoSaaS\storage-inventory-hmac-key.dpapi')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

if ([string]::IsNullOrWhiteSpace($KeyBase64)) {
    throw 'OPS02_INVENTORY_HMAC_KEY must contain the approved base64 key.'
}

$keyBytes = $null
$protectedBytes = $null
try {
    try {
        $keyBytes = [Convert]::FromBase64String($KeyBase64)
    } catch {
        throw 'The storage inventory key is not valid base64.'
    }

    if ($keyBytes.Length -lt 32) {
        throw 'The storage inventory key must contain at least 32 bytes.'
    }

    if (Test-Path -LiteralPath $KeyPath) {
        throw "A protected storage inventory key already exists at $KeyPath. Rotate it explicitly instead of overwriting it."
    }

    $keyDirectory = Split-Path -Parent $KeyPath
    [IO.Directory]::CreateDirectory($keyDirectory) | Out-Null
    $protectedBytes = [System.Security.Cryptography.ProtectedData]::Protect(
        $keyBytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [IO.File]::WriteAllBytes($KeyPath, $protectedBytes)
    Write-Output "Protected storage inventory key stored for the current Windows user at $KeyPath."
} finally {
    if ($null -ne $protectedBytes) {
        [Array]::Clear($protectedBytes, 0, $protectedBytes.Length)
    }
    if ($null -ne $keyBytes) {
        [Array]::Clear($keyBytes, 0, $keyBytes.Length)
    }
}
