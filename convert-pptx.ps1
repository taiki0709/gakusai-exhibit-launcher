# Converts every visible slide of a PowerPoint file into PNG images (001.png, 002.png, ...).
# Called by server.js. Needs Microsoft PowerPoint installed on this PC.
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutDir
)
$ErrorActionPreference = "Stop"

$ppt = New-Object -ComObject PowerPoint.Application
$openedBefore = $ppt.Presentations.Count   # do not close presentations the user already has open

# Open(FileName, ReadOnly=true, Untitled=false, WithWindow=false)
$pres = $ppt.Presentations.Open($Pptx, -1, 0, 0)
try {
  $w = 1920
  $h = [int][Math]::Round(1920 * $pres.PageSetup.SlideHeight / $pres.PageSetup.SlideWidth)
  $n = 0
  for ($i = 1; $i -le $pres.Slides.Count; $i++) {
    $slide = $pres.Slides.Item($i)
    if ($slide.SlideShowTransition.Hidden -eq -1) { continue }   # skip hidden slides
    $n++
    $file = Join-Path $OutDir ("{0:D3}.png" -f $n)
    $slide.Export($file, "PNG", $w, $h)
  }
  Write-Output ("converted " + $n + " slides")
}
finally {
  $pres.Close()
  if ($openedBefore -eq 0) { $ppt.Quit() }
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
}
