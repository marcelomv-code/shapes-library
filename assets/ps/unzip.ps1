<#
.SYNOPSIS
  Extract $ZipPath into $DestDir using the built-in Expand-Archive cmdlet.

.DESCRIPTION
  Originally inlined in src/import-library.tsx (Phase 4 extraction).
  Creates $DestDir if it doesn't exist. No OK/ERROR sentinel -- callers rely
  on the process exit code alone (Expand-Archive throws on failure thanks to
  $ErrorActionPreference = "Stop", which the runner maps to exit-nonzero).
#>
param(
  [Parameter(Mandatory = $true)][string]$ZipPath,
  [Parameter(Mandatory = $true)][string]$DestDir
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $DestDir)) { New-Item -ItemType Directory -Force -Path $DestDir | Out-Null }
Expand-Archive -LiteralPath $ZipPath -DestinationPath $DestDir -Force
