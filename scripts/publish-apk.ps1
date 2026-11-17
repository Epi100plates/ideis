#requires -Version 5.1
<#
.SYNOPSIS
  Publikuje nową wersję forkowanej aplikacji Android (ideis): buduje APK, liczy
  SHA-256 i wgrywa wydanie na VPS, skąd aplikacja sama je pobiera.

.DESCRIPTION
  Ten sam mechanizm co w wersji bazowej `plany.mati-it.pl`, ale
  dla forka `pl.matiit.planzajec.ideis`, który rozmawia z ideis.mati-it.pl.
  Aplikacja nie trafia do sklepu Play, więc o nowej wersji dowiaduje się
  z `GET /api/app/latest` tego serwera:

    1. podbija numer wersji w android/version.properties (-Bump),
    2. buduje podpisany APK release,
    3. kopiuje go do releases/ jako planzajec-ideis-<nazwa>-<kod>.apk,
    4. liczy SHA-256 i zapisuje releases/latest.json,
    5. opcjonalnie wgrywa oba pliki na VPS (-Upload) i sprawdza publiczny endpoint.

  Katalog wydań leży na wolumenie danych kontenera
  (`/opt/plany-wybor/data/releases`), więc publikacja nie przebudowuje
  i nie restartuje kontenera.

  Dwa kanały się nie mieszają: manifest z innym `app` jest odrzucany przez
  serwer, więc wydanie z `plany.mati-it.pl` nie trafi do tego forka.

.EXAMPLE
  .\scripts\publish-apk.ps1 -Bump -Notes "Wybór naboru, kierunku i roku studiów" -Upload

.EXAMPLE
  .\scripts\publish-apk.ps1 -SkipBuild -Upload   # wyślij już zbudowany APK
#>
[CmdletBinding()]
param(
    # Nowa wersja: podbij versionCode i drugorzędny numer versionName.
    [switch]$Bump,
    # Jawne wartości — zamiast -Bump.
    [int]$VersionCode = 0,
    [string]$VersionName = '',
    # Lista zmian pokazywana w aplikacji (kilka linii = kilka punktów).
    [string]$Notes = 'Nowa wersja aplikacji.',
    # Od której wersji aktualizacja jest obowiązkowa (0 = zawsze do pominięcia).
    [int]$MinSupportedVersionCode = 0,
    # Wyślij wydanie na VPS przez scp/ssh.
    [switch]$Upload,
    # Nie buduj — weź gotowy android/app/build/outputs/apk/release/app-release.apk.
    [switch]$SkipBuild,
    # Publiczny adres kontrolny po wgraniu (pusty = nie sprawdzaj).
    [string]$CheckUrl = 'https://ideis.mati-it.pl/api/app/latest',
    [string]$SshHost = $(if ($env:SSH_HOST) { $env:SSH_HOST } else { 'root@olga322.mikrus.xyz' }),
    [int]$SshPort = $(if ($env:SSH_PORT) { [int]$env:SSH_PORT } else { 10322 }),
    [string]$SshKey = $(if ($env:SSH_KEY) { $env:SSH_KEY } else { Join-Path $HOME '.ssh/mikrus_olga322' }),
    [string]$RemoteDir = $(if ($env:REMOTE_DIR) { $env:REMOTE_DIR } else { '/opt/plany-wybor' })
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $root 'android'
$versionFile = Join-Path $androidDir 'version.properties'
$releaseDir = Join-Path $root 'releases'
$apkSource = Join-Path $androidDir 'app/build/outputs/apk/release/app-release.apk'
$remoteReleaseDir = "$RemoteDir/data/releases"

# Identyfikator aplikacji — musi zgadzać się z `applicationId` w app/build.gradle.kts
# i z `APP_ID` serwera, inaczej serwer odrzuci manifest.
$appId = 'pl.matiit.planzajec.ideis'
$apkPrefix = 'planzajec-ideis'

function Write-Step([string]$text) {
    Write-Host "`n[publish] $text" -ForegroundColor Cyan
}

# --- 1. numer wersji -------------------------------------------------------
Write-Step "Wersja aplikacji ($appId)"
if (-not (Test-Path $versionFile)) {
    throw "Brak pliku $versionFile — nie wiem, jaką wersję publikować."
}

$props = [ordered]@{}
# Wczytujemy z jawnym UTF-8: Windows PowerShell 5.1 bez tego czyta plik jako ANSI
# i zamieniłby polskie komentarze w krzaki. Plik zostaje bez BOM.
$versionText = [System.IO.File]::ReadAllText($versionFile, [System.Text.UTF8Encoding]::new($false))
$versionLines = $versionText -split "`r?`n"
foreach ($line in $versionLines) {
    if ($line -match '^\s*([A-Za-z]+)\s*=\s*(.+?)\s*$') {
        $props[$Matches[1]] = $Matches[2]
    }
}

$code = if ($VersionCode -gt 0) { $VersionCode } else { [int]$props['versionCode'] }
$name = if ($VersionName) { $VersionName } else { [string]$props['versionName'] }

if ($Bump) {
    $code = [int]$props['versionCode'] + 1
    $parts = ([string]$props['versionName']).Split('.')
    if ($parts.Count -lt 2) {
        $name = "$($parts[0]).1"
    } else {
        $minor = [int]$parts[1] + 1
        $name = "$($parts[0]).$minor"
    }
}

if ($code -lt 1) { throw 'versionCode musi być ≥ 1.' }
if ($name -notmatch '^\d+(\.\d+){1,2}(-[A-Za-z0-9.]+)?$') {
    throw "versionName '$name' nie wygląda na numer wersji (np. 1.2)."
}

# Podmieniamy tylko dwie linie z numerami — komentarze w pliku zostają.
$hasCode = $false
$hasName = $false
$rewritten = foreach ($line in $versionLines) {
    if ($line -match '^\s*versionCode\s*=') {
        $hasCode = $true
        "versionCode=$code"
    } elseif ($line -match '^\s*versionName\s*=') {
        $hasName = $true
        "versionName=$name"
    } else {
        $line
    }
}
$rewritten = @($rewritten)
if (-not $hasCode) { $rewritten += "versionCode=$code" }
if (-not $hasName) { $rewritten += "versionName=$name" }
$newVersionText = ($rewritten -join "`n").TrimEnd() + "`n"
[System.IO.File]::WriteAllText($versionFile, $newVersionText, [System.Text.UTF8Encoding]::new($false))
Write-Host "  versionCode=$code  versionName=$name"

# --- 2. budowa APK ---------------------------------------------------------
if ($SkipBuild) {
    Write-Step 'Pomijam budowanie (-SkipBuild)'
} else {
    Write-Step 'Buduję podpisany APK (assembleRelease)'
    Push-Location $androidDir
    try {
        & (Join-Path $androidDir 'gradlew.bat') ':app:assembleRelease' '--console=plain'
        if ($LASTEXITCODE -ne 0) { throw "Gradle zwrócił błąd ($LASTEXITCODE)." }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path $apkSource)) {
    throw "Brak pliku $apkSource — najpierw zbuduj APK."
}

# --- 3. katalog wydań ------------------------------------------------------
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$apkName = "$apkPrefix-$name-$code.apk"
$apkTarget = Join-Path $releaseDir $apkName
Copy-Item -Path $apkSource -Destination $apkTarget -Force

$size = (Get-Item $apkTarget).Length
$sha = (Get-FileHash -Path $apkTarget -Algorithm SHA256).Hash.ToLowerInvariant()

Write-Step 'Wydanie'
Write-Host ("  plik      {0}  ({1:N2} MB)" -f $apkName, ($size / 1MB))
Write-Host "  sha256    $sha"

# --- 4. manifest -----------------------------------------------------------
$manifest = [ordered]@{
    app                     = $appId
    versionCode             = $code
    versionName             = $name
    apkFile                 = $apkName
    sha256                  = $sha
    sizeBytes               = $size
    minSupportedVersionCode = $MinSupportedVersionCode
    notes                   = $Notes
    publishedAt             = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
}
$manifestPath = Join-Path $releaseDir 'latest.json'
$json = $manifest | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($manifestPath, $json + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Host "  manifest  $manifestPath"

# Stare APK-i tylko zaśmiecają katalog — zostawiamy bieżący plik.
Get-ChildItem $releaseDir -Filter '*.apk' | Where-Object { $_.Name -ne $apkName } | ForEach-Object {
    Write-Host "  usuwam stare wydanie $($_.Name)"
    Remove-Item $_.FullName -Force
}

if (-not $Upload) {
    Write-Step 'Gotowe (bez -Upload). Wgranie na VPS:'
    Write-Host "  scp -i `"$SshKey`" -P $SshPort `"$apkTarget`" `"$manifestPath`" ${SshHost}:$remoteReleaseDir/"
    return
}

# --- 5. wysyłka na VPS -----------------------------------------------------
Write-Step "Wgrywam na $SshHost`:$remoteReleaseDir"
if (-not (Test-Path $SshKey)) {
    throw "Brak klucza SSH $SshKey (ustaw -SshKey albo zmienną SSH_KEY)."
}

& ssh -i $SshKey -p $SshPort $SshHost "mkdir -p '$remoteReleaseDir' && chmod 755 '$remoteReleaseDir'"
if ($LASTEXITCODE -ne 0) { throw "Nie udało się utworzyć katalogu wydań na VPS ($LASTEXITCODE)." }

& scp -i $SshKey -P $SshPort $apkTarget $manifestPath "${SshHost}:$remoteReleaseDir/"
if ($LASTEXITCODE -ne 0) { throw "scp nie powiodło się ($LASTEXITCODE)." }

# Kontener czyta wolumen jako uid 1000 — pliki muszą być czytelne dla wszystkich.
# Stare pliki APK na VPS tylko zaśmiecają katalog, więc zostawiamy tylko bieżące.
& ssh -i $SshKey -p $SshPort $SshHost "chmod 644 '$remoteReleaseDir/$apkName' '$remoteReleaseDir/latest.json' && find '$remoteReleaseDir' -maxdepth 1 -name '*.apk' ! -name '$apkName' -delete"
if ($LASTEXITCODE -ne 0) { throw "Nie udało się ustawić uprawnień na VPS ($LASTEXITCODE)." }

Write-Step 'Sprawdzam publiczny endpoint'
if ($CheckUrl) {
    try {
        # Nawiasy wokół nazwy zmiennej: bez nich PowerShell czyta „$CheckUrl?versionCode”
        # jako jedną nazwę zmiennej i wywala się na braku takiej zmiennej.
        $response = Invoke-RestMethod -Uri "${CheckUrl}?versionCode=$code" -TimeoutSec 20
        if ($response.versionCode -ne $code) {
            throw "Serwer zwraca versionCode=$($response.versionCode), oczekiwano $code."
        }
        if ($response.app -and $response.app -ne $appId) {
            throw "Serwer zwraca wydanie innej aplikacji ($($response.app))."
        }
        Write-Host "  OK: opublikowano $($response.versionName) (kod $($response.versionCode))"
        Write-Host "  APK:  $($response.apkUrl)"
    } catch {
        Write-Warning "Nie udało się potwierdzić publikacji: $($_.Exception.Message)"
        Write-Warning "Pliki są na VPS — sprawdź ręcznie: curl -s `${CheckUrl}?versionCode=$code"
    }
}

Write-Step 'Gotowe — aplikacje w telefonach zobaczą nową wersję przy następnym sprawdzeniu.'
