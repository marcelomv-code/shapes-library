<#
.SYNOPSIS
  Create the library deck at $DeckPath if missing, optionally theming it
  from $TemplatePath.

.DESCRIPTION
  Originally inlined in src/utils/deck.ts:ensureDeck (Phase 4).
  Attaches to or spawns PowerPoint, builds a 1-slide blank deck, saves it
  as ppSaveAsOpenXMLPresentation (enum 24), and closes. Emits 'OK' on
  success and 'ERROR:<msg>' on failure.

  Passing an empty $TemplatePath skips the template branch -- PowerShell
  boolean-tests an empty string as false.
#>
param(
  [Parameter(Mandatory = $true)][string]$DeckPath,
  [string]$TemplatePath = ''
)

$ErrorActionPreference = "Stop"
try {
  $created = $false
  try { $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') } catch { $app = New-Object -ComObject PowerPoint.Application; $created = $true }
  $app.DisplayAlerts = 0

  # Use template if provided, otherwise create blank presentation
  if ($TemplatePath -and (Test-Path $TemplatePath)) {
    Write-Host "Creating deck from template: $TemplatePath"
    $p = $app.Presentations.Open($TemplatePath, $true, $false, $false)
    Write-Host "Deck will use company theme from template!"
  } else {
    Write-Host "No template provided, creating deck with Office default theme"
    $p = $app.Presentations.Add(0)
  }

  # Add blank slide if presentation doesn't have one
  if ($p.Slides.Count -eq 0) {
    $p.Slides.Add(1, 12) | Out-Null
  }

  $p.SaveAs($DeckPath, 24)
  $p.Close()
  'OK'
} catch { "ERROR:$($_.Exception.Message)"; exit 1 }
