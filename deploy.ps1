# MiPlata — Quick deploy script
# Usage: powershell -ExecutionPolicy Bypass -File deploy.ps1 "mensaje del cambio"

param(
    [string]$Message = "update"
)

$env:Path = "$env:LOCALAPPDATA\PortableGit\cmd;$env:Path"

# Increment cache version automatically in sw.js
$swFile = Join-Path $PSScriptRoot "sw.js"
$swContent = Get-Content $swFile -Raw
if ($swContent -match "miplata-v(\d+)") {
    $currentVersion = [int]$Matches[1]
    $newVersion = $currentVersion + 1
    $swContent = $swContent -replace "miplata-v$currentVersion", "miplata-v$newVersion"
    Set-Content $swFile $swContent -NoNewline
    Write-Host "  Cache version: v$currentVersion -> v$newVersion" -ForegroundColor Cyan
}

# Git add, commit, push
git add .
git commit -m $Message
git push

Write-Host ""
Write-Host "  ✅ Desplegado! Los cambios estarán vivos en ~30 segundos" -ForegroundColor Green
Write-Host "  Recarga la app en tu teléfono para ver los cambios." -ForegroundColor Yellow
Write-Host ""
