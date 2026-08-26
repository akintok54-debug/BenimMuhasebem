$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "       BAHADIR ERP V2 - SISTEM KONTROL" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

$root = $PWD
$port = 5000
$hata = $false

Write-Host ""
Write-Host "[1/6] NODE KONTROLU" -ForegroundColor Yellow
node --version
if ($LASTEXITCODE -ne 0) {
    Write-Host "NODE BULUNAMADI" -ForegroundColor Red
    $hata = $true
}

Write-Host ""
Write-Host "[2/6] TEMEL DOSYALAR" -ForegroundColor Yellow

$dosyalar = @(
    ".env",
    "package.json",
    "src\sunucu.js",
    "src\uygulama.js",
    "src\database\veritabani.js",
    "src\routes\saglikRotasi.js",
    "src\middleware\hataYonetici.js",
    "src\models\Kullanici.js"
)

foreach ($dosya in $dosyalar) {
    if (Test-Path $dosya) {
        Write-Host "OK  $dosya" -ForegroundColor Green
    } else {
        Write-Host "YOK $dosya" -ForegroundColor Red
        $hata = $true
    }
}

Write-Host ""
Write-Host "[3/6] JAVASCRIPT SYNTAX KONTROLU" -ForegroundColor Yellow

$jsDosyalari = Get-ChildItem ".\src" -Recurse -Filter "*.js" -File

foreach ($dosya in $jsDosyalari) {
    node --check $dosya.FullName 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host "HATA: $($dosya.FullName)" -ForegroundColor Red
        $hata = $true
    }
}

if (!$hata) {
    Write-Host "JAVASCRIPT KONTROLU BASARILI" -ForegroundColor Green
}

Write-Host ""
Write-Host "[4/6] ESKI NODE ISLEMLERI TEMIZLENIYOR" -ForegroundColor Yellow

Get-Process node -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 1

Write-Host "NODE TEMIZLENDI" -ForegroundColor Green

Write-Host ""
Write-Host "[5/6] SUNUCU BASLATILIYOR" -ForegroundColor Yellow

$logDir = Join-Path $root "logs"

if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Force $logDir | Out-Null
}

$stdout = Join-Path $logDir "sunucu-out.log"
$stderr = Join-Path $logDir "sunucu-error.log"

Remove-Item $stdout,$stderr -Force -ErrorAction SilentlyContinue

$process = Start-Process `
    -FilePath "node.exe" `
    -ArgumentList ".\src\sunucu.js" `
    -WorkingDirectory $root `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

Start-Sleep -Seconds 5

if ($process.HasExited) {

    Write-Host ""
    Write-Host "SUNUCU BASLATILAMADI" -ForegroundColor Red
    Write-Host "Cikis kodu: $($process.ExitCode)" -ForegroundColor Red

    if (Test-Path $stdout) {
        Write-Host ""
        Write-Host "--- SUNUCU LOG ---" -ForegroundColor Yellow
        Get-Content $stdout -Tail 80
    }

    if (Test-Path $stderr) {
        Write-Host ""
        Write-Host "--- HATA LOG ---" -ForegroundColor Red
        Get-Content $stderr -Tail 80
    }

    exit 1
}

Write-Host "NODE PROCESS AKTIF: PID $($process.Id)" -ForegroundColor Green

Write-Host ""
Write-Host "[6/6] PORT VE API TESTI" -ForegroundColor Yellow

$dinleme = Get-NetTCPConnection `
    -LocalPort $port `
    -State Listen `
    -ErrorAction SilentlyContinue

if (!$dinleme) {

    Write-Host "5000 PORTU DINLEMEDE DEGIL" -ForegroundColor Red

    Write-Host ""
    Write-Host "--- SUNUCU LOG ---" -ForegroundColor Yellow

    if (Test-Path $stdout) {
        Get-Content $stdout -Tail 80
    }

    if (Test-Path $stderr) {
        Get-Content $stderr -Tail 80
    }

    exit 1
}

Write-Host "PORT 5000 ACIK" -ForegroundColor Green

try {

    $cevap = Invoke-RestMethod `
        -Uri "http://127.0.0.1:$port/api/saglik" `
        -Method GET `
        -TimeoutSec 10

    Write-Host ""
    Write-Host "API SAGLIK TESTI BASARILI" -ForegroundColor Green
    Write-Host ""
    $cevap | ConvertTo-Json -Depth 10

}
catch {

    Write-Host ""
    Write-Host "API TESTI BASARISIZ" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red

    Write-Host ""
    Write-Host "--- SUNUCU LOG ---" -ForegroundColor Yellow

    if (Test-Path $stdout) {
        Get-Content $stdout -Tail 80
    }

    if (Test-Path $stderr) {
        Get-Content $stderr -Tail 80
    }

    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "       BAHADIR ERP V2 CALISIYOR" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Sunucu : http://127.0.0.1:5000" -ForegroundColor Cyan
Write-Host "Saglik : http://127.0.0.1:5000/api/saglik" -ForegroundColor Cyan
Write-Host "PID    : $($process.Id)" -ForegroundColor Cyan
Write-Host ""
