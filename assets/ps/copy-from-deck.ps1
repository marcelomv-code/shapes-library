<#
.SYNOPSIS
  Copy the shapes of $DeckPath slide #$SlideIndex to the Windows clipboard.

.DESCRIPTION
  Originally inlined in src/utils/deck.ts:copyFromDeckToClipboard (Phase 4).
  Filters placeholder/copyright shapes so only user content lands on the
  clipboard. Emits 'OK' on success and 'ERROR:<msg>' on failure.
#>
param(
  [Parameter(Mandatory = $true)][string]$DeckPath,
  [Parameter(Mandatory = $true)][int]$SlideIndex
)

$ErrorActionPreference = "Stop"
try {
  $created = $false
  try { $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') } catch { $app = New-Object -ComObject PowerPoint.Application; $created = $true }
  $app.DisplayAlerts = 0
  $d = $app.Presentations.Open($DeckPath, $true, $false, $false)
  $sl = $d.Slides.Item($SlideIndex)
  # Filter out footer/slide number/date placeholders and copyright text
  $validNames = @()
  foreach ($shape in $sl.Shapes) {
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
  if ($validNames.Count -gt 0) { $sl.Shapes.Range($validNames).Copy() }
  $d.Close()
  'OK'
} catch { "ERROR:$($_.Exception.Message)"; exit 1 }
