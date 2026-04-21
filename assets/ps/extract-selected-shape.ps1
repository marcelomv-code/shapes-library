<#
.SYNOPSIS
  Extract the currently selected PowerPoint shape (or group) as a captured
  shape record and optionally save a native .pptx at $DestPath.

.DESCRIPTION
  Originally inlined in src/extractor/windowsExtractor.ts (Phase 4).
  Emits STEP*-tagged progress lines to stdout -- the TS call site watches
  for them to extend the kill timer during the slow save-native phase
  (STEP8a -> 45s, STEP8b -> 60s). Final line of stdout is a compressed
  JSON object parsed by `ExtractedShape`. On failure, emits 'ERROR:<msg>'
  and exits 1.

  Parameters:
    DestPath    Absolute path where the native .pptx should be written.
                Skipped silently if the save step fails (non-fatal).
    TemplatePath Optional .pptx template whose theme is used for the
                captured deck. If empty or missing, a blank Office-default
                presentation is used instead.
    RelNative   Repo-relative path of the native .pptx, echoed back in
                the JSON result as `nativePptxRelPath` so the caller can
                store a portable reference without re-deriving it.
#>
param(
  [Parameter(Mandatory = $true)][string]$DestPath,
  [string]$TemplatePath = '',
  [Parameter(Mandatory = $true)][string]$RelNative
)

try {
    Write-Host "STEP1: Getting PowerPoint"
    $ppt = [Runtime.InteropServices.Marshal]::GetActiveObject("PowerPoint.Application")
    Write-Host "STEP2: PowerPoint found"
    # Force alerts OFF during automation and restore later
    $prevAlerts = $null
    try { $prevAlerts = $ppt.DisplayAlerts } catch {}
    try { $ppt.DisplayAlerts = 0 } catch {}

    Write-Host "STEP3: Getting selection"
    $selection = $ppt.ActiveWindow.Selection
    Write-Host "STEP4: Selection type: $($selection.Type)"

    if ($selection.Type -ne 2) {
        $selType = [int]$selection.Type
        $selName = switch ($selType) {
            0 { 'None' }
            1 { 'Text' }
            2 { 'Shapes' }
            3 { 'Slides' }
            Default { "Type $selType" }
        }
        Write-Output "ERROR:No shape selected (Selection.Type=$selType $selName). Click the shape border (not the text), ensure only one shape is selected."
        exit 1
    }

    Write-Host "STEP5: Getting shape"
    $range = $selection.ShapeRange
    $shapeCount = $range.Count
    $shape = $range.Item(1)
    $data = @{}
    $shapeTypeVal = [int]$shape.Type
    $isGroupOrMulti = ($shapeTypeVal -eq 6) -or ($shapeCount -gt 1)
    if ($isGroupOrMulti) {
        Write-Host "STEP5a: Detected grouped or multi selection ($shapeCount items)"
        $data['isGroup'] = $true
    }
    if (-not $isGroupOrMulti -and $shapeTypeVal -eq 13) { # msoPicture only when single picture
        Write-Host "STEP5a: Detected picture"
        $data['isPicture'] = $true
        try {
            $tmpPng = Join-Path $env:TEMP ("raycast-cap-" + [guid]::NewGuid().ToString() + ".png")
            # Use a hidden presentation and export the slide to PNG for reliability
            $p2 = $ppt.Presentations.Add(0)
            $s2 = $p2.Slides.Add(1, 12)
            $shape.Copy()
            $s2.Shapes.Paste() | Out-Null
            $s2.Export($tmpPng, 'PNG', 1600, 900)
            try { $p2.Saved = $true } catch {}
            $p2.Close()
            $data['pngTempPath'] = $tmpPng
            Write-Host "STEP5b: Picture exported"
        } catch {
            Write-Host "STEP5b: Picture export failed: $($_.Exception.Message)"
        }
    }
    if (-not $isGroupOrMulti -and $shapeTypeVal -eq 17) { # msoTextBox (single)
        Write-Output "ERROR:Text boxes are not supported. Select a basic shape instead."
        exit 1
    }
    Write-Host "STEP6: Shape name: $($shape.Name)"

    Write-Host "STEP7: Building data"
    # Lightweight map for common AutoShapeType names (avoid loading Office interop types)
    $autoMap = @{
        1 = 'msoShapeRectangle'
        5 = 'msoShapeRoundedRectangle'
        9 = 'msoShapeOval'
        36 = 'msoShapeLeftArrow'
        37 = 'msoShapeDownArrow'
        38 = 'msoShapeUpArrow'
        39 = 'msoShapeRightArrow'
        55 = 'msoShapeChevron'
        109 = 'msoShapeFlowchartProcess'
        110 = 'msoShapeFlowchartAlternateProcess'
        111 = 'msoShapeFlowchartDecision'
        140 = 'msoShapeFlowchartCollate'
        28 = 'msoShapePlaque'
    }

    $data['name'] = $shape.Name
    $data['type'] = [int]$shape.AutoShapeType
    $data['autoShapeName'] = $autoMap[[int]$shape.AutoShapeType]
    $data['left'] = [math]::Round($shape.Left / 72, 3)
    $data['top'] = [math]::Round($shape.Top / 72, 3)
    $data['width'] = [math]::Round($shape.Width / 72, 3)
    $data['height'] = [math]::Round($shape.Height / 72, 3)
    $data['rotation'] = [math]::Round($shape.Rotation, 2)

    # Extract fill properties (skip for pictures and groups)
    if (($shapeTypeVal -ne 13) -and (-not $isGroupOrMulti)) {
        try {
            if ($shape.Fill.Visible -ne 0) {
                if ($shape.Fill.ForeColor) {
                    # Get RGB value - this resolves Theme Colors to absolute RGB in current theme
                    $rgb = $shape.Fill.ForeColor.RGB
                    $r = ($rgb -band 0xFF).ToString("X2")
                    $g = (($rgb -shr 8) -band 0xFF).ToString("X2")
                    $b = (($rgb -shr 16) -band 0xFF).ToString("X2")
                    # Add # prefix for proper hex color format (required by pptxgenjs)
                    $data['fillColor'] = "#$r$g$b"
                }
                if ($shape.Fill.Transparency -ne $null) {
                    $data['fillTransparency'] = [math]::Round($shape.Fill.Transparency, 2)
                }
            }
        } catch {}
    }

    # Extract adjustments
    try {
        $adjs = @()
        $adjCount = $shape.Adjustments.Count
        for ($i = 1; $i -le $adjCount; $i++) {
            $adjs += [math]::Round([double]$shape.Adjustments.Item($i), 3)
        }
        $data['adjustments'] = $adjs
    } catch {}

    # Extract line properties (skip for pictures and groups)
    if (($shapeTypeVal -ne 13) -and (-not $isGroupOrMulti)) {
        try {
        if ($shape.Line.Visible -ne 0) {
                if ($shape.Line.ForeColor) {
                    # Get RGB value - this resolves Theme Colors to absolute RGB in current theme
                    $rgb = $shape.Line.ForeColor.RGB
                    $r = ($rgb -band 0xFF).ToString("X2")
                    $g = (($rgb -shr 8) -band 0xFF).ToString("X2")
                    $b = (($rgb -shr 16) -band 0xFF).ToString("X2")
                    # Add # prefix for proper hex color format (required by pptxgenjs)
                    $data['lineColor'] = "#$r$g$b"
                }
                if ($shape.Line.Weight -ne $null) {
                    $data['lineWeight'] = [math]::Round($shape.Line.Weight, 2)
                }
                if ($shape.Line.Transparency -ne $null) {
                    $data['lineTransparency'] = [math]::Round($shape.Line.Transparency, 2)
                }
            }
        } catch {}
    }

    Write-Host "STEP8: Converting to JSON"
    # Duplicate exact shape into a new presentation and save as PPTX (hidden window)
    # IMPORTANT: ALWAYS save native PPTX to ensure thumbnail colors match original
    # Without native PPTX, thumbnails will use default Office theme colors
    # Ignoring skipNativeSave preference for color accuracy
    Write-Host "STEP8a: Saving native PPTX for accurate color preservation"
    try {
        $destDir = Split-Path -Parent $DestPath
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }

        Write-Host "STEP8a: Creating presentation from template or default"
        # Use template if provided, otherwise create blank presentation
        if ($TemplatePath -and (Test-Path $TemplatePath)) {
            Write-Host "STEP8a1: Opening template: $TemplatePath"
            $new = $ppt.Presentations.Open($TemplatePath, $true, $false, $false)
            Write-Host "STEP8a1: Template opened successfully - using company theme!"
        } else {
            Write-Host "STEP8a1: No template provided, creating blank presentation with Office default theme"
            $new = $ppt.Presentations.Add(0)
        }

        Write-Host "STEP8a2: Adding blank slide"
        $slide = $new.Slides.Add(1, 12) # ppLayoutBlank

        Write-Host "STEP8a3: Pasting selected shape"
        if ($isGroupOrMulti) { $range.Copy() } else { $shape.Copy() }
        $slide.Shapes.Paste() | Out-Null
        Write-Host "STEP8a3: Shape pasted successfully"
        Write-Host "STEP8b: Saving native PPTX (temp)"
        $tmpNative = Join-Path $env:TEMP ("raycast-native-" + [guid]::NewGuid().ToString() + ".pptx")
        $new.SaveAs($tmpNative, 24) # ppSaveAsOpenXMLPresentation
        try { $new.Saved = $true } catch {}
        $new.Close()

        Write-Host "STEP8c: Copying native PPTX to target"
        try {
          Copy-Item -Path $tmpNative -Destination $DestPath -Force
        } catch {
          Write-Host "STEP8e: Copy to target failed: $($_.Exception.Message)"
        }
        try { Remove-Item -Path $tmpNative -ErrorAction SilentlyContinue } catch {}
        $data['nativePptxRelPath'] = $RelNative
        Write-Host "STEP8d: Native PPTX saved (theme from template or default)"
    } catch {
        Write-Host "STEP8e: Native save failed: $($_.Exception.Message)"
    }

    $json = $data | ConvertTo-Json -Compress
    Write-Host "STEP9: Outputting JSON"
    Write-Output $json
    # Restore previous alert level if we changed it
    try { if ($prevAlerts -ne $null) { $ppt.DisplayAlerts = $prevAlerts } } catch {}
    Write-Host "STEP10: Done"

} catch {
    Write-Output "ERROR:$($_.Exception.Message)"
    exit 1
}
