# 思考メモ アイコン生成(Node/Python 不要)
# 使い方: powershell -ExecutionPolicy Bypass -File icons/render-icons.ps1
# 元絵は icons/icon.svg。Edge(ヘッドレス)で 1024px に描き、.NET System.Drawing で各サイズに縮小する。
# ・どれも生成り一色の四角(角は端末が丸める。先に丸めると外側が別の色に見える)
# アイコンを変えたら index.html / manifest.json / sw.js の ?v= と sw.js の CACHE_NAME を上げる
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$svg = Join-Path $root 'icon.svg'
$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Edge か Chrome が見つかりません' }

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('sm-icon-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $tmp | Out-Null
$big = Join-Path $tmp 'icon-1024.png'
$url = ([System.Uri]$svg).AbsoluteUri
$p = Start-Process -FilePath $edge -Wait -PassThru -NoNewWindow -ArgumentList @(
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1024,1024',
  "--user-data-dir=`"$(Join-Path $tmp 'profile')`"", "--screenshot=`"$big`"", $url
)
if (-not (Test-Path $big)) { throw "描けませんでした (exit $($p.ExitCode))" }

$src = [System.Drawing.Image]::FromFile($big)

function Save-Icon([int]$size, [string]$name, [double]$scale = 1) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  # maskable は Android で丸く切られるので、まわりを地の色にして絵を小さめに置く
  $g.Clear($src.GetPixel(2, 2))
  $w = [int]($size * $scale)
  $o = [int](($size - $w) / 2)
  $g.DrawImage($src, $o, $o, $w, $w)
  $bmp.Save((Join-Path $root $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

Save-Icon 512 'icon-512.png'
Save-Icon 192 'icon-192.png'
Save-Icon 512 'icon-maskable-512.png' 0.82
Save-Icon 180 'icon-180.png'
Save-Icon 32 'favicon-32.png'

$src.Dispose()
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
Write-Host "Icons rendered in $root"
