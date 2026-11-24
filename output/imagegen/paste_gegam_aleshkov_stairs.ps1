Add-Type -AssemblyName System.Drawing
$scene = [System.Drawing.Bitmap]::new('C:\Users\Saitama\.codex\generated_images\01a1fdb7-7ed7-7d72-86e7-e85ad81373fe\exec-569d75e3-39fa-4848-9496-995fd7e10e63.png')
$canvas = [System.Drawing.Graphics]::FromImage($scene)
$canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$canvas.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
function Paste-Head($file, $points, $scale, $offsetX, $offsetY) {
    $portrait = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $file).Path)
    $state = $canvas.Save()
    $canvas.TranslateTransform($offsetX, $offsetY)
    $canvas.ScaleTransform($scale, $scale)
    $outline = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $outline.AddClosedCurve([System.Drawing.PointF[]]$points, 0.22)
    $canvas.SetClip($outline)
    $canvas.DrawImage($portrait, 0, 0, $portrait.Width, $portrait.Height)
    $canvas.Restore($state)
    $outline.Dispose()
    $portrait.Dispose()
}
$gegam = @(
    [System.Drawing.PointF]::new(500,62), [System.Drawing.PointF]::new(549,77),
    [System.Drawing.PointF]::new(577,119), [System.Drawing.PointF]::new(590,176),
    [System.Drawing.PointF]::new(581,236), [System.Drawing.PointF]::new(566,286),
    [System.Drawing.PointF]::new(542,320), [System.Drawing.PointF]::new(508,344),
    [System.Drawing.PointF]::new(469,333), [System.Drawing.PointF]::new(435,300),
    [System.Drawing.PointF]::new(415,248), [System.Drawing.PointF]::new(407,178),
    [System.Drawing.PointF]::new(417,122), [System.Drawing.PointF]::new(452,82)
)
Paste-Head 'src/assets/illustrations/gegam-fullbody.png' $gegam 0.70 12 117
$aleshkov = @(
    [System.Drawing.PointF]::new(390,160), [System.Drawing.PointF]::new(430,115),
    [System.Drawing.PointF]::new(530,94), [System.Drawing.PointF]::new(620,100),
    [System.Drawing.PointF]::new(688,135), [System.Drawing.PointF]::new(714,210),
    [System.Drawing.PointF]::new(714,300), [System.Drawing.PointF]::new(702,392),
    [System.Drawing.PointF]::new(717,445), [System.Drawing.PointF]::new(696,530),
    [System.Drawing.PointF]::new(650,610), [System.Drawing.PointF]::new(563,666),
    [System.Drawing.PointF]::new(485,665), [System.Drawing.PointF]::new(418,613),
    [System.Drawing.PointF]::new(376,552), [System.Drawing.PointF]::new(350,460),
    [System.Drawing.PointF]::new(357,385), [System.Drawing.PointF]::new(350,310),
    [System.Drawing.PointF]::new(359,220)
)
Paste-Head 'src/assets/illustrations/aleshkov-portret.png' $aleshkov 0.40 482 24
$canvas.Dispose()
$scene.Save((Join-Path (Get-Location) 'output/imagegen/gegam-aleshkov-trap-fotomontazh.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$scene.Dispose()
