@echo off
chcp 65001 >nul
title Motor Drift Yarisi
cd /d "%~dp0"
rem TikTok koprusu (Dugun Konvoyu'nun koprusu) acik degilse kucuk pencerede ac
netstat -ano | findstr ":8787" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo  TikTok koprusu aciliyor...
  start "Motor Drift - TikTok Kopru" /min cmd /c "cd /d "%~dp0..\3_DugunKonvoyu" && node server.js KULLANICI_ADIN"
  timeout /t 3 >nul
)
set "GODOT=%USERPROFILE%\Desktop\Godot_v4.7.2-stable_mono_win64\Godot_v4.7.2-stable_mono_win64.exe"
if exist "%~dp0MotorDriftYarisi.exe" (
  start "" "%~dp0MotorDriftYarisi.exe"
) else (
  start "" "%GODOT%" --path "%~dp0"
)
