Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
function Read-Fingerprint([string]$path) {
 $source=[System.Drawing.Bitmap]::new($path)
 $small=[System.Drawing.Bitmap]::new(17,16)
 $g=[System.Drawing.Graphics]::FromImage($small)
 $g.DrawImage($source,0,0,17,16)
 $values=[double[]]::new(512)
 for($y=0;$y -lt 16;$y++) { for($x=0;$x -lt 16;$x++) {
  $p=$small.GetPixel($x,$y); $q=$small.GetPixel(($x+1),$y)
  $v=.299*$p.R+.587*$p.G+.114*$p.B
  $values[$y*16+$x]=$v
  $values[256+$y*16+$x]=[int]($v -gt (.299*$q.R+.587*$q.G+.114*$q.B))
 } }
 $g.Dispose();$small.Dispose();$source.Dispose()
 return ,$values
}
$root = (Get-Location).Path
$out = Join-Path $root 'output/imagegen/new-photos-audit'
New-Item -ItemType Directory -Path $out -Force | Out-Null
$registry = Get-Content 'src/content/assets.json' -Raw | ConvertFrom-Json -AsHashtable
$items = [System.Collections.Generic.List[object]]::new()
foreach ($id in $registry.Keys) {
 $file = $registry[$id].file
 if ($file) {
  $path = Join-Path $root ('src/assets/illustrations/' + $file)
  if (Test-Path -LiteralPath $path) {
   try { $items.Add(@{id=$id;path=$path;group='library';hash=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash;features=(Read-Fingerprint $path)}) } catch { Write-Warning $id }
  }
 }
}
$new = @(Get-ChildItem 'src/assets/illustrations/newnew/neeeeeew' -File | Sort-Object { [int]($_.BaseName.Split('_')[1]) })
foreach ($file in $new) { $items.Add(@{id=$file.Name;path=$file.FullName;group='new';hash=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash;features=(Read-Fingerprint $file.FullName)}) }
$items | ConvertTo-Json -Depth 5 -Compress | Set-Content -LiteralPath (Join-Path $out 'fingerprints.json') -Encoding utf8
$sheet = [System.Drawing.Bitmap]::new(1140,1530)
$graphics = [System.Drawing.Graphics]::FromImage($sheet)
$graphics.Clear([System.Drawing.Color]::FromArgb(30,32,32))
$font=[System.Drawing.Font]::new('Arial',10)
for($i=0;$i -lt $new.Count;$i++) {
 $x=($i%6)*190; $y=[Math]::Floor($i/6)*170
 $photo=[System.Drawing.Bitmap]::new($new[$i].FullName)
 $ratio=[Math]::Min(182.0/$photo.Width,145.0/$photo.Height)
 $w=[int]($photo.Width*$ratio); $h=[int]($photo.Height*$ratio)
 $graphics.DrawImage($photo,[int]($x+(190-$w)/2),[int]$y,$w,$h)
 $graphics.DrawString($new[$i].BaseName.Split('_')[1],$font,[System.Drawing.Brushes]::White,[single]($x+5),[single]($y+147))
 $photo.Dispose()
}
$graphics.Dispose(); $font.Dispose()
$sheet.Save((Join-Path $out 'new-contact-sheet.jpg'),[System.Drawing.Imaging.ImageFormat]::Jpeg)
$sheet.Dispose()
Write-Output ('Audited: '+$items.Count+'; new: '+$new.Count)
