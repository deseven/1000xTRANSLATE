:menu
cls
echo Please select an option:
echo 1. Dump game resources
echo 2. Translate
echo 3. Check
echo 4. Build translation
echo 5. Clean up extracted and modified resources
echo 6. Install internal dependencies
echo 7. Validate config and dependencies
echo 8. Exit
echo.
set /p choice="Enter your choice (1-8): "

if "%choice%"=="1" goto dump
if "%choice%"=="2" goto translate
if "%choice%"=="3" goto check
if "%choice%"=="4" goto build
if "%choice%"=="5" goto clean
if "%choice%"=="6" goto init
if "%choice%"=="7" goto validate
if "%choice%"=="8" goto exit

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

:check
echo Running 'npm run check'...
call npm run check
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

:validate
echo Running 'npm run validate'...
call npm run validate
goto completed

:completed
echo Operation completed.
pause
goto menu

:exit
exit /b