@echo off
rem Ouvre OmegaX dans une fenetre d'application Edge (sans barre d'adresse),
rem a defaut dans le navigateur par defaut du poste.
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app=http://localhost:8080
) else (
  start "" http://localhost:8080
)
