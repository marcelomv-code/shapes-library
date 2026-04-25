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

# Resolve env:TEMP defensively. On some hosts the inherited environment for
# child PS processes loses TEMP, in which case Join-Path produces an unrooted
# path that New-Item then anchors to PWD - which has been the user's home in
# at least one observed run, breaking the cleanup at the end of the script.
$tempRoot = $env:TEMP
if (-not $tempRoot) { $tempRoot = $env:TMP }
if (-not $tempRoot) { $tempRoot = [System.IO.Path]::GetTempPath() }

$tmp = Join-Path $tempRoot ("libexp_" + [guid]::NewGuid().ToString())
Write-Host "EXPORT-START: tempRoot=$tempRoot tmp=$tmp dest=$Dest"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

if (Test-Path (Join-Path $Root 'shapes')) { Copy-Item (Join-Path $Root 'shapes') -Destination (Join-Path $tmp 'shapes') -Recurse -Force }
if (Test-Path (Join-Path $Root 'assets')) { Copy-Item (Join-Path $Root 'assets') -Destination (Join-Path $tmp 'assets') -Recurse -Force }
if (Test-Path (Join-Path $Root 'native')) { Copy-Item (Join-Path $Root 'native') -Destination (Join-Path $tmp 'native') -Recurse -Force }
if (Test-Path (Join-Path $Root 'library_deck.pptx')) { Copy-Item (Join-Path $Root 'library_deck.pptx') -Destination $tmp -Force }

# PS 5.1 Compress-Archive writes entries with backslash separators in
# violation of the ZIP spec (entries should use forward slash). The .NET
# ZipFile.CreateFromDirectory API writes spec-compliant forward-slash entries,
# which means the round-trip through our own importLibraryZip + zipSafety
# guard works without normalization workarounds at the consumer side.
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $Dest) { Remove-Item $Dest -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($tmp, $Dest, [System.IO.Compression.CompressionLevel]::Optimal, $false)
if (-not (Test-Path $Dest)) { throw "ZipFile.CreateFromDirectory did not produce $Dest" }

# Report success BEFORE the cleanup so a stray Remove-Item failure (PS sometimes
# loses the temp folder mid-run on antivirus-scanned hosts) does not flag the
# whole export as broken when the zip is already on disk.
Write-Output "OK:$Dest"
try {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
} catch {
    Write-Host "EXPORT-CLEANUP-WARN: $($_.Exception.Message)"
}
