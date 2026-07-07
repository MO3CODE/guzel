@echo off
chcp 65001 >nul
title نظام الأضاحي — المونتاج
color 0B

echo.
echo  ██╗   ██╗██╗██████╗ ███████╗ ██████╗
echo  ██║   ██║██║██╔══██╗██╔════╝██╔═══██╗
echo  ██║   ██║██║██║  ██║█████╗  ██║   ██║
echo  ╚██╗ ██╔╝██║██║  ██║██╔══╝  ██║   ██║
echo   ╚████╔╝ ██║██████╔╝███████╗╚██████╔╝
echo    ╚═══╝  ╚═╝╚═════╝ ╚══════╝ ╚═════╝
echo.
echo  نظام إدارة الأضاحي — خدمة المونتاج المحلية
echo  ============================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo  ❌ Node.js غير مثبت!
  echo  حمّله من: https://nodejs.org
  pause
  exit /b 1
)

:: The project drive (D:) is FAT32 and nearly full — run the service from
:: %LOCALAPPDATA%\adahi-video\service instead (videos/cache also live there)
set "SERVICE_DIR=%LOCALAPPDATA%\adahi-video\service"
if not exist "%SERVICE_DIR%" mkdir "%SERVICE_DIR%"

copy /Y "%~dp0server.js"    "%SERVICE_DIR%\server.js"    >nul
copy /Y "%~dp0package.json" "%SERVICE_DIR%\package.json" >nul

cd /d "%SERVICE_DIR%"

:: Install dependencies if needed (includes FFmpeg — ~130MB first time)
if not exist "node_modules\express\" (
  echo  📦 تثبيت المكتبات وFFmpeg — مرة واحدة فقط ^(~130MB^)...
  echo.
  call npm install --no-bin-links --no-audit --no-fund
  echo.
)

echo  ✅ كل شيء جاهز — جاري التشغيل...
echo  💾 مجلد البيانات: %LOCALAPPDATA%\adahi-video
echo  🎞 افتح المتصفح على النظام وانتقل لتبويب "المونتاج"
echo.
echo  لإيقاف الخدمة: اضغط Ctrl+C
echo.

node server.js

pause
