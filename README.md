# ETIQUETAS HMT

PWA para smartphone Android/iOS feito para o modelo atual de etiqueta HMT.

## Leitura da etiqueta

O scanner foi personalizado para buscar somente:

- `Nome do Paciente`: numero sombreado abaixo do codigo de barras esquerdo.
- `Registro`: numero sombreado abaixo do codigo de barras direito.

Exemplo na etiqueta de referencia: `Nome do Paciente` recebe `109231` e `Registro` recebe `7525561`.

O campo `Convenio` foi removido do app.

## Campos do app

- `Data`, preenchida automaticamente com a data atual e editavel para dias anteriores.
- `Nome do Paciente`, preenchido pelo scanner e editavel.
- `Registro`, preenchido pelo scanner e editavel.
- `Tipo`: `Particular`, `Complementação`, `Unimed`, `Outros`.
- `Credor`: `Caixa TOTAL`, `50%:Caixa/Plantão:50%`, `Plantão TOTAL`.
- `Plantonista(s)`: caixa de selecao multipla com as siglas definidas. Ao tocar, abre a lista e permite marcar quantas siglas forem necessarias. Quando `Credor` for `Caixa TOTAL`, o campo fica desativado porque nao e necessario.
- `Observacoes`, opcional.

Antes do envio, o app mostra uma confirmacao para conferencia dos dados.

## Resumo e PDF

O app carrega o resumo da data selecionada. Entradas com `Particular` ou `Complementação` aparecem em vermelho no resumo e no PDF.

O botao `Relatorio PDF` gera um arquivo diario em tabela.

O botao `PDF mensal no WhatsApp` gera um relatorio mensal em tabela, com selecao de mes. Em celulares compativeis, o app abre o compartilhamento do PDF para envio pelo WhatsApp. Quando o navegador nao permite compartilhar arquivo diretamente, o PDF e baixado e o WhatsApp abre com a mensagem do relatorio.

## Planilha Google

A planilha de destino ja foi criada:

- Nome: `Registros de Etiquetas`
- Link: https://docs.google.com/spreadsheets/d/1AUB4-Yl9lpS3TCgEBYMUwVDDuYQvj8suApPAJxifb8U/edit
- Pasta: https://drive.google.com/drive/u/0/folders/11rAa1MjAgUJBBOod7MBMFi84tJt9grk8

As abas `Registros` e `Listas` foram preparadas para receber o app.

O Apps Script em `apps-script/Code.gs` cria e ajusta automaticamente:

- aba `Registros`
- aba `Listas`
- cabecalhos
- listas de validacao para `Tipo` e `Credor`
- endpoint de envio
- endpoint de resumo por data

Cabecalho da aba `Registros`:

```text
Data | Nome do Paciente | Registro | Tipo | Credor | Plantonista(s) | Observações | Criado em
```

## Como ativar o envio real

O Web App do Apps Script ja esta implantado em:

```text
https://script.google.com/macros/s/AKfycbzWwukthNK5OP2itdkJ9tNR-4TZg5IfoORA8q1ke0KpLkCkKklZQJyxEpiEH0mjY0gn0w/exec
```

Essa URL ja esta configurada como padrao no PWA.

1. Abra a planilha `Registros de Etiquetas`.
2. Va em `Extensoes > Apps Script`.
3. Cole o conteudo de `apps-script/Code.gs`.
4. Salve.
5. Va em `Implantar > Nova implantacao`.
6. Escolha `Aplicativo da Web`.
7. Em `Executar como`, use `Voce`.
8. Em acesso, escolha uma opcao que permita o uso do app.
9. Copie a URL final `/exec`.
10. Se for uma nova implantacao, no PWA cole essa nova URL no campo `URL do Google Apps Script Web App` e salve.

## Publicacao no GitHub Pages

Envie estes arquivos para a raiz do repositorio:

- `index.html`
- `app.js`
- `styles.css`
- `sw.js`
- `manifest.webmanifest`
- `apps-script/Code.gs`
- `.github/workflows/deploy-pages.yml`
- `.gitignore`
- `.nojekyll`

Depois de subir na branch `main`, o GitHub Actions incluido pode publicar o site no GitHub Pages.
