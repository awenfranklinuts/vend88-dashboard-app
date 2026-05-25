$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = 'D:\Github\vend88-dashboard-app\mobile\iOS Preview'
$dst = Join-Path $src 'asc-ready'
New-Item -ItemType Directory -Force -Path $dst | Out-Null

$targetW = 1284
$targetH = 2778

$files = Get-ChildItem -LiteralPath $src -File |
    Where-Object { $_.Extension -match '^\.(jpe?g|png)$' } |
    Sort-Object Name

$i = 0
foreach ($f in $files) {
    $i++
    $name = ('vend88-{0:D2}.png' -f $i)
    $outPath = Join-Path $dst $name

    $img = [System.Drawing.Image]::FromFile($f.FullName)
    try {
        $scale = [Math]::Min($targetW / $img.Width, $targetH / $img.Height)
        $newW = [int][Math]::Round($img.Width * $scale)
        $newH = [int][Math]::Round($img.Height * $scale)
        $offsetX = [int][Math]::Floor(($targetW - $newW) / 2)
        $offsetY = [int][Math]::Floor(($targetH - $newH) / 2)

        $bmp = New-Object System.Drawing.Bitmap $targetW, $targetH, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.Clear([System.Drawing.Color]::Black)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $rect = New-Object System.Drawing.Rectangle $offsetX, $offsetY, $newW, $newH
            $g.DrawImage($img, $rect)
        } finally {
            $g.Dispose()
        }
        $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        Write-Host ("OK  {0,-50} -> {1}  ({2}x{3} -> {4}x{5})" -f $f.Name, $name, $img.Width, $img.Height, $targetW, $targetH)
    } finally {
        $img.Dispose()
    }
}
Write-Host ""
Write-Host ("Done. {0} file(s) written to: {1}" -f $i, $dst)
