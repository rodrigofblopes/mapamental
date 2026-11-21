@echo off
chcp 65001 >nul
title Publicar (GitHub -^> Vercel)
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo [ERRO] O Git nao esta instalado.
  echo Baixe em https://git-scm.com/download/win, instale e rode este arquivo de novo.
  pause
  exit /b 1
)

rem ---------- Primeira vez: liga a pasta ao repositorio do GitHub ----------
if not exist ".git" (
  echo Primeira vez: vamos ligar esta pasta ao GitHub.
  echo Crie um repositorio VAZIO em https://github.com/new ^(sem README^)
  echo e cole o link dele aqui. Exemplo: https://github.com/seu-usuario/mapa-grecia.git
  echo.
  set /p REPO=Link do repositorio: 
  git init
  git branch -M main
  call git remote add origin %%REPO%%
)

rem ---------- Envia as mudancas ----------
git add -A
git commit -m "Atualizacao %date% %time:~0,5%"
if errorlevel 1 echo (Nada novo para salvar, so enviando...)

git push -u origin main
if errorlevel 1 (
  echo.
  echo [ERRO] Nao consegui enviar para o GitHub. Leia a mensagem acima.
  echo Se pedir login, entre com sua conta do GitHub na janela que abrir.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Enviado para o GitHub!
echo   A Vercel atualiza o site sozinha em ~1 minuto.
echo   Mapa de ideias:  ^<seu-link^>/ideias
echo ============================================
pause
