Add-Type -AssemblyName System.Drawing
$basePhoto = [System.Drawing.Bitmap]::new('C:\Users\Saitama\.codex\generated_images\01a1fdb7-7ed7-7d72-86e7-e85ad81373fe\exec-7f232805-c428-4633-a546-bad812c7cf01.png')
$facePhoto = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath 'src/assets/illustrations/newnew/72decJ7i8u6NSf-2lcMBYoahDQKt8P2X5UV-TFxtl_AyzEPPBrsQB77-uyYIVjNis_NhI6T815UYRPwqrbskb8_o.jpg').Path)
$canvas = [System.Drawing.Graphics]::FromImage($basePhoto)
$canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$canvas.TranslateTransform(321,389.5)
$canvas.ScaleTransform(.55,.55)
$outline = [System.Drawing.Drawing2D.GraphicsPath]::new()
$outline.AddBezier(406,366,427,320,486,289,516,269)
$outline.AddBezier(516,269,559,244,615,245,644,269)
$outline.AddBezier(644,269,672,298,676,352,676,410)
$outline.AddBezier(676,410,671,480,643,523,574,539)
$outline.AddBezier(574,539,508,543,462,519,434,472)
$outline.AddBezier(434,472,413,432,403,393,406,366)
$outline.CloseFigure()
$canvas.SetClip($outline)
$tone = [System.Drawing.Imaging.ColorMatrix]::new()
$tone.Matrix00 = 1.08
$tone.Matrix11 = 1.16
$tone.Matrix22 = .91
$tone.Matrix40 = .02
$tone.Matrix41 = .015
$attributes = [System.Drawing.Imaging.ImageAttributes]::new()
$attributes.SetColorMatrix($tone)
$canvas.DrawImage($facePhoto,[System.Drawing.Rectangle]::new(0,0,$facePhoto.Width,$facePhoto.Height),0,0,$facePhoto.Width,$facePhoto.Height,[System.Drawing.GraphicsUnit]::Pixel,$attributes)
$attributes.Dispose()
$canvas.Dispose()
$outline.Dispose()
$facePhoto.Dispose()
$basePhoto.Save((Join-Path (Get-Location) 'output/imagegen/alik-kennel-fotomontazh.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$basePhoto.Dispose()
