<#
.SYNOPSIS
  Open $PptxPath and copy slide-1 shapes to the Windows clipboard.

.DESCRIPTION
  Originally inlined in src/shape-picker.tsx:runCopyViaPowerPoint (Phase 4).
  Attempts to attach to a running PowerPoint COM server; falls back to
  creating one if none is found (the presentation window stays hidden).
  Filters placeholder footers and copyright-marked text to match the other
  shape-copy flows. Emits 'OK' on success, 'ERROR:<msg>' on failure.
#>
param(
  [Parameter(Mandatory = $true)][string]$PptxPath
)

$ErrorActionPreference = "Stop"
try {
  $created = $false
  try { $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') } catch { $app = New-Object -ComObject PowerPoint.Application; $created = $true }
  $app.DisplayAlerts = 0
  $pres = $app.Presentations.Open($PptxPath, $true, $false, $false)
  $slide = $pres.Slides.Item(1)
  # Filter out footer/slide number/date placeholders and copyright text
  $validNames = @()
  foreach ($shape in $slide.Shapes) {
    $skip = $false
    try {
      $phType = $shape.PlaceholderFormat.Type
      if ($phType -eq 6 -or $phType -eq 13 -or $phType -eq 16) { $skip = $true }
    } catch {}
    if (-not $skip) {
      try {
        $txt = $shape.TextFrame.TextRange.Text
        if ($txt -match 'Copyright|©') { $skip = $true }
      } catch {}
    }
    if (-not $skip) { $validNames += $shape.Name }
  }
  if ($validNames.Count -gt 0) { $slide.Shapes.Range($validNames).Copy() }
  $pres.Close()
  Write-Output 'OK'
} catch {
  Write-Output "ERROR:$($_.Exception.Message)"; exit 1
}
