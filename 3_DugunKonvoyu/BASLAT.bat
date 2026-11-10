@echo off
chcp 65001 >nul
title Dugun Konvoyu - Kopru
cd /d "%~dp0"

rem ===== AYAR: TikTok kullanici adin =====
set KADI=KULLANICI_ADIN
rem =======================================

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [HATA] Node.js bulunamadi. https://nodejs.org adresinden kurup tekrar calistir.
  pause
  exit /b 1
)

set EKSIK=
if not exist "node_modules\tiktok-live-connector\package.json" set EKSIK=1
if not exist "node_modules\ws\package.json" set EKSIK=1
if not exist "node_modules\three\build\three.module.js" set EKSIK=1
if defined EKSIK (
  echo  Paketler kuruluyor, ilk seferde 1-2 dakika surebilir...
  call npm install --no-audit --no-fund
)

rem Kopru zaten aciksa ikinci kez acma, sadece oyun penceresini ac
netstat -ano | findstr ":8787" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo  Kopru zaten acik. Oyun penceresi aciliyor...
  start "" /min "%~dp0PENCERE.bat"
  timeout /t 3 >nul
  exit /b 0
)

rem Kopru acildiktan birkac sn sonra oyun penceresi kendiliginden acilir
start "" /min "%~dp0PENCERE.bat" bekle

:kopru
echo.
echo  =============================================
echo    DUGUN KONVOYU - kopru calisiyor
echo    Kullanici: @%KADI%
echo    Bu pencereyi yayin bitene kadar KAPATMA.
echo  =============================================
echo.
node server.js %KADI%
echo.
echo  Kopru kapandi, 3 sn sonra yeniden baslatiliyor... (cikmak icin pencereyi kapat)
timeout /t 3 >nul
goto kopru
