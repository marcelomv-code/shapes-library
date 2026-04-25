<#
.SYNOPSIS
  Compact the library deck in place by reopening and SaveAs-ing through
  PowerPoint. Reduces size when the deck has accumulated orphan media
  refs / revision metadata after many capture cycles.

.DESCRIPTION
  Phase 15. Opens $DeckPath read-only, saves to $TempPath using
  ppSaveAsOpenXMLPresentation (enum 24), then closes both handles.
  The TS caller is responsible for swapping the temp file over the
  original atomically (moves happen on the Windows filesystem, which
  is orders of magnitude faster from node than via COM).

  Emits 'OK:<slideCount>|<bytes>' on success and 'ERROR:<msg>' on
  failure. The counts refer to the freshly-saved deck — the slide
  count is preserved from the source, the byte count is what the
  caller will see after the move.
#>
param(
  [Parameter(Mandatory = $true)][string]$DeckPath,
  [Parameter(Mandatory = $true)][string]$TempPath
)

$ErrorActionPreference = "Stop"
try {
  if (-not (Test-Path $DeckPath)) { "ERROR:Deck not found: $DeckPath"; exit 1 }
  $created = $false
  try { $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') } catch { $app = New-Object -ComObject PowerPoint.Application; $created = $true }
  $app.DisplayAlerts = 0

  $p = $app.Presentations.Open($DeckPath, $true, $false, $false)
  $slideCount = $p.Slides.Count
  $p.SaveAs($TempPath, 24)
  $p.Close()
  if ($created) { try { $app.Quit() } catch {} }

  if (-not (Test-Path $TempPath)) { "ERROR:Temp deck was not produced"; exit 1 }
  $bytes = (Get-Item $TempPath).Length
  "OK:$slideCount|$bytes"
} catch { "ERROR:$($_.Exception.Message)"; exit 1 }
