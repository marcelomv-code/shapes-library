<#
.SYNOPSIS
  Export slide 1 of $PptPath as a 1600x900 PNG at $PngPath.

.DESCRIPTION
  Originally inlined in src/utils/previewGenerator.ts (Phase 4).
  Attaches to a running PowerPoint COM server when possible; if it has to
  create one, the instance is made visible again before returning so the
  user doesn't end up with an orphaned hidden PowerPoint process. Emits
  'OK' on success and 'ERROR:<msg>' on failure.
#>
param(
  [Parameter(Mandatory = $true)][string]$PptPath,
  [Parameter(Mandatory = $true)][string]$PngPath
)

$ErrorActionPreference = "Stop"
try {
  $pngDir = Split-Path -Parent $PngPath
  if (-not (Test-Path $pngDir)) { New-Item -ItemType Directory -Force -Path $pngDir | Out-Null }

  $created = $false
  try { $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') } catch { $app = New-Object -ComObject PowerPoint.Application; $created = $true }
  $app.DisplayAlerts = 0
  $pres = $app.Presentations.Open($PptPath, $true, $false, $false)
  $slide = $pres.Slides.Item(1)
  $slide.Export($PngPath, 'PNG', 1600, 900)
  $pres.Close()
  if ($created) { $app.Visible = $true }
  Write-Output 'OK'
} catch {
  Write-Output "ERROR:$($_.Exception.Message)"; exit 1
}
