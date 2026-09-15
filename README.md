# Monitoramento de Entregas

Aplicativo Windows que importa a planilha diária de **Monitoramento de bipagem de entrega** e reproduz a lógica da planilha de controle:

- `ENTREGUE`: existe horário da entrega;
- `INSUCESSO`: não há entrega e existe horário de registro de pacote problemático;
- `BAIXA PENDENTE`: não há entrega nem registro de pacote problemático;
- `SLA`: entregues ÷ total expedido, no consolidado e por motorista.

## Executar

Abra `Monitoramento de Entregas.exe`, clique em **Selecionar planilha** e escolha o arquivo `.xlsx` baixado do sistema.

O aplicativo seleciona automaticamente a data mais recente do arquivo. A data pode ser alterada no filtro. O botão **Exportar CSV** gera o resumo exibido na tela.

O executável entregue usa o .NET Framework já incluído no Windows.
