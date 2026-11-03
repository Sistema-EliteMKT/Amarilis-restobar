@echo off
title Sistema Elite - Agente de impressao
cd /d "%~dp0"
echo Conferindo atualizacoes do agente...
call npm install --omit=dev --no-audit --no-fund
:loop
node agente.js
echo O agente parou. Reiniciando em 5 segundos...
timeout /t 5 >nul
goto loop
