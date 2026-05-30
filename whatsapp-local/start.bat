@echo off
chcp 65001 >nul
title نظام الأضاحي — واتساب
color 0A

echo.
echo  ██╗    ██╗ █████╗ ████████╗███████╗ █████╗ ██████╗
echo  ██║    ██║██╔══██╗╚══██╔══╝██╔════╝██╔══██╗██╔══██╗
echo  ██║ █╗ ██║███████║   ██║   ███████╗███████║██████╔╝
echo  ██║███╗██║██╔══██║   ██║   ╚════██║██╔══██║██╔═══╝
echo  ╚███╔███╔╝██║  ██║   ██║   ███████║██║  ██║██║
echo   ╚══╝╚══╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝
echo.
echo  نظام إدارة الأضاحي — خدمة واتساب المحلية
echo  ==========================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo  ❌ Node.js غير مثبت!
  echo  حمّله من: https://nodejs.org
  pause
  exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules\" (
  echo  📦 تثبيت المكتبات — مرة واحدة فقط...
  echo.
  npm install
  echo.
)

echo  ✅ كل شيء جاهز — جاري التشغيل...
echo  📱 افتح المتصفح على النظام وانتقل لتبويب "واتساب"
echo.
echo  لإيقاف الخدمة: اضغط Ctrl+C
echo.

node server.js

pause
