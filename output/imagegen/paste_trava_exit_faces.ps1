Add-Type -AssemblyName System.Drawing
$scene = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath 'src/assets/illustrations/bg-vynosim-yarika-iz-travy-v2-oil.png').Path)
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
$group = 'src/assets/illustrations/bg-komnata-buhat1.jpg'
Paste-Face $group 431 258 65 84 401 296 0.86 0
Paste-Face $group 103 348 84 104 939 293 0.65 -12
Paste-Face $group 959 850 182 230 1194 251 0.30 5
Paste-Face 'src/assets/illustrations/litso-alik1.jpg' 582 747 224 295 587 250 0.23 -12
$canvas.Dispose()
$scene.Save((Join-Path (Get-Location) 'output/imagegen/trava-vynos-faces-montazh.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$scene.Dispose()
