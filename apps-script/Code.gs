const SPREADSHEET_NAME = "Registros de Etiquetas";
const SPREADSHEET_ID = "1uvnn00jJOiE2KweCQ6IEFm8xN4kuuBIBs6VVYorkOtY";
const REGISTROS_SHEET = "Registros";
const LISTAS_SHEET = "Listas";
const OPENAI_MODEL = "gpt-5.6";
const OPENAI_API_KEY_PROPERTY = "OPENAI_API_KEY";

const REGISTROS_HEADERS = [
  "Data",
  "Nome do Paciente",
  "Cirurgia",
  "Atendimento",
  "Tipo",
  "Credor",
  "Plantonista(s)",
  "Observacoes",
  "Criado em",
];

const TIPO_OPTIONS = ["Particular", "Complementacao", "Unimed", "Outros"];
const CREDOR_OPTIONS = ["Caixa TOTAL", "50%:Caixa/Plantao:50%", "Plantao TOTAL"];
const PLANTONISTA_OPTIONS = [
  "AD", "AA", "AL", "BA", "CH", "CR", "DE", "DN", "FL", "FR", "GU", "GB", "IG", "JA",
  "L2", "LE", "LD", "LC", "LH", "LU", "LA", "LO", "MA", "MH", "PR", "RA", "RL", "RC",
  "RO", "RU", "WE",
];

function setup() {
  return ensureWorkbook_();
}

function doGet(e) {
  try {
    const spreadsheet = ensureWorkbook_();
    const action = (e && e.parameter && e.parameter.action) || "";

    if (action === "metadata") {
      return jsonResponse({
        ok: true,
        spreadsheetName: spreadsheet.getName(),
        targetSpreadsheetName: SPREADSHEET_NAME,
        targetSheetName: REGISTROS_SHEET,
        tipoOptions: TIPO_OPTIONS,
        credorOptions: CREDOR_OPTIONS,
        plantonistaOptions: PLANTONISTA_OPTIONS,
      });
    }

    if (action === "summary") {
      const date = String(e.parameter.date || "").trim();
      return jsonResponse({
        ok: true,
        date,
        entries: getEntriesByDate_(date),
      });
    }

    if (action === "summaryMonth") {
      const month = String(e.parameter.month || "").trim();
      return jsonResponse({
        ok: true,
        month,
        entries: getEntriesByMonth_(month),
      });
    }

    return jsonResponse({
      ok: true,
      message: "ETIQUETAS HMT API online.",
      spreadsheetName: spreadsheet.getName(),
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      message: error.message,
    });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || "{}");
    const action = String(payload.action || (e.parameter && e.parameter.action) || "").trim();

    if (action === "aiExtract") {
      return handleAiExtract_(payload);
    }

    ensureWorkbook_();
    validatePayload_(payload);

    const sheet = getSpreadsheet_().getSheetByName(REGISTROS_SHEET);
    sheet.appendRow([
      payload.data || "",
      payload.nomePaciente || "",
      payload.cirurgia || "",
      payload.atendimento || "",
      payload.tipo || "",
      payload.credor || "",
      payload.plantonistas || "",
      payload.observacoes || "",
      new Date(),
    ]);

    return jsonResponse({
      ok: true,
      message: "Entrada salva com sucesso.",
      entries: getEntriesByDate_(payload.data),
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      message: error.message,
    });
  }
}

function handleAiExtract_(payload) {
  const imageDataUrl = String(payload.imageDataUrl || "").trim();
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(imageDataUrl)) {
    throw new Error("Imagem invalida para leitura com IA.");
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty(OPENAI_API_KEY_PROPERTY);
  if (!apiKey) {
    throw new Error("Configure a propriedade OPENAI_API_KEY no Apps Script.");
  }

  const prompt = [
    "Voce le etiquetas hospitalares HMT.",
    "Extraia somente os campos abaixo e responda em JSON.",
    "Regras:",
    "1. nomePaciente: texto depois de 'Nome:' e antes de 'Pront:'. Exemplo: 'Celio Cardoso'. Nao inclua Pront nem o numero do prontuario.",
    "2. cirurgia: numero impresso abaixo do primeiro codigo de barras, na parte inferior esquerda, proximo de 'N.Cirur'. Deve conter somente digitos.",
    "3. atendimento: numero impresso abaixo do segundo codigo de barras, na parte inferior direita, proximo de 'N.Atend'. Deve conter somente digitos.",
    "Se houver duvida, use string vazia no campo duvidoso. Nao invente valores.",
  ].join("\n");

  const requestBody = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "etiqueta_hmt",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["nomePaciente", "cirurgia", "atendimento"],
          properties: {
            nomePaciente: { type: "string" },
            cirurgia: { type: "string" },
            atendimento: { type: "string" },
          },
        },
      },
    },
  };

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + apiKey,
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const content = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error("Falha na IA (" + status + "): " + content.slice(0, 300));
  }

  const apiResult = JSON.parse(content);
  const outputText = extractOutputText_(apiResult);
  if (!outputText) {
    throw new Error("A IA nao retornou texto estruturado.");
  }

  const extracted = JSON.parse(outputText);
  const nomePaciente = cleanName_(extracted.nomePaciente);
  const cirurgia = cleanDigits_(extracted.cirurgia);
  const atendimento = cleanDigits_(extracted.atendimento);

  return jsonResponse({
    ok: true,
    nomePaciente,
    cirurgia,
    atendimento,
  });
}

function extractOutputText_(apiResult) {
  if (apiResult.output_text) {
    return apiResult.output_text;
  }

  const output = apiResult.output || [];
  for (let i = 0; i < output.length; i += 1) {
    const item = output[i];
    const content = item.content || [];
    for (let j = 0; j < content.length; j += 1) {
      if (content[j].type === "output_text" && content[j].text) {
        return content[j].text;
      }
    }
  }

  return "";
}

function ensureWorkbook_() {
  const spreadsheet = getSpreadsheet_();
  const registros = spreadsheet.getSheetByName(REGISTROS_SHEET) || spreadsheet.insertSheet(REGISTROS_SHEET);
  const listas = spreadsheet.getSheetByName(LISTAS_SHEET) || spreadsheet.insertSheet(LISTAS_SHEET);

  ensureHeaders_(registros, REGISTROS_HEADERS);
  seedLists_(listas);
  applyValidations_(registros, listas);
  formatRegistros_(registros);

  return spreadsheet;
}

function ensureHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const mustRewrite = headers.some((header, index) => current[index] !== header);

  if (mustRewrite) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sheet.setFrozenRows(1);
}

function seedLists_(sheet) {
  sheet.clear();
  sheet.getRange(1, 1, 1, 3).setValues([["Tipo", "Credor", "Plantonista(s)"]]);
  sheet.getRange(2, 1, TIPO_OPTIONS.length, 1).setValues(TIPO_OPTIONS.map((value) => [value]));
  sheet.getRange(2, 2, CREDOR_OPTIONS.length, 1).setValues(CREDOR_OPTIONS.map((value) => [value]));
  sheet.getRange(2, 3, PLANTONISTA_OPTIONS.length, 1).setValues(PLANTONISTA_OPTIONS.map((value) => [value]));
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 3);
}

function applyValidations_(registros, listas) {
  const lastRow = Math.max(registros.getMaxRows(), 1000);
  const tipoRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(listas.getRange(2, 1, TIPO_OPTIONS.length, 1), true)
    .setAllowInvalid(false)
    .build();
  const credorRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(listas.getRange(2, 2, CREDOR_OPTIONS.length, 1), true)
    .setAllowInvalid(false)
    .build();

  registros.getRange(2, 5, lastRow - 1, 1).setDataValidation(tipoRule);
  registros.getRange(2, 6, lastRow - 1, 1).setDataValidation(credorRule);
}

function formatRegistros_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, REGISTROS_HEADERS.length);
  headerRange
    .setBackground("#0b3f3a")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  sheet.autoResizeColumns(1, REGISTROS_HEADERS.length);
}

function validatePayload_(payload) {
  const required = ["data", "nomePaciente", "cirurgia", "atendimento", "tipo", "credor"];
  if (payload.credor !== "Caixa TOTAL") {
    required.push("plantonistas");
  }

  const missing = required.filter((key) => !String(payload[key] || "").trim());
  if (missing.length) {
    throw new Error("Campos obrigatorios ausentes: " + missing.join(", "));
  }
}

function getEntriesByDate_(date) {
  const sheet = getSpreadsheet_().getSheetByName(REGISTROS_SHEET);
  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, REGISTROS_HEADERS.length).getDisplayValues();
  return values
    .filter((row) => normalizeDate_(row[0]) === date)
    .map(rowToEntry_);
}

function getEntriesByMonth_(month) {
  const sheet = getSpreadsheet_().getSheetByName(REGISTROS_SHEET);
  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, REGISTROS_HEADERS.length).getDisplayValues();
  return values
    .filter((row) => normalizeDate_(row[0]).slice(0, 7) === month)
    .map(rowToEntry_);
}

function rowToEntry_(row) {
  return {
    data: normalizeDate_(row[0]),
    nomePaciente: row[1],
    cirurgia: row[2],
    atendimento: row[3],
    tipo: row[4],
    credor: row[5],
    plantonistas: row[6],
    observacoes: row[7],
    criadoEm: row[8],
  };
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function normalizeDate_(value) {
  const text = String(value || "").trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return text;
  }

  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return brMatch[3] + "-" + brMatch[2] + "-" + brMatch[1];
  }

  return text;
}

function cleanDigits_(value) {
  return String(value || "").replace(/\D/g, "");
}

function cleanName_(value) {
  return String(value || "")
    .replace(/\bPront\s*:.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
