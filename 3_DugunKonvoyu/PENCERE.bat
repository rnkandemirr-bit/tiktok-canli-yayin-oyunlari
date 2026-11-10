@echo off
rem Oyun penceresini acar (TikTok LIVE Studio'da "Pencere yakalama" ile bu pencereyi sec)
rem Ayrica kiz sesiyle anons yapan kucuk Edge penceresini acar (Emel sesi)
if "%~1"=="bekle" timeout /t 4 /nobreak >nul

rem --- Anons penceresi (Microsoft Edge, Emel sesi) ---
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"name='msedge.exe'\" | Where-Object { $_.CommandLine -match 'KonvoySes' }) { exit 1 } else { exit 0 }"
if not errorlevel 1 (
  set "EDG=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  if not exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDG=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  call :edge
)

rem --- Oyun penceresi zaten aciksa ikincisini acma (kendisi kopruye yeniden baglanir) ---
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { $_.CommandLine -match 'KonvoyChrome' }) { exit 1 } else { exit 0 }"
if errorlevel 1 exit
set "CHR=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHR%" set "CHR=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHR%" set "CHR=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if exist "%CHR%" (
  start "" "%CHR%" --app=http://localhost:8787 --user-data-dir="%LOCALAPPDATA%\KonvoyChrome" --window-size=608,1080 --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --no-first-run --no-default-browser-check
) else (
  start "" http://localhost:8787
)
exit

:edge
if exist "%EDG%" start "" "%EDG%" --app=http://localhost:8787/anons --user-data-dir="%LOCALAPPDATA%\KonvoySes" --window-size=360,200 --window-position=0,0 --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --no-first-run --no-default-browser-check
exit /b 0
