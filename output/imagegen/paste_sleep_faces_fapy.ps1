Add-Type -AssemblyName System.Drawing
$scene = [System.Drawing.Bitmap]::new('C:\Users\Saitama\.codex\generated_images\01a1fdb7-7ed7-7d72-86e7-e85ad81373fe\exec-42ec3d73-9500-42b2-b3e9-46d31e5843f7.png')
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
$women = 'src/assets/illustrations/g4-line-548-fapy-sdany.png'
$guitar = 'src/assets/illustrations/bg-gostinitsa-gitara-na-podokonnike-oil.png'
# Polina: bob-haired woman at right in classroom; Anya: curly woman in foreground.
Paste-Face $women 694 457 86 99 282 315 0.45 15
Paste-Face $women 278 650 126 149 1150 408 0.34 42
# Seryoga is the man playing guitar on the windowsill.
Paste-Face $guitar 843 177 47 59 1175 546 0.83 30
$canvas.Dispose()
$scene.Save((Join-Path (Get-Location) 'output/imagegen/gostinitsa-utro-fapy-faces-disko-montazh.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$scene.Dispose()
