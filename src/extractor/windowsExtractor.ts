/**
 * Windows PowerPoint shape extractor using COM automation (spawn + temp file)
 */

import { spawn } from "child_process";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ExtractedShape, ExtractionResult } from "./types";
import { getPreferenceValues } from "@raycast/api";
import { getNativeDir, getLibraryRoot } from "../utils/paths";

/**
 * Extract selected shape from PowerPoint (reliable spawn approach)
 */
export async function extractSelectedShapeWindows(): Promise<ExtractionResult> {
  const prefs = getPreferenceValues<{ skipNativeSave?: boolean; templatePath?: string }>();
  // Prepare native output path inside Raycast assets
  const supportPath = getLibraryRoot();
  const nativeDir = getNativeDir();
  try {
    if (!existsSync(nativeDir)) mkdirSync(nativeDir, { recursive: true });
  } catch {}
  const ts = Date.now();
  const relNative = `native/shape_captured_${ts}.pptx`;
  const absNative = join(supportPath, "native", `shape_captured_${ts}.pptx`);
  const psDest = absNative.replace(/'/g, "''");
  const templatePath = prefs.templatePath?.trim() || "";
  const psTemplatePath = templatePath.replace(/'/g, "''");
  const script = `
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
    $skipNative = $false
    Write-Host "STEP8a: Saving native PPTX for accurate color preservation"
    if ($true) {
        try {
            $destPath = '${psDest}'
            $destDir = Split-Path -Parent $destPath
            if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }

            Write-Host "STEP8a: Creating presentation from template or default"
            # Use template if provided, otherwise create blank presentation
            $templatePath = '${psTemplatePath}'
            if ($templatePath -and (Test-Path $templatePath)) {
                Write-Host "STEP8a1: Opening template: $templatePath"
                $new = $ppt.Presentations.Open($templatePath, $true, $false, $false)
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
              Copy-Item -Path $tmpNative -Destination $destPath -Force
            } catch {
              Write-Host "STEP8e: Copy to target failed: $($_.Exception.Message)"
            }
            try { Remove-Item -Path $tmpNative -ErrorAction SilentlyContinue } catch {}
            $data['nativePptxRelPath'] = '${relNative}'
            Write-Host "STEP8d: Native PPTX saved (theme from template or default)"
        } catch {
            Write-Host "STEP8e: Native save failed: $($_.Exception.Message)"
        }
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
`;

  const tempScriptPath = join(tmpdir(), `raycast-capture-${Date.now()}.ps1`);

  return new Promise((resolve) => {
    try {
      writeFileSync(tempScriptPath, script, "utf-8");
    } catch (writeError) {
      resolve({ success: false, error: `Failed to create temp script: ${writeError}` });
      return;
    }

    const ps = spawn("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      tempScriptPath,
    ]);

    let stdout = "";
    let stderr = "";
    const logs: string[] = [];
    let killTimer: NodeJS.Timeout | null = null;
    const setKill = (ms: number) => {
      try {
        if (killTimer) clearTimeout(killTimer);
      } catch {}
      killTimer = setTimeout(() => {
        try {
          ps.kill();
        } catch {}
      }, ms);
    };
    setKill(30000);

    ps.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      const trimmed = text.trim();
      console.log("[PowerShell STDOUT]:", trimmed);
      // Split into lines and record for UI
      for (const line of text.split(/\r?\n/)) {
        const l = line.trim();
        if (l.length > 0) logs.push(l);
      }
      if (trimmed.includes("STEP8a: Creating hidden presentation")) setKill(45000);
      if (trimmed.includes("STEP8b:")) setKill(60000);
    });
    ps.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      const trimmed = text.trim();
      console.error("[PowerShell STDERR]:", trimmed);
      if (trimmed.length > 0) logs.push(`[stderr] ${trimmed}`);
    });

    ps.on("error", (error) => {
      cleanup();
      resolve({ success: false, error: `Failed to spawn PowerShell: ${error.message}` });
    });

    // kill timer handled via setKill above

    ps.on("close", (code) => {
      try {
        if (killTimer) clearTimeout(killTimer);
      } catch {}
      cleanup();

      if (code !== 0 && code !== null) {
        // Try to find an ERROR line anywhere in stdout
        const out = stdout.trim();
        const errLine = out.split("\n").find((l) => l.trim().startsWith("ERROR:"));
        if (errLine) {
          return resolve({ success: false, error: errLine.trim().replace(/^ERROR:/, ""), logs, stdout, stderr });
        }
        return resolve({
          success: false,
          error: `PowerShell failed (${code}). ${stderr || out}`,
          logs,
          stdout,
          stderr,
        });
      }

      const output = stdout.trim();
      const jsonLine = output.split("\n").find((l) => l.trim().startsWith("{"));
      if (!jsonLine) {
        console.error("No JSON found. Full output:", output);
        return resolve({ success: false, error: "No JSON data in PowerShell output", logs, stdout, stderr });
      }

      try {
        const data = JSON.parse(jsonLine);
        const shape: ExtractedShape = {
          name: data.name || "Unnamed",
          type: data.type || 1,
          autoShapeName: data.autoShapeName,
          position: { x: data.left || 1, y: data.top || 1 },
          size: { width: data.width || 2, height: data.height || 2 },
          rotation: typeof data.rotation === "number" ? data.rotation : 0,
          adjustments: Array.isArray(data.adjustments) ? data.adjustments : undefined,
          nativePptxRelPath: typeof data.nativePptxRelPath === "string" ? data.nativePptxRelPath : undefined,
          isGroup: data.isGroup === true,
          isPicture: data.isPicture === true,
          pngTempPath: typeof data.pngTempPath === "string" ? data.pngTempPath : undefined,
          fill: {
            color: data.fillColor,
            transparency: data.fillTransparency,
          },
          line: {
            color: data.lineColor,
            weight: typeof data.lineWeight === "number" ? data.lineWeight : 1,
            transparency: data.lineTransparency,
          },
        };

        resolve({ success: true, shape, logs, stdout, stderr });
      } catch (e) {
        resolve({ success: false, error: `Failed to parse JSON: ${e}`, logs, stdout, stderr });
      }
    });

    function cleanup() {
      try {
        if (existsSync(tempScriptPath)) unlinkSync(tempScriptPath);
      } catch {}
    }
  });
}
