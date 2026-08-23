@echo off
set JAVA_HOME=C:\Users\ASUS\Desktop\religion app\jdk21\jdk-21.0.4+7
cd /d "%~dp0android"
call gradlew.bat bundleRelease
call gradlew.bat assembleRelease
if %ERRORLEVEL% EQU 0 (
    copy /Y "app\build\outputs\bundle\release\app-release.aab" "%~dp0app-release.aab"
    copy /Y "app\build\outputs\apk\release\app-release.apk" "%~dp0app-release.apk"
    echo.
    echo =======================================================
    echo Release AAB and APK successfully copied to root folder:
    echo %~dp0app-release.aab
    echo %~dp0app-release.apk
    echo =======================================================
)
