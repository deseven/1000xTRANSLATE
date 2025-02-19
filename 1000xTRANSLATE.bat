@echo off
:menu
cls
echo Please select an option:
echo 1. Dump game resources
echo 2. Build translation
echo 3. Clean everything up
echo 4. Install internal dependencies
echo 5. Check config file
echo.
set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" goto dump
if "%choice%"=="2" goto build
if "%choice%"=="3" goto clean
if "%choice%"=="4" goto init
if "%choice%"=="5" goto check

echo Invalid choice. Please try again.
pause
goto menu

:dump
echo Running 'npm run dump'...
npm run dump
goto end

:build
echo Running 'npm run build'...
npm run build
goto end

:clean
echo Running 'npm run clean'...
npm run clean
goto end

:init
echo Running 'npm run init'...
npm run init
goto end

:check
echo Running 'npm run check'...
npm run check
goto end

:end
echo Operation completed.
pause