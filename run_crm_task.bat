@echo off
echo Starting CRM Automation...
echo Please wait while Chrome launches...

set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "EXT_PATH=%~dp0crm_automation_ext"
set "USER_DATA=%~dp0chrome_temp_profile"
set "URL=https://bss.omanbroadband.om/crm/authSuccess"

if not exist "%CHROME_PATH%" (
    echo Chrome not found at default location.
    echo Please ensure Google Chrome is installed.
    pause
    exit /b
)

echo Launching Chrome with automation extension...
"%CHROME_PATH%" --load-extension="%EXT_PATH%" --user-data-dir="%USER_DATA%" --no-first-run --no-default-browser-check "%URL%"

echo.
echo Automation process has been initiated in the browser.
echo Please observe the browser window.
pause
