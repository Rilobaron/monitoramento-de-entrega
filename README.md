# Monitoramento de Entregas

Aplicativo desktop Electron para importar a planilha diária de **Monitoramento de bipagem de entrega** e gerar o quadro de acompanhamento pronto para WhatsApp.

## Usar

1. Abra `Abrir Monitoramento de Entregas.bat`. Esse inicializador usa a versão Electron descompactada, mais confiável que o executável portátil em arquivo único.
2. Clique em **Selecionar planilha** e escolha o arquivo `.xlsx` diário.
3. Confira a data e os valores do consolidado e de cada motorista.
4. Use **Copiar imagem** para colar diretamente no WhatsApp ou **Salvar PNG**.

O SLA segue a lógica da planilha: entregues ÷ total expedido. A classificação considera entrega primeiro, depois insucesso e, quando não há nenhum dos dois registros, baixa pendente.

## Desenvolvimento

O código da versão atual está em `electron-app`. Para executar em desenvolvimento, use `npm start`. Para gerar o portátil, use `npm run dist`.
