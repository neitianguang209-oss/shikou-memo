# PWAアイコン生成（Node/Python不要、.NET System.Drawing のみ使用）
# 使い方: powershell -ExecutionPolicy Bypass -File generate-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$accent = [System.Drawing.Color]::FromArgb(255, 0xF5, 0xD6, 0xA0)
$accentStrong = [System.Drawing.Color]::FromArgb(255, 0x5A, 0x4A, 0x2A)

function New-Icon([int]$size, [string]$path, [bool]$square) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $bgBrush = New-Object System.Drawing.SolidBrush($accent)
  if ($square) {
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)
  } else {
    $radius = [int]($size * 0.22)
    $path2 = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path2.AddArc(0, 0, $d, $d, 180, 90)
    $path2.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path2.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path2.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path2.CloseFigure()
    $g.FillPath($bgBrush, $path2)
  }

  # 中央に「メモの束」を表す3本の横線
  $lineBrush = New-Object System.Drawing.SolidBrush($accentStrong)
  $lineHeight = [Math]::Max(2, [int]($size * 0.045))
  $lineWidth = [int]($size * 0.46)
  $x = ($size - $lineWidth) / 2
  $gap = $size * 0.10
  $startY = $size * 0.36
  for ($i = 0; $i -lt 3; $i++) {
    $w = if ($i -eq 2) { $lineWidth * 0.6 } else { $lineWidth }
    $y = $startY + ($gap * $i)
    $rect = New-Object System.Drawing.RectangleF($x, $y, $w, $lineHeight)
    $g.FillRectangle($lineBrush, $rect)
  }

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

New-Icon -size 192 -path (Join-Path $root "icon-192.png") -square $false
New-Icon -size 512 -path (Join-Path $root "icon-512.png") -square $false
New-Icon -size 180 -path (Join-Path $root "icon-180.png") -square $true
New-Icon -size 32  -path (Join-Path $root "favicon-32.png") -square $false

Write-Host "Icons generated in $root"
