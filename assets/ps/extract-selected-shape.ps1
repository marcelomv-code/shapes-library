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

    $isWholeSlide = $false
    $sourceSlide = $null
    if ($selection.Type -eq 2) {
        # Shape selection (existing path)
        $isWholeSlide = $false
    } else {
        # No shape selection: fall back to the active slide so the command
        # works whether the user is in Slide Sorter (Type=3), editing text
        # (Type=1), or clicked a thumbnail in Normal view (Selection unchanged).
        # Avoids the ShapeRange.Copy clipboard path entirely, using
        # Slide.Copy + Slides.Paste which preserves SVG/Icon shapes.
        $isWholeSlide = $true
        if ($selection.Type -eq 3) {
            Write-Host "STEP4a: Whole slide selected (Slide Sorter)"
            $sourceSlide = $selection.SlideRange.Item(1)
        } else {
            Write-Host "STEP4a: No shape selected (Selection.Type=$([int]$selection.Type)) - capturing active slide"
            try {
                $sourceSlide = $ppt.ActiveWindow.View.Slide
            } catch {
                Write-Output "ERROR:Could not resolve active slide ($($_.Exception.Message)). Select a shape, or navigate to a slide in Normal view."
                exit 1
            }
        }
        if ($sourceSlide -eq $null) {
            Write-Output "ERROR:Active slide is null. Open a presentation with at least one slide."
            exit 1
        }
    }

    if ($isWholeSlide) {
        Write-Host "STEP5: Whole-slide path - synthesizing slide-level data"
        $shapeCount = $sourceSlide.Shapes.Count
        $isGroupOrMulti = $true
        $shapeTypeVal = 0
        $shape = $null
        $range = $null
        $data = @{}
        $data['isGroup'] = $true
        $data['name'] = "Slide " + [int]$sourceSlide.SlideIndex
        $data['type'] = 0
        try {
            $pageSetup = $ppt.ActivePresentation.PageSetup
            $data['left'] = 0
            $data['top'] = 0
            $data['width'] = [math]::Round($pageSetup.SlideWidth / 72, 3)
            $data['height'] = [math]::Round($pageSetup.SlideHeight / 72, 3)
        } catch {
            $data['left'] = 0; $data['top'] = 0; $data['width'] = 10; $data['height'] = 7.5
        }
        $data['rotation'] = 0
        $data['adjustments'] = @()
        Write-Host "STEP5a: Whole slide has $shapeCount shapes"
    } else {
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
    } # end else (shape-selection branch)

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
        if ($isWholeSlide) {
            # Whole-slide capture: always start blank and skip the template.
            # Slides.Paste preserves source theme/master/layout intrinsically,
            # so a destination template would only conflict.
            Write-Host "STEP8a1: Whole-slide capture - blank presentation (source theme preserved by Slides.Paste)"
            $new = $ppt.Presentations.Add(0)
            # Defensive: drain any default slides Add() might have created.
            while ($new.Slides.Count -gt 0) { $new.Slides.Item(1).Delete() }
        } elseif ($TemplatePath -and (Test-Path $TemplatePath)) {
            Write-Host "STEP8a1: Opening template: $TemplatePath"
            $new = $ppt.Presentations.Open($TemplatePath, $true, $false, $false)
            Write-Host "STEP8a1: Template opened successfully - using company theme!"
        } else {
            Write-Host "STEP8a1: No template provided, creating blank presentation with Office default theme"
            $new = $ppt.Presentations.Add(0)
        }

        if ($isWholeSlide) {
            Write-Host "STEP8a3: Cloning entire slide via Slide.Copy + Slides.Paste"
            $sourceSlide.Copy()
            Start-Sleep -Milliseconds 200
            $new.Slides.Paste(1) | Out-Null
            $clonedCount = 0
            try { $clonedCount = [int]$new.Slides.Item(1).Shapes.Count } catch {}
            if ($clonedCount -lt $shapeCount) {
                Write-Host "STEP8a3-warn: Cloned slide has $clonedCount of $shapeCount source shapes"
            }
            Write-Host "STEP8a3: Slide cloned successfully ($clonedCount shapes)"
        } else {
            Write-Host "STEP8a2: Adding blank slide"
            $slide = $new.Slides.Add(1, 12) # ppLayoutBlank

            Write-Host "STEP8a3: Pasting selected shape"
            # Multi/group: use Selection.Copy (canonical Ctrl+C path) to preserve
            # SVG/Icon shapes (msoGraphic) and detached connectors that
            # ShapeRange.Copy silently drops. Single shape keeps Shape.Copy.
            if ($isGroupOrMulti) { $selection.Copy() } else { $shape.Copy() }
            # Clipboard population race: PowerPoint COM occasionally returns from
            # Copy() before the OLE clipboard is ready, especially for large
            # multi-selections. A short wait makes Paste deterministic.
            Start-Sleep -Milliseconds 150
            $pasted = $slide.Shapes.Paste()
            $pastedCount = 0
            try { $pastedCount = [int]$pasted.Count } catch {}
            if ($isGroupOrMulti -and $pastedCount -lt $shapeCount) {
                Write-Host "STEP8a3-warn: Pasted $pastedCount of $shapeCount selected shapes (some shape types may not survive clipboard round-trip)"
            }
            Write-Host "STEP8a3: Shape pasted successfully ($pastedCount shapes)"
        }
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
