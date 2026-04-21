<#
.SYNOPSIS
  Expand $Zip into the library root $Dest.

.DESCRIPTION
  Originally inlined in src/shape-picker.tsx:importLibraryZip (Phase 4).
  Writes 'OK:<dest>' on success. Caller validates with /^OK:/m on stdout.
  The alternate simpler unzip.ps1 exists because import-library.tsx's own
  flow doesn't need the OK sentinel -- keeping both avoids coupling the
  two call sites.
#>
param(
  [Parameter(Mandatory = $true)][string]$Zip,
  [Parameter(Mandatory = $true)][string]$Dest
)

$ErrorActionPreference = "Stop"
Expand-Archive -LiteralPath $Zip -DestinationPath $Dest -Force
Write-Output "OK:$Dest"
