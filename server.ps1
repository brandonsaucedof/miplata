# MiPlata - Local Network Server (PowerShell)
# Serves files on your local WiFi network so your phone can access it
# Run: powershell -ExecutionPolicy Bypass -File server.ps1

$port = 8080
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $root) { $root = (Get-Location).Path }

# Get local WiFi IP
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -notmatch 'Loopback' -and 
    $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and
    $_.PrefixOrigin -ne 'WellKnown'
} | Select-Object -First 1).IPAddress

if (-not $localIP) { $localIP = "127.0.0.1" }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:${port}/")
$listener.Prefixes.Add("http://127.0.0.1:${port}/")
$listener.Prefixes.Add("http://${localIP}:${port}/")
$listener.Prefixes.Add("http://+:${port}/")

$mimeTypes = @{
    ".html"  = "text/html; charset=utf-8"
    ".css"   = "text/css; charset=utf-8"
    ".js"    = "application/javascript; charset=utf-8"
    ".json"  = "application/json; charset=utf-8"
    ".png"   = "image/png"
    ".jpg"   = "image/jpeg"
    ".jpeg"  = "image/jpeg"
    ".svg"   = "image/svg+xml"
    ".ico"   = "image/x-icon"
    ".webp"  = "image/webp"
    ".woff"  = "font/woff"
    ".woff2" = "font/woff2"
    ".webmanifest" = "application/manifest+json"
}

try {
    $listener.Start()
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║    MiPlata - Servidor de Desarrollo  ║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  PC:       http://localhost:$port" -ForegroundColor Green
    Write-Host "  Telefono: http://${localIP}:${port}" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Abre la URL del telefono en Chrome/Safari" -ForegroundColor White
    Write-Host "  para probar la app en tu red WiFi." -ForegroundColor White
    Write-Host ""
    Write-Host "  NOTA: Para instalar como PWA necesitas HTTPS." -ForegroundColor DarkYellow
    Write-Host "  Usa Netlify/Vercel para el hosting final." -ForegroundColor DarkYellow
    Write-Host ""
    Write-Host "  Presiona Ctrl+C para detener" -ForegroundColor DarkGray
    Write-Host ""

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "/") { $urlPath = "/index.html" }

        $relativePath = $urlPath.TrimStart("/").Replace("/", "\")
        $filePath = Join-Path $root $relativePath

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = $mimeTypes[$ext]
            if (-not $contentType) { $contentType = "application/octet-stream" }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.StatusCode = 200
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Cache-Control", "no-cache")

            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "  200  $urlPath" -ForegroundColor Green
        }
        else {
            $indexPath = Join-Path $root "index.html"
            if (Test-Path $indexPath) {
                $bytes = [System.IO.File]::ReadAllBytes($indexPath)
                $response.ContentType = "text/html; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $response.StatusCode = 200
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "  200  $urlPath -> index.html" -ForegroundColor Yellow
            }
            else {
                $response.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.ContentLength64 = $msg.Length
                $response.OutputStream.Write($msg, 0, $msg.Length)
                Write-Host "  404  $urlPath" -ForegroundColor Red
            }
        }

        $response.OutputStream.Close()
    }
}
catch {
    if ($_.Exception.Message -match "access is denied|acceso") {
        Write-Host ""
        Write-Host "  ERROR: Necesitas permisos de administrador" -ForegroundColor Red
        Write-Host "  para escuchar en todas las interfaces." -ForegroundColor Red
        Write-Host ""
        Write-Host "  Ejecuta PowerShell como Administrador o usa:" -ForegroundColor Yellow
        Write-Host "  netsh http add urlacl url=http://+:$port/ user=$env:USERNAME" -ForegroundColor Yellow
        Write-Host ""
    }
    else {
        Write-Host "  Servidor detenido." -ForegroundColor Yellow
    }
}
finally {
    if ($listener) {
        $listener.Stop()
        $listener.Close()
    }
}
