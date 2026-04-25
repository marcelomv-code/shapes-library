<#
.SYNOPSIS
  Enumerate entries in $Zip without extracting.

.DESCRIPTION
  Phase 12 pre-extraction inspector. Emits one line per entry in the format

      <UncompressedBytes>|<FullName>

  plus a final `OK:<count>` sentinel. Directory entries (FullName ending in '/')
  carry size 0. Failures emit `ERROR:<msg>` and exit non-zero.

  Relies on [System.IO.Compression.ZipFile]::OpenRead (built into PowerShell 5+).
  Read-only — the archive is never extracted by this script.
#>
param(
  [Parameter(Mandatory = $true)][string]$Zip
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Zip)) {
  Write-Output "ERROR:Zip not found: $Zip"
  exit 1
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = $null
try {
  $archive = [System.IO.Compression.ZipFile]::OpenRead($Zip)
  $count = 0
  foreach ($entry in $archive.Entries) {
    # $entry.Length is the uncompressed size (zero for directory entries).
    $line = "{0}|{1}" -f $entry.Length, $entry.FullName
    Write-Output $line
    $count++
  }
  Write-Output ("OK:{0}" -f $count)
}
catch {
  Write-Output ("ERROR:" + $_.Exception.Message)
  exit 1
}
finally {
  if ($archive) { $archive.Dispose() }
}
