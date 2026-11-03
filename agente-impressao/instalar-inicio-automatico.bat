@echo off
title Sistema Elite - Iniciar com o Windows
cd /d "%~dp0"
set "ALVO=%~dp0iniciar.bat"
set "PASTA=%~dp0"
set "ATALHO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Sistema Elite - Impressao.lnk"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:ATALHO); $s.TargetPath=$env:ALVO; $s.WorkingDirectory=$env:PASTA; $s.WindowStyle=7; $s.Save()"
if exist "%ATALHO%" (
  echo.
  echo Pronto! O programa de impressao vai abrir sozinho quando o Windows ligar.
) else (
  echo.
  echo Nao deu certo. Faca manualmente: Win+R, digite shell:startup e cole um atalho do iniciar.bat
)
echo.
pause
