# ETIQUETAS HMT

PWA para smartphone Android/iOS para leitura de etiquetas HMT com IA.

## Leitura da etiqueta

O app nao usa mais OCR local. O botao `Ler com IA` envia a foto capturada ao Google Apps Script, que chama a OpenAI API com visao e retorna:

- `Nome do Paciente`: texto depois de `Nome:` e antes de `Pront:`.
- `Cirurgia`: numero abaixo do primeiro codigo de barras, na area inferior esquerda.
- `Atendimento`: numero abaixo do segundo codigo de barras, na area inferior direita.

Exemplo na etiqueta de referencia:

```text
Nome do Paciente: Celio Cardoso
Cirurgia: 109231
Atendimento: 7525561
```

## Campos do app

- `Data`, preenchida automaticamente com a data atual e editavel para dias anteriores.
- `Nome do Paciente`, preenchido pela IA e editavel.
- `Cirurgia`, preenchida pela IA e editavel.
- `Atendimento`, preenchido pela IA e editavel.
- `Tipo`: `Particular`, `Complementacao`, `Unimed`, `Outros`.
- `Credor`: `Caixa TOTAL`, `50%:Caixa/Plantao:50%`, `Plantao TOTAL`.
- `Plantonista(s)`: caixa de selecao multipla. Quando `Credor` for `Caixa TOTAL`, o campo fica desativado.
- `Observacoes`, opcional.

Antes do envio, o app mostra uma confirmacao para conferencia dos dados.

## Planilha Google

Planilha de destino:

- Link: https://docs.google.com/spreadsheets/d/1uvnn00jJOiE2KweCQ6IEFm8xN4kuuBIBs6VVYorkOtY/edit

O Apps Script em `apps-script/Code.gs` cria e ajusta automaticamente:

- aba `Registros`
- aba `Listas`
- cabecalhos
- listas de validacao para `Tipo` e `Credor`
- endpoint de leitura com IA
- endpoint de envio
- endpoint de resumo por data e por mes

Cabecalho esperado da aba `Registros`:

```text
Data | Nome do Paciente | Cirurgia | Atendimento | Tipo | Credor | Plantonista(s) | Observacoes | Criado em
```

## Como ativar a IA

1. Abra a planilha nova.
2. Va em `Extensoes > Apps Script`.
3. Cole o conteudo de `apps-script/Code.gs`.
4. Em `Configuracoes do projeto > Propriedades do script`, crie a propriedade `OPENAI_API_KEY` com sua chave da OpenAI API.
5. Salve.
6. Execute a funcao `setup` uma vez para preparar as abas e autorizar o script.
7. Va em `Implantar > Nova implantacao`.
8. Escolha `Aplicativo da Web`.
9. Em `Executar como`, use `Voce`.
10. Em acesso, escolha uma opcao que permita o uso do app.
11. Copie a URL final `/exec`.
12. URL configurada como padrao no PWA:

```text
https://script.google.com/macros/s/AKfycbxyZIn0JO7eCrCOo5MdaCQkrUMuUwGB0HY_Z6j5FZ8xS5OEJ4ySQLNPaUoIz8nbbrKN/exec
```

Se criar uma nova implantacao no futuro, cole a nova URL em `URL do Google Apps Script Web App` e salve.

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
