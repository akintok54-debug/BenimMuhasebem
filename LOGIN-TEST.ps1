$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "===== GERCEK LOGIN TESTI =====" -ForegroundColor Cyan

$email = Read-Host "E-posta"

if ([string]::IsNullOrWhiteSpace($email)) {
    throw "E-posta bos birakildi. Test durduruldu."
}

$secure = Read-Host "Sifre" -AsSecureString

$cred = New-Object System.Management.Automation.PSCredential(
    $email,
    $secure
)

$sifre = $cred.GetNetworkCredential().Password

$body = @{
    email = $email
    sifre = $sifre
} | ConvertTo-Json

$login = Invoke-RestMethod `
    -Uri "http://127.0.0.1:5000/api/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

if ([string]::IsNullOrWhiteSpace($login.token)) {
    throw "Sunucu login cevabinda token dondurmedi."
}

$headers = @{
    Authorization = "Bearer $($login.token)"
}

Write-Host ""
Write-Host "LOGIN GERCEKTEN BASARILI" -ForegroundColor Green
Write-Host "Kullanici : $($login.kullanici.email)"
Write-Host "Rol       : $($login.kullanici.rol)"
Write-Host "TenantId  : $($login.kullanici.tenantId)"

Write-Host ""
Write-Host "===== MUSTERI API GERCEK TEST =====" -ForegroundColor Cyan

$musteriler = Invoke-RestMethod `
    -Uri "http://127.0.0.1:5000/api/tenant/musteriler" `
    -Headers $headers

Write-Host "MUSTERI API GERCEKTEN BASARILI" -ForegroundColor Green
Write-Host "Musteri sayisi: $($musteriler.musteriler.Count)"

$global:headers = $headers
$global:login = $login

Write-Host ""
Write-Host "TOKEN POWERSHELL OTURUMUNA KAYDEDILDI" -ForegroundColor Green
