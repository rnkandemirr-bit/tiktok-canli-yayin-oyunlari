@echo off
rem Dugun Halayi: kopruyu baslatir (kapaliysa) ve kontrol panelini acar
netstat -ano | findstr ":21213" | findstr "LISTENING" >nul
if errorlevel 1 start "TikTok Kopru" /min cmd /c ""%~dp0Kopruyu Elle Baslat.bat""
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:21213/halay/kontrol"
