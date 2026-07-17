const SPREADSHEET_NAME = "Registros de Etiquetas";
const SPREADSHEET_ID = "1AUB4-Yl9lpS3TCgEBYMUwVDDuYQvj8suApPAJxifb8U";
const REGISTROS_SHEET = "Registros";
const LISTAS_SHEET = "Listas";
const REGISTROS_HEADERS = [
  "Data",
  "Nome do Paciente",
  "Registro",
  "Tipo",
  "Credor",
  "Plantonista(s)",
  "Observações",
  "Criado em",
];

const TIPO_OPTIONS = ["Particular", "Complementação", "Unimed", "Outros"];
const CREDOR_OPTIONS = ["Caixa TOTAL", "50%:Caixa/Plantão:50%", "Plantão TOTAL"];
const PLANTONISTA_OPTIONS = [
  "AD", "AA", "AL", "BA", "CH", "CR", "DE", "DN", "FL", "FR", "GU", "GB", "IG", "JÁ",
  "L2", "LE", "LD", "LC", "LH", "LU", "LA", "LO", "MA", "MH", "PR", "RA", "RL", "RC",
  "RO", "RU", "WE",
];

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
    ensureWorkbook_();
    const payload = JSON.parse((e.postData && e.postData.contents) || "{}");
    validatePayload_(payload);

    const sheet = getSpreadsheet_().getSheetByName(REGISTROS_SHEET);
    sheet.appendRow([
      payload.data || "",
      payload.nomePaciente || "",
      payload.registro || "",
      payload.tipo || "",
      payload.credor || "",
      payload.plantonistas || "",
      payload.observacoes || "",
      new Date(),
    ]);

    return jsonResponse({
      ok: true,
      message: "Registro salvo com sucesso.",
      entries: getEntriesByDate_(payload.data),
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      message: error.message,
    });
  }
}

function ensureWorkbook_() {
  const spreadsheet = getSpreadsheet_();
  if (spreadsheet.getName() !== SPREADSHEET_NAME) {
    // O script tambem funciona em uma planilha com outro nome, mas informa o alvo correto ao app.
  }

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

  registros.getRange(2, 4, lastRow - 1, 1).setDataValidation(tipoRule);
  registros.getRange(2, 5, lastRow - 1, 1).setDataValidation(credorRule);
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
  const required = ["data", "nomePaciente", "registro", "tipo", "credor", "plantonistas"];
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
    .map((row) => ({
      data: normalizeDate_(row[0]),
      nomePaciente: row[1],
      registro: row[2],
      tipo: row[3],
      credor: row[4],
      plantonistas: row[5],
      observacoes: row[6],
      criadoEm: row[7],
    }));
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }

  return SpreadsheetApp.getActiveSpreadsheet();
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

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
