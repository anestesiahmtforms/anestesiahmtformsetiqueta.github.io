# ETIQUETAS HMT

PWA para smartphone Android/iOS feito para o modelo atual de etiqueta HMT.

## Leitura da etiqueta

O scanner foi personalizado para buscar somente:

- `Nome do Paciente`: linha em letras maiusculas grandes, na faixa superior esquerda da etiqueta.
- `Registro`: numero abaixo do codigo de barras, na area direita da etiqueta.

O campo `Convenio` foi removido do app.

## Campos do app

- `Data`, preenchida automaticamente com a data atual e editavel para dias anteriores.
- `Nome do Paciente`, preenchido pelo scanner e editavel.
- `Registro`, preenchido pelo scanner e editavel.
- `Tipo`: `Particular`, `Complementação`, `Unimed`, `Outros`.
- `Credor`: `Caixa TOTAL`, `50%:Caixa/Plantão:50%`, `Plantão TOTAL`.
- `Plantonista(s)`: lista com as siglas definidas.
- `Observacoes`, opcional.

Antes do envio, o app mostra uma confirmacao para conferencia dos dados.

## Resumo e PDF

O app carrega o resumo da data selecionada. Entradas com `Particular` ou `Complementação` aparecem em vermelho no resumo e no PDF.

O botao `Relatorio PDF` gera um arquivo em tabela para envio por WhatsApp.

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

1. Abra a planilha `Registros de Etiquetas`.
2. Va em `Extensoes > Apps Script`.
3. Cole o conteudo de `apps-script/Code.gs`.
4. Salve.
5. Va em `Implantar > Nova implantacao`.
6. Escolha `Aplicativo da Web`.
7. Em `Executar como`, use `Voce`.
8. Em acesso, escolha uma opcao que permita o uso do app.
9. Copie a URL final `/exec`.
10. No PWA, cole essa URL no campo `URL do Google Apps Script Web App` e salve.

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
