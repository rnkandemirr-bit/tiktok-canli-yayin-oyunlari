@echo off
rem Konvoyu sifirlar (kopru acikken calistir)
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:8787/sifirla).Content } catch { 'Kopru kapali! Once Dugun Konvoyu BASLAT kisayolunu ac.' }"
timeout /t 3 >nul
