@echo off
echo Iniciando o Validador de Comprovantes...
echo.

REM Verificar se o Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Erro: Node.js não encontrado!
    echo Por favor, instale o Node.js de https://nodejs.org/
    pause
    exit /b 1
)

REM Instalar dependências se necessário
if not exist node_modules (
    echo Instalando dependências...
    npm install
)

REM Criar pasta public se não existir
if not exist public mkdir public

REM Iniciar o servidor
echo Servidor iniciado! Abrindo o navegador...
start http://localhost:3000
npm start

pause 