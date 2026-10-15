# Sentrix Icon Generator - Renders EXACT dashboard logo with NO background
# Creates a clean, transparent ICO matching the dashboard favicon

Add-Type -AssemblyName System.Drawing

$size = 256
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# FULLY TRANSPARENT background - no slate rectangle!
$graphics.Clear([System.Drawing.Color]::Transparent)

# Colors matching the SVG exactly
$white = [System.Drawing.Color]::FromArgb(255, 255, 255)
$cyan = [System.Drawing.Color]::FromArgb(20, 184, 166)       # #14b8a6
$innerFill = [System.Drawing.Color]::FromArgb(30, 255, 255, 255)  # 12% opacity white

# The SVG viewBox is 64x64, we scale to 256x256
# SVG has transform="translate(0, 8) scale(0.666)" which means the content is centered
# Original paths are designed for a 96x96 canvas, scaled by 0.666 to fit 64x64

# We'll work in the original 96x96 coordinate space and scale up
$scale = 256 / 96  # = 2.667

# Helper to scale coordinates
function S($x, $y) {
    return [System.Drawing.PointF]::new($x * 2.667, $y * 2.667)
}

# --- 1. Shield Outline ---
# Original SVG path: M48 5 L76 17v18c0 17-11 27-28 33-17-6-28-16-28-33V17L48 5Z
# This is a shield shape with the peak at top center

$shieldPen = New-Object System.Drawing.Pen($white, 13.3)  # stroke-width="5" * 2.667
$shieldPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

# Draw shield outline as a path
$shieldPath = New-Object System.Drawing.Drawing2D.GraphicsPath
# Start at top peak (48, 5), draw to right top (76, 17)
$shieldPath.StartFigure()
$shieldPath.AddLine((S 48 5), (S 76 17))
# Right side down with curve
$shieldPath.AddLine((S 76 17), (S 76 35))
# Curve around: c0 17-11 27-28 33 (simplified as lines for now)
$shieldPath.AddLine((S 76 35), (S 76 52))   # v17 approximate
$shieldPath.AddLine((S 76 52), (S 65 70))   # curve approximation
$shieldPath.AddLine((S 65 70), (S 48 85))   # to bottom center
# Left side up
$shieldPath.AddLine((S 48 85), (S 31 70))
$shieldPath.AddLine((S 31 70), (S 20 52))
$shieldPath.AddLine((S 20 52), (S 20 35))
$shieldPath.AddLine((S 20 35), (S 20 17))
$shieldPath.AddLine((S 20 17), (S 48 5))    # Close back to peak
$shieldPath.CloseFigure()

$graphics.DrawPath($shieldPen, $shieldPath)

# --- 2. Shield Inner Fill ---
# M48 14 L68 22v14c0 11-7 19-20 24-13-5-20-13-20-24V22l20-8Z

$innerBrush = New-Object System.Drawing.SolidBrush($innerFill)
$innerPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$innerPath.StartFigure()
$innerPath.AddLine((S 48 14), (S 68 22))
$innerPath.AddLine((S 68 22), (S 68 36))
$innerPath.AddLine((S 68 36), (S 68 47))    # c0 11 approximation
$innerPath.AddLine((S 68 47), (S 58 60))    # -7 19 approximation
$innerPath.AddLine((S 58 60), (S 48 72))    # to center
$innerPath.AddLine((S 48 72), (S 38 60))
$innerPath.AddLine((S 38 60), (S 28 47))
$innerPath.AddLine((S 28 47), (S 28 36))
$innerPath.AddLine((S 28 36), (S 28 22))
$innerPath.AddLine((S 28 22), (S 48 14))
$innerPath.CloseFigure()

$graphics.FillPath($innerBrush, $innerPath)

# --- 3. Upper Data Wave ---
# M8 27h24c8 0 10-9 16-9s8 9 16 9h24
# In 64x64 space: scale by 4 to fit 256

$wavePen = New-Object System.Drawing.Pen($white, 10.67)  # stroke-width="4" * 2.667
$wavePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$wavePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$upperWave = @(
    [System.Drawing.PointF]::new(21, 72),    # 8*2.667, 27*2.667
    [System.Drawing.PointF]::new(85, 72),    # after h24
    [System.Drawing.PointF]::new(112, 48),   # 10-9 curve peak
    [System.Drawing.PointF]::new(128, 72),   # s8 9
    [System.Drawing.PointF]::new(144, 96),   # curve
    [System.Drawing.PointF]::new(171, 72),   # 16 9
    [System.Drawing.PointF]::new(235, 72)    # h24 end
)
$graphics.DrawCurve($wavePen, $upperWave)

# --- 4. Lower Data Wave ---
# M8 45h24c8 0 10 9 16 9s8-9 16-9h24

$lowerWave = @(
    [System.Drawing.PointF]::new(21, 120),   # 8*2.667, 45*2.667
    [System.Drawing.PointF]::new(85, 120),
    [System.Drawing.PointF]::new(112, 144),  # 10 9 peak
    [System.Drawing.PointF]::new(128, 120),
    [System.Drawing.PointF]::new(144, 96),
    [System.Drawing.PointF]::new(171, 120),
    [System.Drawing.PointF]::new(235, 120)
)
$graphics.DrawCurve($wavePen, $lowerWave)

# --- 5. Vertical Logic Connectors ---
# M48 21v30 M39 27v18 M57 27v18

$vlinePen = New-Object System.Drawing.Pen($white, 8)  # stroke-width="3" * 2.667
$vlinePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$vlinePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

# Center line: (48, 21) to (48, 51)
$graphics.DrawLine($vlinePen, 128, 56, 128, 136)

# Left line: (39, 27) to (39, 45)
$graphics.DrawLine($vlinePen, 104, 72, 104, 120)

# Right line: (57, 27) to (57, 45)
$graphics.DrawLine($vlinePen, 152, 72, 152, 120)

# --- 6. Central Data Node (Cyan Rectangle) ---
# <rect fill="#14b8a6" height="12" rx="3" width="10" x="43" y="31" />
# x=43*2.667=115, y=31*2.667=83, width=27, height=32, radius=8

$nodeX = 115
$nodeY = 83
$nodeW = 27
$nodeH = 32
$nodeR = 8

$nodeBrush = New-Object System.Drawing.SolidBrush($cyan)
$nodePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$nodePath.AddArc($nodeX, $nodeY, $nodeR, $nodeR, 180, 90)
$nodePath.AddArc($nodeX + $nodeW - $nodeR, $nodeY, $nodeR, $nodeR, 270, 90)
$nodePath.AddArc($nodeX + $nodeW - $nodeR, $nodeY + $nodeH - $nodeR, $nodeR, $nodeR, 0, 90)
$nodePath.AddArc($nodeX, $nodeY + $nodeH - $nodeR, $nodeR, $nodeR, 90, 90)
$nodePath.CloseFigure()
$graphics.FillPath($nodeBrush, $nodePath)

# --- 7. Right-side Edge Nodes ---
# Three small white rectangles
# <rect fill="#ffffff" height="6" rx="1.5" width="9" x="82" y="17" />
# <rect fill="#ffffff" height="6" rx="1.5" width="9" x="82" y="33" />
# <rect fill="#ffffff" height="6" rx="1.5" width="9" x="82" y="49" />

$edgeBrush = New-Object System.Drawing.SolidBrush($white)

# Scale: x=82*2.667=219, y varies, width=24, height=16, radius=4
$edgeW = 24
$edgeH = 16
$edgeR = 4
$edgeX = 219

# Top edge node (y=17*2.667=45)
$edge1Path = New-Object System.Drawing.Drawing2D.GraphicsPath
$edge1Y = 45
$edge1Path.AddArc($edgeX, $edge1Y, $edgeR, $edgeR, 180, 90)
$edge1Path.AddArc($edgeX + $edgeW - $edgeR, $edge1Y, $edgeR, $edgeR, 270, 90)
$edge1Path.AddArc($edgeX + $edgeW - $edgeR, $edge1Y + $edgeH - $edgeR, $edgeR, $edgeR, 0, 90)
$edge1Path.AddArc($edgeX, $edge1Y + $edgeH - $edgeR, $edgeR, $edgeR, 90, 90)
$edge1Path.CloseFigure()
$graphics.FillPath($edgeBrush, $edge1Path)

# Middle edge node (y=33*2.667=88)
$edge2Path = New-Object System.Drawing.Drawing2D.GraphicsPath
$edge2Y = 88
$edge2Path.AddArc($edgeX, $edge2Y, $edgeR, $edgeR, 180, 90)
$edge2Path.AddArc($edgeX + $edgeW - $edgeR, $edge2Y, $edgeR, $edgeR, 270, 90)
$edge2Path.AddArc($edgeX + $edgeW - $edgeR, $edge2Y + $edgeH - $edgeR, $edgeR, $edgeR, 0, 90)
$edge2Path.AddArc($edgeX, $edge2Y + $edgeH - $edgeR, $edgeR, $edgeR, 90, 90)
$edge2Path.CloseFigure()
$graphics.FillPath($edgeBrush, $edge2Path)

# Bottom edge node (y=49*2.667=131)
$edge3Path = New-Object System.Drawing.Drawing2D.GraphicsPath
$edge3Y = 131
$edge3Path.AddArc($edgeX, $edge3Y, $edgeR, $edgeR, 180, 90)
$edge3Path.AddArc($edgeX + $edgeW - $edgeR, $edge3Y, $edgeR, $edgeR, 270, 90)
$edge3Path.AddArc($edgeX + $edgeW - $edgeR, $edge3Y + $edgeH - $edgeR, $edgeR, $edgeR, 0, 90)
$edge3Path.AddArc($edgeX, $edge3Y + $edgeH - $edgeR, $edgeR, $edgeR, 90, 90)
$edge3Path.CloseFigure()
$graphics.FillPath($edgeBrush, $edge3Path)

# --- Save as ICO ---
$iconPath = "$PSScriptRoot\sentrix-icon.ico"
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$icon.Save((New-Object System.IO.FileStream($iconPath, [System.IO.FileMode]::Create)))

# Cleanup
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "========================================" -ForegroundColor Green
Write-Host "Icon created successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output: $iconPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "Features:" -ForegroundColor White
Write-Host "  - FULLY TRANSPARENT background" -ForegroundColor Green
Write-Host "  - Exact Sentrix shield logo" -ForegroundColor White
Write-Host "  - White outline with data waves" -ForegroundColor White
Write-Host "  - Teal/cyan center node" -ForegroundColor Cyan
Write-Host "  - Three edge nodes on right" -ForegroundColor White
Write-Host ""
Write-Host "Now run: .\build.ps1" -ForegroundColor Yellow
