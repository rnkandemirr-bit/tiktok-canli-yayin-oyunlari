@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Taht Kavgasi - TikTok Yayin

echo ============================================
echo   TAHT KAVGASI - TIKTOK YAYIN OYUNU
echo ============================================
echo.
set KULLANICI=
set /p KULLANICI=TikTok kullanici adin (@ olmadan, bos = ayarlar.json):

rem Kopru zaten aciksa (port 21213 dinleniyorsa) ikinci kez acma
netstat -ano | findstr /R /C:"127.0.0.1:21213 .*LISTENING" >nul
if %errorlevel%==0 (
    echo TikTok koprusu zaten acik, o kullaniliyor.
) else (
    echo TikTok koprusu aciliyor ^(bu pencereyi kapatma^)...
    start "TikTok Kopru" cmd /k node "Araclar\TikTokKopru\kopru.js" %KULLANICI%
    timeout /t 3 >nul
)

echo Oyun aciliyor (dikey yayin penceresi)...
start "" "%USERPROFILE%\Desktop\Godot_v4.7.2-stable_mono_win64\Godot_v4.7.2-stable_mono_win64.exe" --path "%~dp0." -- --yayin --taht

echo.
echo Hazir! TikTok LIVE Studio'da "Taht Kavgasi - TikTok Yayin" penceresini yakala.
echo Kurallar: 200 begeni = sahneye gir, Gul = 1 basamak, Donut = taht, "kral"/"kralice" yaz = taht sec
echo Test tuslari (oyun penceresinde): F2 10 kisi katilir, F3 yorum, F4 gul, F5 gul serisi,
echo   F6 donut, F7 40 kisi, F8 disaridan gul, F9 FPS
echo Kopru testi (canli yayin olmadan): node Araclar\TikTokKopru\taht_test.js
timeout /t 10 >nul
