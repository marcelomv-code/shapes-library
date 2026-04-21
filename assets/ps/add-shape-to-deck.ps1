<#
.SYNOPSIS
  Append slide 1 of $SrcPptx as a new slide in $DeckPath and return its
  1-based index.

.DESCRIPTION
  Originally inlined in src/utils/deck.ts:addShapeToDeckFromPptx (Phase 4).
  Emits 'OK:<slideIndex>' on success and 'ERROR:<msg>' on failure. The TS
  caller parses with /^OK:(\d+)/ so extra trailing whitespace is tolerated.
#>
param(
  [Parameter(Mandatory = $true)][string]$DeckPath,
  [Parameter(Mandatory = $true)][string]$SrcPptx
)

$ErrorActionPreference = "Stop"
try {
  $created = $false
  try { $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') } catch { $app = New-Object -ComObject PowerPoint.Application; $created = $true }
  $app.DisplayAlerts = 0
  $d = $app.Presentations.Open($DeckPath, $true, $false, $false)
  $s = $d.Slides.Add($d.Slides.Count + 1, 12)
  $p = $app.Presentations.Open($SrcPptx, $true, $false, $false)
  $p.Slides.Item(1).Shapes.Range().Copy()
  $s.Shapes.Paste() | Out-Null
  $p.Close()
  $d.Save()
  $idx = $s.SlideIndex
  "OK:$idx"
} catch { "ERROR:$($_.Exception.Message)"; exit 1 }
