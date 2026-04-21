<#
.SYNOPSIS
  Compress the shapes library folder tree into a single .zip at $Dest.

.DESCRIPTION
  Originally inlined in src/shape-picker.tsx:exportLibraryZip (Phase 4).
  Staging-folder pattern avoids Compress-Archive quirks with multiple nested
  -Path inputs. Writes 'OK:<dest>' on success and re-throws on failure (the
  runner maps non-zero exit to `exit-nonzero`).

  Optional sub-trees (shapes/, assets/, native/, library_deck.pptx) are
  copied only if present, so partial libraries still export cleanly.
#>
param(
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][string]$Dest
)

$ErrorActionPreference = "Stop"
$tmp = Join-Path $env:TEMP ("libexp_" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
if (Test-Path (Join-Path $Root 'shapes')) { Copy-Item (Join-Path $Root 'shapes') -Destination (Join-Path $tmp 'shapes') -Recurse -Force }
if (Test-Path (Join-Path $Root 'assets')) { Copy-Item (Join-Path $Root 'assets') -Destination (Join-Path $tmp 'assets') -Recurse -Force }
if (Test-Path (Join-Path $Root 'native')) { Copy-Item (Join-Path $Root 'native') -Destination (Join-Path $tmp 'native') -Recurse -Force }
if (Test-Path (Join-Path $Root 'library_deck.pptx')) { Copy-Item (Join-Path $Root 'library_deck.pptx') -Destination $tmp -Force }
Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $Dest -Force
Remove-Item $tmp -Recurse -Force
Write-Output "OK:$Dest"
