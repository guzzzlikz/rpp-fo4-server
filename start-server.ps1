# Запуск FMP-сервера с проверками окружения. Запускается через start-server.cmd.
#  - Отказывается стартовать, если в пути к папке есть не-латинские символы: FMPServer.exe
#    искажает их и не находит ресурсы (Cannot find module 'C:/Users/пїЅпїЅпїЅ/...').
#    subst и junction не помогают: сервер раскрывает их в настоящий путь.
#  - Не закрывает окно, если сервер упал, чтобы было видно, что случилось.
param([switch]$NoPause)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$server = Join-Path $root 'server'

function Wait-Key {
    if (-not $NoPause) {
        Write-Host ''
        Write-Host 'Нажми Enter, чтобы закрыть окно...'
        [void][Console]::ReadLine()
    }
}

if ($root -match '[^\x00-\x7F]') {
    Write-Host ''
    Write-Host 'ОШИБКА: в пути к серверу есть кириллица или другие не-латинские символы:' -ForegroundColor Red
    Write-Host "  $root" -ForegroundColor Yellow
    Write-Host ''
    Write-Host 'FMPServer.exe с таким путём не загрузит ресурсы (gamemode, healthcheck).'
    Write-Host 'Перенеси папку fo4-server туда, где весь путь латинский, например:'
    Write-Host '  C:\fo4-server' -ForegroundColor Green
    Write-Host 'Рабочий стол, Документы и Загрузки не подходят, если имя пользователя Windows на кириллице.'
    Write-Host 'Подробнее: docs\known-issues.md'
    Wait-Key
    exit 1
}

$exe = Join-Path $server 'FMPServer.exe'
if (-not (Test-Path $exe)) {
    Write-Host "ОШИБКА: не найден $exe" -ForegroundColor Red
    Wait-Key
    exit 1
}

Set-Location $server
# The server writes UTF-8: without this the console shows Cyrillic chat as "╨░╨▓╤Л".
chcp 65001 > $null
& $exe
$code = $LASTEXITCODE

if ($code -ne 0) {
    Write-Host ''
    Write-Host ("Сервер завершился с кодом 0x{0:X8} ({0})." -f $code) -ForegroundColor Red
    if ($code -eq -1073740791) {
        Write-Host 'Это аварийное завершение. Частая причина: пустой или неверный mod.game_data_path в server\server.json.'
    }
    Write-Host 'Смотри server\logs и docs\known-issues.md'
    Wait-Key
}
exit $code
