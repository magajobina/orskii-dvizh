param(
  [string]$InputDirectory = 'src/assets/illustrations/Новые',
  [string]$OutputDirectory = 'src/assets/illustrations',
  [string]$Prefix = 'new-photo',
  [switch]$Register
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing.Common,System.Threading.Tasks.Parallel,System.Private.Windows.GdiPlus,System.Private.Windows.Core,System.Drawing.Primitives -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class PhotoFilter {
  static byte[] Smooth(byte[] src, int w, int h, bool horizontal) {
    byte[] dst = new byte[src.Length];
    double[] range = new double[195076];
    for (int i=0;i<range.Length;i++) range[i]=Math.Exp(-i/(2.0*38*38*3));
    double[] spatial=new double[11];
    for(int k=-5;k<=5;k++) spatial[k+5]=Math.Exp(-k*k/12.5);
    System.Threading.Tasks.Parallel.For(0,h,y=>{
      for(int x=0;x<w;x++) {
        int p=(y*w+x)*4; double b=0,g=0,r=0,total=0;
        for(int k=-5;k<=5;k++) {
          int xx=horizontal?Math.Max(0,Math.Min(w-1,x+k)):x;
          int yy=horizontal?y:Math.Max(0,Math.Min(h-1,y+k));
          int q=(yy*w+xx)*4;
          int db=src[p]-src[q],dg=src[p+1]-src[q+1],dr=src[p+2]-src[q+2];
          double weight=spatial[k+5]*range[db*db+dg*dg+dr*dr];
          b+=src[q]*weight; g+=src[q+1]*weight; r+=src[q+2]*weight; total+=weight;
        }
        dst[p]=(byte)(b/total);dst[p+1]=(byte)(g/total);dst[p+2]=(byte)(r/total);dst[p+3]=255;
      }
    }); return dst;
  }
  static byte Tone(double channel) {
    channel=Math.Max(0,Math.Min(255,channel));
    // Gently group similar tones without hard posterisation bands.
    return (byte)Math.Max(0,Math.Min(255,channel*.78+Math.Round(channel/9)*9*.22));
  }
  public static void Run(string input,string output) {
    using(var original=new Bitmap(input)) {
      if(Array.IndexOf(original.PropertyIdList,274)>=0) {
        int orientation=BitConverter.ToUInt16(original.GetPropertyItem(274).Value,0);
        switch(orientation) {
          case 2: original.RotateFlip(RotateFlipType.RotateNoneFlipX);break;
          case 3: original.RotateFlip(RotateFlipType.Rotate180FlipNone);break;
          case 4: original.RotateFlip(RotateFlipType.Rotate180FlipX);break;
          case 5: original.RotateFlip(RotateFlipType.Rotate90FlipX);break;
          case 6: original.RotateFlip(RotateFlipType.Rotate90FlipNone);break;
          case 7: original.RotateFlip(RotateFlipType.Rotate270FlipX);break;
          case 8: original.RotateFlip(RotateFlipType.Rotate270FlipNone);break;
        }
      }
      double scale=Math.Min(1,1100.0/Math.Max(original.Width,original.Height));
      int w=Math.Max(1,(int)(original.Width*scale)),h=Math.Max(1,(int)(original.Height*scale));
      using(var small=new Bitmap(w,h,PixelFormat.Format32bppArgb)) {
        using(var gfx=Graphics.FromImage(small)) {
          gfx.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
          gfx.DrawImage(original,0,0,w,h);
        }
        var rect=new Rectangle(0,0,w,h);
        var bits=small.LockBits(rect,ImageLockMode.ReadWrite,PixelFormat.Format32bppArgb);
        byte[] pixels=new byte[w*h*4];
        Marshal.Copy(bits.Scan0,pixels,0,pixels.Length);
        for(int pass=0;pass<3;pass++) {
          pixels=Smooth(pixels,w,h,true);pixels=Smooth(pixels,w,h,false);
        }
        for(int p=0;p<pixels.Length;p+=4) {
          double b=pixels[p],g=pixels[p+1],r=pixels[p+2];
          double luminance=.2126*r+.7152*g+.0722*b;
          double light=luminance/255,shadow=1-light;
          r=luminance+(r-luminance)*1.10;
          g=luminance+(g-luminance)*1.10;
          b=luminance+(b-luminance)*1.10;
          pixels[p+2]=Tone((r-128)*1.035+128+9*light+2);
          pixels[p+1]=Tone((g-128)*1.025+128+4*light+1);
          pixels[p]=Tone((b-128)*1.025+128-9*light+3*shadow);
        }
        Marshal.Copy(pixels,0,bits.Scan0,pixels.Length);small.UnlockBits(bits);
        using(var result=new Bitmap(original.Width,original.Height)) {
          using(var gfx=Graphics.FromImage(result)) {
            gfx.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            gfx.DrawImage(small,0,0,result.Width,result.Height);
          }
          var codec=Array.Find(ImageCodecInfo.GetImageEncoders(),c=>c.MimeType=="image/jpeg");
          using(var options=new EncoderParameters(1)) {
            options.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,94L);
            result.Save(output,codec,options);
          }
        }
      }
    }
  }
}
'@
$inputPath = (Resolve-Path -LiteralPath $InputDirectory).Path
$outputPath = [IO.Path]::GetFullPath((Join-Path $PWD $OutputDirectory))
[IO.Directory]::CreateDirectory($outputPath) | Out-Null
$files = @(Get-ChildItem -LiteralPath $inputPath -File | Where-Object Extension -Match '^\.(jpg|jpeg|png)$' | Sort-Object Name)
$registryPath = Join-Path $PSScriptRoot '../src/content/assets.json'
$registry = Get-Content -LiteralPath $registryPath -Raw | ConvertFrom-Json -AsHashtable
$manifest = @()
for($index=0;$index -lt $files.Count;$index++) {
  $id = '{0}-{1:00}-filtered' -f $Prefix,($index+1)
  $destination = Join-Path $outputPath ($id+'.jpg')
  if(Test-Path -LiteralPath $destination) { throw "Already exists: $destination" }
  [PhotoFilter]::Run($files[$index].FullName,$destination)
  $image = [Drawing.Image]::FromFile($destination)
  $registry[$id] = [ordered]@{file=($id+'.jpg');width=$image.Width;height=$image.Height}
  $image.Dispose()
  $manifest += [ordered]@{source=$files[$index].Name;filtered=($id+'.jpg')}
  Write-Output "$($index+1)/$($files.Count): $id"
}
if($Register) {
  [IO.File]::WriteAllText($registryPath,($registry|ConvertTo-Json -Depth 10)+"`n",[Text.UTF8Encoding]::new($false))
}
[IO.Directory]::CreateDirectory((Join-Path $PSScriptRoot '../output/photo-filter')) | Out-Null
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot "../output/photo-filter/$Prefix-manifest.json") -Encoding utf8
