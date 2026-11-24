Add-Type -AssemblyName System.Drawing
$scene = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath 'src/assets/illustrations/bg-gostinitsa-utro-posle-gulyanki-oil-v2.png').Path)
$canvas = [System.Drawing.Graphics]::FromImage($scene)
$canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
function Paste-Face($file, $sx, $sy, $rx, $ry, $tx, $ty, $scale, $angle) {
    $photo = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $file).Path)
    $width = [int](2*$rx); $height = [int](2*$ry)
    $cut = [System.Drawing.Bitmap]::new($width,$height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    for ($y=0; $y -lt $height; $y++) {
        for ($x=0; $x -lt $width; $x++) {
            $distance = [Math]::Sqrt([Math]::Pow(($x-$rx)/$rx,2)+[Math]::Pow(($y-$ry)/$ry,2))
            $opacity = [Math]::Min(1,[Math]::Max(0,(1-$distance)/0.14))
            if ($opacity -gt 0) {
                $pixel = $photo.GetPixel([int]($sx-$rx+$x),[int]($sy-$ry+$y))
                $cut.SetPixel($x,$y,[System.Drawing.Color]::FromArgb([int](255*$opacity),$pixel.R,$pixel.G,$pixel.B))
            }
        }
    }
    $state = $canvas.Save()
    $canvas.TranslateTransform($tx,$ty)
    $canvas.RotateTransform($angle)
    $canvas.ScaleTransform($scale,$scale)
    $canvas.DrawImage($cut,-$rx,-$ry,$width,$height)
    $canvas.Restore($state)
    $cut.Dispose(); $photo.Dispose()
}
$singing = 'src/assets/illustrations/newnew/final/photo_2026-11-24_14-24-29.jpg'
$group = 'src/assets/illustrations/newnew/final/photo_2026-11-24_14-25-01.jpg'
# Four visible faces come from the actual party photographs; fifth sleeper faces away.
Paste-Face $singing 621 182 57 78 283 318 0.57 40
Paste-Face $singing 407 135 68 94 1154 412 0.48 48
Paste-Face $singing 929 101 73 96 1175 551 0.56 45
Paste-Face $group 1005 106 44 61 585 241 0.49 -54
$canvas.Dispose()
$scene.Save((Join-Path (Get-Location) 'output/imagegen/gostinitsa-utro-party-faces-fotomontazh.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$scene.Dispose()
