<#
.SYNOPSIS
  Copy the shapes of $DeckPath slide #$SlideIndex and paste them into the
  active PowerPoint window.

.DESCRIPTION
  Originally inlined in src/utils/deck.ts:insertFromDeckIntoActive (Phase 4).
  Requires PowerPoint to already be running with at least one open
  presentation. Filters placeholder/copyright shapes. Emits 'OK' on
  success; 'ERROR:<msg>' on failure. The initial "No presentation is open"
  guard prints WITHOUT an exit-code change -- matches legacy behavior where
  the TS caller parses the ERROR: prefix regardless of exit.
#>
param(
  [Parameter(Mandatory = $true)][string]$DeckPath,
  [Parameter(Mandatory = $true)][int]$SlideIndex
)

$ErrorActionPreference = "Stop"
try {
  $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
  $app.DisplayAlerts = 0
  if ($app.Presentations.Count -eq 0) { "ERROR:No presentation is open"; exit 1 }
  $dest = $app.ActiveWindow.View.Slide
  if ($null -eq $dest) { $dest = $app.ActivePresentation.Slides.Item(1) }
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
  $dest.Shapes.Paste() | Out-Null
  $d.Close()
  'OK'
} catch { "ERROR:$($_.Exception.Message)"; exit 1 }
