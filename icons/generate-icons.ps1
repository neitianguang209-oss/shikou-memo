# PWAアイコン生成（Node/Python不要、.NET System.Drawing のみ使用）
# 使い方: powershell -ExecutionPolicy Bypass -File generate-icons.ps1
# 読書記録・思考メモ・ほしい/やりたい・就活選考管理の4つで
# 角丸の形・余白・記号の太さを揃え、色と中の記号だけ変えている。
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function P([single]$x, [single]$y) { New-Object System.Drawing.PointF($x, $y) }

function RoundRect($x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

$bg = [System.Drawing.Color]::FromArgb(255, 0xF5, 0xD6, 0xA0)   # --accent
$fg = [System.Drawing.Color]::FromArgb(255, 0x5A, 0x4A, 0x2A)   # --accent-strong

function Draw-Symbol($g, $size, $brush, $bgBrush) {
  # 吹き出し（思いついたことを書きとめる）
  $x = $size * 0.18; $y = $size * 0.25
  $w = $size * 0.64; $h = $size * 0.40
  $g.FillPath($brush, (RoundRect $x $y $w $h ($size * 0.11)))
  $tail = @(
    (P ($size * 0.31) ($size * 0.60)), (P ($size * 0.31) ($size * 0.79)),
    (P ($size * 0.48) ($size * 0.63))
  )
  $g.FillPolygon($brush, [System.Drawing.PointF[]]$tail)
}

function New-Icon([int]$size, [string]$path, [bool]$square) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $bgBrush = New-Object System.Drawing.SolidBrush($bg)
  if ($square) {
    # iOSのホーム画面は自分で角を丸めるので、apple-touch-icon用は四角のまま
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)
  } else {
    $g.FillPath($bgBrush, (RoundRect 0 0 $size $size ([int]($size * 0.22))))
  }

  $fgBrush = New-Object System.Drawing.SolidBrush($fg)
  Draw-Symbol $g ([single]$size) $fgBrush $bgBrush

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

New-Icon -size 192 -path (Join-Path $root "icon-192.png") -square $false
New-Icon -size 512 -path (Join-Path $root "icon-512.png") -square $false
New-Icon -size 180 -path (Join-Path $root "icon-180.png") -square $true
New-Icon -size 32  -path (Join-Path $root "favicon-32.png") -square $false

Write-Host "Icons generated in $root"
