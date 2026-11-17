#requires -Version 5.1
<#
.SYNOPSIS
  Generuje ikony launchera Androida z arkusza projektowego (PNG).

.DESCRIPTION
  Ikona aplikacji nie jest rysowana w XML, tylko brana z projektu w
  `plany-android/design/ikony/png`. Skrypt robi z jednego pliku komplet
  gęstości, których potrzebuje Android:

    <design>-maskable.png  → mipmap-*/ic_launcher_foreground.png
                             warstwa foreground ikony adaptywnej; wersja
                             „maskable” ma tło do krawędzi i glif w strefie
                             bezpiecznej, więc dowolny mask launchera jest OK

    z przełącznikiem -Legacy:
    <design>.png           → mipmap-*/ic_launcher.png (ikona klasyczna,
                             zaokrąglone rogi wg projektu)
    <design>-maskable.png  → mipmap-*/ic_launcher_round.png (przycięta kołem)

  Domyślnie klasycznych PNG nie zapisujemy: `minSdk` to 26, więc każdy
  obsługiwany Android czyta `mipmap-anydpi-v26/ic_launcher.xml` (ikona
  adaptywna) i pliki 48–192 px nigdy nie byłyby wczytane — a ważą ~170 kB.
  Przełącznik przydaje się tylko do materiałów sklepowych/screenshotów.

  Ikona adaptywna bierze `@mipmap/ic_launcher_foreground` na wierzch i jednolite
  tło pod spód — gradient z projektu jest widoczny w całości, a launcher może
  go maskować (koło, squircle, rounded square).

.EXAMPLE
  .\scripts\android-icons.ps1
  .\scripts\android-icons.ps1 -Design 03-kalendarz -Check
  .\scripts\android-icons.ps1 -Legacy
#>
[CmdletBinding()]
param(
    [string]$Design = '03-kalendarz',
    # Puste = katalogi wyliczone z położenia skryptu (patrz niżej).
    [string]$SourceDir = '',
    [string]$ResDir = '',
    # Zapisz też klasyczne ikony 48–192 px (nieużywane przy minSdk 26).
    [switch]$Legacy,
    # Tylko sprawdź, czy pliki źródłowe istnieją — nic nie zapisuj.
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Drawing

# `$PSScriptRoot` nie jest ustawiony podczas wiązania parametrów, więc ścieżki
# liczymy dopiero tutaj.
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $SourceDir) { $SourceDir = Join-Path $repoRoot 'plany-android\design\ikony\png' }
if (-not $ResDir) { $ResDir = Join-Path $repoRoot 'android\app\src\main\res' }

# Gęstości: katalog, rozmiar ikony klasycznej (48 dp) i warstwy foreground
# ikony adaptywnej (108 dp).
$densities = @(
    @{ Dir = 'mipmap-mdpi'; Legacy = 48; Foreground = 108 },
    @{ Dir = 'mipmap-hdpi'; Legacy = 72; Foreground = 162 },
    @{ Dir = 'mipmap-xhdpi'; Legacy = 96; Foreground = 216 },
    @{ Dir = 'mipmap-xxhdpi'; Legacy = 144; Foreground = 324 },
    @{ Dir = 'mipmap-xxxhdpi'; Legacy = 192; Foreground = 432 }
)

$rounded = Join-Path $SourceDir "$Design.png"
$maskable = Join-Path $SourceDir "$Design-maskable.png"

$required = @($maskable)
if ($Legacy) { $required += $rounded }
foreach ($path in $required) {
    if (-not (Test-Path $path)) { throw "Brak pliku źródłowego: $path" }
}

if ($Check) {
    Write-Host '[ikony] źródła są na miejscu:'
    foreach ($path in $required) { Write-Host "  $path" }
    return
}

function New-Icon {
    param(
        [System.Drawing.Bitmap]$Source,
        [int]$Size,
        [switch]$Circle
    )

    $target = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($target)
    try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.Clear([System.Drawing.Color]::Transparent)

        if ($Circle) {
            $path = New-Object System.Drawing.Drawing2D.GraphicsPath
            $path.AddEllipse(0, 0, $Size, $Size)
            $graphics.SetClip($path)
            $path.Dispose()
        }

        $graphics.DrawImage(
            $Source,
            (New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)),
            (New-Object System.Drawing.Rectangle(0, 0, $Source.Width, $Source.Height)),
            [System.Drawing.GraphicsUnit]::Pixel
        )
    } finally {
        $graphics.Dispose()
    }
    return $target
}

$maskableSource = [System.Drawing.Bitmap]::new($maskable)
$roundedSource = if ($Legacy) { [System.Drawing.Bitmap]::new($rounded) } else { $null }

try {
    foreach ($density in $densities) {
        $dir = Join-Path $ResDir $density.Dir
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory $dir | Out-Null }

        $foreground = New-Icon -Source $maskableSource -Size $density.Foreground
        $foreground.Save((Join-Path $dir 'ic_launcher_foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        $foreground.Dispose()

        if ($Legacy) {
            $classic = New-Icon -Source $roundedSource -Size $density.Legacy
            $classic.Save((Join-Path $dir 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png)
            $classic.Dispose()

            $round = New-Icon -Source $maskableSource -Size $density.Legacy -Circle
            $round.Save((Join-Path $dir 'ic_launcher_round.png'), [System.Drawing.Imaging.ImageFormat]::Png)
            $round.Dispose()
        }

        Write-Host ("[ikony] {0,-14} foreground {1,3} px" -f $density.Dir, $density.Foreground)
    }
} finally {
    $maskableSource.Dispose()
    if ($roundedSource) { $roundedSource.Dispose() }
}

Write-Host "[ikony] gotowe — źródło: $Design"
