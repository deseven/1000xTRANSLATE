@echo off
:menu
cls
echo Please select an option:
echo 1. Dump game resources
echo 2. Translate
echo 3. Build translation
echo 4. Clean up extracted and modified resources
echo 5. Install internal dependencies
echo 6. Check config file
echo 7. Exit
echo.
set /p choice="Enter your choice (1-7): "

if "%choice%"=="1" goto dump
if "%choice%"=="2" goto translate
if "%choice%"=="3" goto build
if "%choice%"=="4" goto clean
if "%choice%"=="5" goto init
if "%choice%"=="6" goto check
if "%choice%"=="7" goto exit

echo Invalid choice. Please try again.
pause
goto menu

:dump
echo Running 'npm run dump'...
call npm run dump
goto completed

:translate
echo Running 'npm run translate'...
call npm run translate
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