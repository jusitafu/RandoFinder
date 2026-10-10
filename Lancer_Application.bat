@echo off
title Randonneurs Sanaryens - RandoFinder
echo ========================================================
echo   Les Randonneurs Sanaryens - RandoFinder
echo   JLD Apps - 2026
echo ========================================================
echo.
echo Lancement de RandoFinder dans votre navigateur...

:: Tente de lancer le serveur local s'il y a Python
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start /b python -m http.server 8080 >nul 2>&1
    timeout /t 1 >nul
    start http://localhost:8080
    exit
)

:: Sinon ouvre directement le fichier index.html dans le navigateur par defaut
start "" "%~dp0index.html"
exit
