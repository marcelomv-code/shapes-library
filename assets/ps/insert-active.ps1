<#
.SYNOPSIS
  Copy all shapes from slide 1 of $SrcPptx into the active PowerPoint window.

.DESCRIPTION
  Originally inlined in src/generator/pptxGenerator.ts (Phase 4 extraction).
  Protocol: writes exactly one 'OK' on success, or 'ERROR:<message>' + exit 1
  on failure (legacy sentinel honored by src/infra/powershell/runner.ts).
  Filters out placeholder footers/dates/slide numbers (types 6/13/16) and any
  shape whose text matches 'Copyright' or '©' so captured decks don't inject
  template boilerplate into the user's active slide.
#>
param(
  [Parameter(Mandatory = $true)][string]$SrcPptx
)

$ErrorActionPreference = "Stop"
try {
  $ppt = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
  if ($ppt.Presentations.Count -eq 0) { Write-Output 'ERROR:No presentation is open'; exit 1 }
  $dest = $ppt.ActiveWindow.View.Slide
  if ($null -eq $dest) { $dest = $ppt.ActivePresentation.Slides.Item(1) }

  $src = $ppt.Presentations.Open($SrcPptx, $true, $false, $false)
  $s1 = $src.Slides.Item(1)
  if ($s1.Shapes.Count -eq 0) { Write-Output 'ERROR:Source slide has no shapes'; $src.Close(); exit 1 }
  # Filter out footer/slide number/date placeholders and copyright text
  $validNames = @()
  foreach ($shape in $s1.Shapes) {
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
  if ($validNames.Count -eq 0) { Write-Output 'ERROR:No valid shapes to copy'; $src.Close(); exit 1 }
  $s1.Shapes.Range($validNames).Copy()
  $dest.Shapes.Paste() | Out-Null
  $src.Close()
  Write-Output 'OK'
} catch {
  Write-Output "ERROR:$($_.Exception.Message)"; exit 1
}
