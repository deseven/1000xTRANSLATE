@echo off
:menu
cls
echo Please select an option:
echo 1. Dump game resources
echo 2. Build translation
echo 3. Clean everything up
echo 4. Install internal dependencies
echo 5. Check config file
echo 6. Exit
echo.
set /p choice="Enter your choice (1-6): "

if "%choice%"=="1" goto dump
if "%choice%"=="2" goto build
if "%choice%"=="3" goto clean
if "%choice%"=="4" goto init
if "%choice%"=="5" goto check
if "%choice%"=="6" goto exit

echo Invalid choice. Please try again.
pause
goto menu

:dump
echo Running 'npm run dump'...
call npm run dump
goto completed

:build
echo Running 'npm run build'...
call npm run build
goto completed

:clean
echo Running 'npm run clean'...
call npm run clean
goto completed

:init
echo Running 'npm run init'...
call npm run init
goto completed

:check
echo Running 'npm run check'...
call npm run check
goto completed

:completed
echo Operation completed.
pause
goto menu

:exit
exit /b