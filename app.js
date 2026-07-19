const CONFIG = {
  storageKey: "etiqueta-hmt-registros-v1",
  guideWidthRatio: 0.94,
  guideAspectRatio: 3.35,
  defaultScriptUrl: "https://script.google.com/macros/s/AKfycbzWwukthNK5OP2itdkJ9tNR-4TZg5IfoORA8q1ke0KpLkCkKklZQJyxEpiEH0mjY0gn0w/exec",
};

const ZONES = {
  nome: { x: 0.03, y: 0.11, width: 0.76, height: 0.13 },
  registro: { x: 0.55, y: 0.70, width: 0.38, height: 0.24 },
};

const ALERT_TYPES = new Set(["particular", "complementacao", "complementação"]);
const CAIXA_TOTAL = "Caixa TOTAL";

const state = {
  stream: null,
  imageBlob: null,
  imageUrl: "",
  worker: null,
  metadata: null,
  config: loadConfig(),
  summaryRows: [],
};

const cameraEl = document.querySelector("#camera");
const canvasEl = document.querySelector("#snapshot");
const previewEl = document.querySelector("#preview");
const cameraStatusEl = document.querySelector("#camera-status");
const processingStatusEl = document.querySelector("#processing-status");
const sheetStatusEl = document.querySelector("#sheet-status");
const scriptUrlEl = document.querySelector("#script-url");
const formEl = document.querySelector("#label-form");
const summaryDateEl = document.querySelector("#summary-date");
const reportMonthEl = document.querySelector("#report-month");
const summaryTotalsEl = document.querySelector("#summary-totals");
const summaryListEl = document.querySelector("#summary-list");

const fields = {
  data: document.querySelector("#data"),
  nomePaciente: document.querySelector("#nomePaciente"),
  registro: document.querySelector("#registro"),
  tipo: document.querySelector("#tipo"),
  credor: document.querySelector("#credor"),
  plantonistas: document.querySelector("#plantonistas"),
  observacoes: document.querySelector("#observacoes"),
};

document.querySelector("#start-camera").addEventListener("click", startCamera);
document.querySelector("#capture-image").addEventListener("click", captureFromCamera);
document.querySelector("#upload-image").addEventListener("change", handleFileUpload);
document.querySelector("#process-image").addEventListener("click", processCurrentImage);
document.querySelector("#send-sheet").addEventListener("click", sendToSheet);
document.querySelector("#clear-form").addEventListener("click", resetForm);
document.querySelector("#save-settings").addEventListener("click", saveSettings);
document.querySelector("#load-summary").addEventListener("click", loadSummary);
document.querySelector("#generate-pdf").addEventListener("click", generatePdfReport);
document.querySelector("#generate-month-pdf-whatsapp").addEventListener("click", generateMonthlyPdfForWhatsApp);
summaryDateEl.addEventListener("change", loadSummary);
fields.credor.addEventListener("change", syncPlantonistasRequirement);

bootstrap();

async function bootstrap() {
  const today = getTodayISO();
  fields.data.value = today;
  summaryDateEl.value = today;
  reportMonthEl.value = today.slice(0, 7);
  scriptUrlEl.value = state.config.scriptUrl;
  syncPlantonistasRequirement();
  renderSheetStatus();
  await loadMetadata();
  await loadSummary({ silent: true });
  registerServiceWorker();
}

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) || "{}");
    return { scriptUrl: saved.scriptUrl || CONFIG.defaultScriptUrl };
  } catch {
    return { scriptUrl: CONFIG.defaultScriptUrl };
  }
}

async function saveSettings() {
  state.config.scriptUrl = scriptUrlEl.value.trim();
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.config));
  renderSheetStatus();
  await loadMetadata();
  await loadSummary({ silent: true });
  setStatus("URL do Apps Script salva neste aparelho.", "success");
}

function renderSheetStatus() {
  if (state.config.scriptUrl && state.metadata?.spreadsheetName) {
    sheetStatusEl.textContent = state.metadata.spreadsheetName;
    sheetStatusEl.className = "status-pill";
    return;
  }

  if (state.config.scriptUrl) {
    sheetStatusEl.textContent = "Planilha configurada";
    sheetStatusEl.className = "status-pill";
    return;
  }

  sheetStatusEl.textContent = "Planilha nao configurada";
  sheetStatusEl.className = "status-pill neutral";
}

async function loadMetadata() {
  if (!state.config.scriptUrl) {
    state.metadata = null;
    renderSheetStatus();
    return;
  }

  try {
    const url = new URL(state.config.scriptUrl);
    url.searchParams.set("action", "metadata");
    const response = await fetch(url.toString(), { method: "GET" });
    const result = await response.json();

    if (!response.ok || result.ok !== true) {
      throw new Error(result.message || "Falha ao carregar metadados.");
    }

    state.metadata = result;
  } catch (error) {
    console.warn("Falha ao carregar metadados:", error);
    state.metadata = null;
  } finally {
    renderSheetStatus();
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.warn("Falha ao registrar service worker:", error);
  }
}

async function startCamera() {
  try {
    stopCamera();
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 2560 },
        height: { ideal: 1440 },
        focusMode: { ideal: "continuous" },
        exposureMode: { ideal: "continuous" },
      },
      audio: false,
    });

    cameraEl.srcObject = state.stream;
    await cameraEl.play();
    cameraStatusEl.textContent = "Camera ativa";
    cameraStatusEl.className = "status-pill";
    document.querySelector("#capture-image").disabled = false;
    setStatus("Camera pronta. Centralize a etiqueta e capture.", "info");
  } catch (error) {
    cameraStatusEl.textContent = "Sem acesso";
    cameraStatusEl.className = "status-pill error";
    setStatus(`Nao foi possivel abrir a camera: ${error.message}`, "error");
  }
}

function stopCamera() {
  if (!state.stream) {
    return;
  }

  state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  cameraEl.srcObject = null;
}

async function captureFromCamera() {
  if (!state.stream) {
    setStatus("Abra a camera antes de capturar.", "error");
    return;
  }

  const crop = getGuideCropRect(cameraEl.videoWidth, cameraEl.videoHeight);
  canvasEl.width = crop.width;
  canvasEl.height = crop.height;

  const context = canvasEl.getContext("2d", { willReadFrequently: true });
  context.drawImage(cameraEl, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);

  const blob = await new Promise((resolve) => canvasEl.toBlob(resolve, "image/jpeg", 0.98));
  setImageBlob(blob);
  setStatus("Etiqueta capturada. Toque em Ler etiqueta.", "success");
}

function handleFileUpload(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  setImageBlob(file);
  stopCamera();
  cameraStatusEl.textContent = "Foto enviada";
  cameraStatusEl.className = "status-pill neutral";
  setStatus("Foto carregada. Toque em Ler etiqueta.", "success");
}

function setImageBlob(blob) {
  state.imageBlob = blob;
  if (state.imageUrl) {
    URL.revokeObjectURL(state.imageUrl);
  }

  state.imageUrl = URL.createObjectURL(blob);
  previewEl.src = state.imageUrl;
  previewEl.classList.add("has-image");
  document.querySelector("#process-image").disabled = false;
}

function getGuideCropRect(sourceWidth, sourceHeight) {
  const targetWidth = Math.round(sourceWidth * CONFIG.guideWidthRatio);
  const targetHeight = Math.round(targetWidth / CONFIG.guideAspectRatio);
  const fittedHeight = Math.min(targetHeight, Math.round(sourceHeight * 0.74));
  const fittedWidth = Math.min(targetWidth, Math.round(fittedHeight * CONFIG.guideAspectRatio));

  return {
    width: fittedWidth,
    height: fittedHeight,
    x: Math.max(0, Math.round((sourceWidth - fittedWidth) / 2)),
    y: Math.max(0, Math.round((sourceHeight - fittedHeight) / 2)),
  };
}

async function processCurrentImage() {
  if (!state.imageBlob) {
    setStatus("Capture ou escolha uma imagem primeiro.", "error");
    return;
  }

  toggleBusy(true);
  setStatus("Lendo Nome do Paciente e Registro...", "info");

  try {
    const imageBitmap = await createImageBitmap(state.imageBlob);
    const variants = buildImageVariants(imageBitmap);
    const [fullOcr, zoneOcr, barcodeValues] = await Promise.all([
      extractBestText(variants.ocr),
      extractFixedZones(variants.reference, variants.nameReference),
      extractBarcodes(variants.barcode),
    ]);

    const parsed = parseLabelData(fullOcr.text, barcodeValues, zoneOcr);
    applyDataToForm(parsed);

    const missing = ["nomePaciente", "registro"].filter((key) => !parsed[key]);
    const qualityNote = fullOcr.confidence < 64 ? " Se necessario, aproxime mais a camera." : "";
    const missingNote = missing.length ? ` Confira manualmente: ${missing.join(", ")}.` : "";
    setStatus(`Leitura concluida.${missingNote}${qualityNote}`, missing.length ? "info" : "success");
  } catch (error) {
    console.error(error);
    setStatus(`Falha ao ler a etiqueta: ${error.message}`, "error");
  } finally {
    toggleBusy(false);
  }
}

function buildImageVariants(imageBitmap) {
  const baseCanvas = drawBaseCanvas(imageBitmap, 2400);
  const enhancedCanvas = cloneCanvas(baseCanvas);
  const strongCanvas = cloneCanvas(baseCanvas);
  const nameCanvas = cloneCanvas(baseCanvas);
  const barcodeCanvas = cloneCanvas(baseCanvas);

  applyGrayscaleContrast(enhancedCanvas, { contrast: 1.38, brightness: 1.05 });
  applyBinaryThreshold(strongCanvas, 158);
  applyGrayscaleContrast(nameCanvas, { contrast: 1.55, brightness: 1.08 });
  applyGrayscaleContrast(barcodeCanvas, { contrast: 1.7, brightness: 1.08 });

  return {
    ocr: [
      { name: "base", canvas: baseCanvas },
      { name: "enhanced", canvas: enhancedCanvas },
      { name: "strong", canvas: strongCanvas },
    ],
    barcode: [
      { name: "barcode", canvas: cropRelative(barcodeCanvas, ZONES.registro) },
      { name: "full", canvas: barcodeCanvas },
      { name: "base", canvas: baseCanvas },
    ],
    reference: enhancedCanvas,
    nameReference: nameCanvas,
  };
}

function drawBaseCanvas(imageBitmap, maxWidth) {
  const scale = imageBitmap.width > maxWidth ? maxWidth / imageBitmap.width : 1;
  const width = Math.round(imageBitmap.width * scale);
  const height = Math.round(imageBitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imageBitmap, 0, 0, width, height);
  return canvas;
}

function cloneCanvas(sourceCanvas) {
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(sourceCanvas, 0, 0);
  return canvas;
}

function cropRelative(sourceCanvas, { x, y, width, height }) {
  const sx = Math.round(sourceCanvas.width * x);
  const sy = Math.round(sourceCanvas.height * y);
  const sw = Math.round(sourceCanvas.width * width);
  const sh = Math.round(sourceCanvas.height * height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);
  canvas
    .getContext("2d", { willReadFrequently: true })
    .drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function applyGrayscaleContrast(canvas, { contrast, brightness }) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const avg = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    const adjusted = clamp(((avg - 128) * contrast) + (128 * brightness), 0, 255);
    pixels[i] = adjusted;
    pixels[i + 1] = adjusted;
    pixels[i + 2] = adjusted;
  }

  ctx.putImageData(imageData, 0, 0);
}

function applyBinaryThreshold(canvas, threshold) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const avg = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    const value = avg > threshold ? 255 : 0;
    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
  }

  ctx.putImageData(imageData, 0, 0);
}

async function getWorker() {
  if (!state.worker) {
    state.worker = await Tesseract.createWorker("por");
    await state.worker.setParameters({
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
    });
  }
  return state.worker;
}

async function extractText(canvas) {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  return {
    text: (data.text || "").replace(/\r/g, ""),
    confidence: Number(data.confidence || 0),
  };
}

async function extractBestText(variants) {
  let best = { text: "", confidence: 0, score: -1 };

  for (const variant of variants) {
    const result = await extractText(variant.canvas);
    const score = scoreOcrResult(result.text, result.confidence);
    if (score > best.score) {
      best = { ...result, score };
    }
  }

  return best;
}

async function extractFixedZones(sourceCanvas, nameCanvas = sourceCanvas) {
  const [nome, registro] = await Promise.all([
    extractText(cropRelative(nameCanvas, ZONES.nome)),
    extractText(cropRelative(sourceCanvas, ZONES.registro)),
  ]);

  return {
    nomePaciente: cleanNameCandidate(nome.text),
    registro: cleanRegistroCandidate(registro.text),
  };
}

function scoreOcrResult(text, confidence) {
  const normalized = normalizeText(text);
  const markers = [
    /Hospital Madre Teresa/i,
    /Data\s*Nasc/i,
    /Mae:/i,
    /Entrada:/i,
    /Setor:/i,
    /Medico:/i,
    /\d{6,}/,
  ];
  const hits = markers.filter((pattern) => pattern.test(normalized)).length;
  return confidence + (hits * 18);
}

async function extractBarcodes(variants) {
  const values = new Set();

  for (const variant of variants) {
    if ("BarcodeDetector" in window) {
      try {
        const detector = new BarcodeDetector({ formats: ["code_128", "ean_13", "ean_8", "itf", "codabar"] });
        const results = await detector.detect(variant.canvas);
        results.forEach((result) => values.add(cleanDigits(result.rawValue)));
      } catch (error) {
        console.warn(`BarcodeDetector falhou em ${variant.name}:`, error);
      }
    }

    if (window.ZXingBrowser) {
      const codeReader = new ZXingBrowser.BrowserMultiFormatReader();
      try {
        const result = await codeReader.decodeFromCanvas(variant.canvas);
        if (result?.getText) {
          values.add(cleanDigits(result.getText()));
        }
      } catch (error) {
        console.warn(`ZXing fallback falhou em ${variant.name}:`, error);
      }
    }
  }

  return Array.from(values).filter(Boolean);
}

function parseLabelData(rawText, barcodeValues, fixedZones = {}) {
  const text = normalizeText(rawText);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    nomePaciente: chooseNameCandidate(fixedZones.nomePaciente, lines),
    registro: chooseRegistroCandidate(fixedZones.registro, lines, barcodeValues),
  };
}

function normalizeText(text) {
  return String(text || "")
    .replace(/[|]/g, "I")
    .replace(/[“”"]/g, "")
    .replace(/[‘’]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[^\S\r\n]+/g, " ");
}

function chooseNameCandidate(zoneValue, lines) {
  const zone = cleanNameFromNomePront(zoneValue) || cleanNameCandidate(zoneValue);
  if (isGoodNameCandidate(zone)) {
    return zone;
  }

  const firstLine = cleanNameFromNomePront((lines || [])[0] || "");
  if (isGoodNameCandidate(firstLine)) {
    return firstLine;
  }

  return isGoodNameCandidate(zone) ? zone : "";
}

function chooseRegistroCandidate(zoneValue, lines, barcodeValues) {
  const zone = cleanRegistroCandidate(zoneValue);
  if (zone.length === 7) {
    return zone;
  }

  const lineCandidate = cleanRegistroCandidate(inferRegistroFromText(lines));
  if (lineCandidate.length === 7) {
    return lineCandidate;
  }

  const barcodeCandidate = (barcodeValues || []).find((value) => value.length === 7);
  return barcodeCandidate || "";
}

function inferRegistroFromText(lines) {
  const ignored = /Nome:|Pront|Data\s*Nasc|Entrada|Mae|Mãe|Setor|Medico|M[eé]dico|Convenio|Convênio|Filme|Procedimento|N\.?\s*Cirur/i;
  const numbers = lines
    .filter((line) => !ignored.test(line))
    .flatMap((line) => extractLongNumbers(line));
  return numbers.filter((value) => value.length === 7).at(-1) || "";
}

function cleanNameCandidate(value) {
  const firstNameLine = normalizeText(value)
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => /Nome\s*:/i.test(line) || !/Hospital|Ipmm|Data\s*Nasc|Mae:|Mãe:|Entrada:|Setor:|Medico:|M[eé]dico:|Convenio:|Convênio|Filme|Sexo:|Procedimento/i.test(line)) || "";

  return firstNameLine
    .replace(/^.*?Nome\s*:\s*/i, "")
    .replace(/\bPront\s*:.*$/i, "")
    .replace(/\bIpmm[i1]?\b.*$/i, "")
    .replace(/\b(Sexo|Data\s*Nasc|Mae|Mãe|Entrada|Setor|Medico|M[eé]dico|Convenio|Convênio|Filme|Procedimento)\b.*$/i, "")
    .replace(/[^A-Za-zÀ-ÿ\s]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .toUpperCase();
}

function cleanNameFromNomePront(value) {
  const text = normalizeText(value);
  const match = text.match(/Nome\s*:\s*([A-Za-zÀ-ÿ\s]+?)\s+Pront\s*:/i);
  return match ? cleanNameCandidate(match[1]) : "";
}

function isGoodNameCandidate(value) {
  const cleaned = cleanNameCandidate(value);
  const words = cleaned.split(/\s+/).filter(Boolean);
  const upperRatio = cleaned.length ? (cleaned.match(/[A-ZÀ-Ý]/g) || []).length / cleaned.replace(/\s/g, "").length : 0;
  return cleaned.length >= 6 && words.length >= 2 && upperRatio > 0.7;
}

function cleanRegistroCandidate(value) {
  const values = String(value || "").match(/\d{7}/g) || [];
  return values.at(-1) || "";
}

function cleanDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function extractLongNumbers(line) {
  return (String(line || "").match(/\d{6,}/g) || []).map((item) => item.trim());
}

function applyDataToForm(data) {
  if (data.nomePaciente) {
    fields.nomePaciente.value = data.nomePaciente;
  }
  if (data.registro) {
    fields.registro.value = data.registro;
  }
}

function collectFormData() {
  const isCaixaTotal = fields.credor.value.trim() === CAIXA_TOTAL;
  return {
    data: fields.data.value,
    nomePaciente: fields.nomePaciente.value.trim(),
    registro: fields.registro.value.trim(),
    tipo: fields.tipo.value.trim(),
    credor: fields.credor.value.trim(),
    plantonistas: isCaixaTotal ? "" : fields.plantonistas.value.trim(),
    observacoes: fields.observacoes.value.trim(),
    userAgent: navigator.userAgent,
  };
}

async function sendToSheet() {
  if (!state.config.scriptUrl) {
    setStatus("Salve primeiro a URL do Google Apps Script.", "error");
    return;
  }

  const payload = collectFormData();
  const requiredFields = ["data", "nomePaciente", "registro", "tipo", "credor"];
  if (payload.credor !== CAIXA_TOTAL) {
    requiredFields.push("plantonistas");
  }

  const missing = requiredFields.filter((key) => !payload[key]);
  if (missing.length) {
    setStatus("Preencha Data, Nome, Registro, Tipo, Credor e Plantonista(s) quando necessario antes de enviar.", "error");
    return;
  }

  const confirmation = [
    "Conferir dados antes do envio:",
    "",
    `Data: ${formatDate(payload.data)}`,
    `Nome: ${payload.nomePaciente}`,
    `Registro: ${payload.registro}`,
    `Tipo: ${payload.tipo}`,
    `Credor: ${payload.credor}`,
    `Plantonista(s): ${payload.plantonistas || "Nao necessario"}`,
    "",
    "Enviar agora?",
  ].join("\n");

  if (!window.confirm(confirmation)) {
    setStatus("Envio cancelado para conferencia.", "info");
    return;
  }

  toggleBusy(true);
  setStatus("Enviando para a planilha...", "info");

  try {
    const response = await fetch(state.config.scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok || result.ok !== true) {
      throw new Error(result.message || "Resposta invalida do Apps Script.");
    }

    const sentDate = payload.data;
    resetForm({ keepImage: false, keepDate: sentDate });
    summaryDateEl.value = sentDate;
    await loadSummary({ silent: true });
    setStatus("Dados enviados com sucesso para a planilha.", "success");
  } catch (error) {
    setStatus(`Falha ao enviar para a planilha: ${error.message}`, "error");
  } finally {
    toggleBusy(false);
  }
}

async function loadSummary(options = {}) {
  if (!state.config.scriptUrl) {
    state.summaryRows = [];
    renderSummary([], "Configure a URL do Apps Script para carregar o resumo.");
    return;
  }

  try {
    const url = new URL(state.config.scriptUrl);
    url.searchParams.set("action", "summary");
    url.searchParams.set("date", summaryDateEl.value || getTodayISO());
    const response = await fetch(url.toString(), { method: "GET" });
    const result = await response.json();

    if (!response.ok || result.ok !== true) {
      throw new Error(result.message || "Falha ao carregar resumo.");
    }

    state.summaryRows = result.entries || [];
    renderSummary(state.summaryRows);
    if (!options.silent) {
      setStatus("Resumo carregado.", "success");
    }
  } catch (error) {
    state.summaryRows = [];
    renderSummary([], `Nao foi possivel carregar o resumo: ${error.message}`);
    if (!options.silent) {
      setStatus(`Falha ao carregar resumo: ${error.message}`, "error");
    }
  }
}

function renderSummary(rows, emptyMessage = "Nenhum registro encontrado nesta data.") {
  const alertCount = rows.filter((row) => isAlertType(row.tipo)).length;
  summaryTotalsEl.innerHTML = `
    <span>${rows.length} entrada(s)</span>
    <span>${alertCount} alerta(s)</span>
  `;

  if (!rows.length) {
    summaryListEl.innerHTML = `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  summaryListEl.innerHTML = rows.map((row, index) => {
    const alertClass = isAlertType(row.tipo) ? " alert-row" : "";
    return `
      <article class="summary-item${alertClass}">
        <div class="summary-index">${index + 1}</div>
        <div>
          <strong>${escapeHtml(row.nomePaciente || "")}</strong>
          <span>Registro ${escapeHtml(row.registro || "")}</span>
        </div>
        <div>
          <b>${escapeHtml(row.tipo || "")}</b>
          <span>${escapeHtml(row.credor || "")}</span>
        </div>
        <div>
          <b>${escapeHtml(row.plantonistas || "")}</b>
          <span>${escapeHtml(row.observacoes || "")}</span>
        </div>
      </article>
    `;
  }).join("");
}

async function loadMonthlyEntries(month) {
  if (!state.config.scriptUrl) {
    throw new Error("Configure a URL do Apps Script antes de gerar o relatorio mensal.");
  }

  const url = new URL(state.config.scriptUrl);
  url.searchParams.set("action", "summaryMonth");
  url.searchParams.set("month", month);
  const response = await fetch(url.toString(), { method: "GET" });
  const result = await response.json();

  if (!response.ok || result.ok !== true) {
    throw new Error(result.message || "Falha ao carregar registros do mes.");
  }

  return result.entries || [];
}

function generatePdfReport() {
  if (!state.summaryRows.length) {
    setStatus("Carregue um resumo com entradas antes de gerar o PDF.", "error");
    return;
  }

  const jsPdf = window.jspdf?.jsPDF;
  if (!jsPdf) {
    window.print();
    return;
  }

  const date = summaryDateEl.value || getTodayISO();
  const doc = new jsPdf({ orientation: "landscape", unit: "mm", format: "a4" });
  const title = `ETIQUETAS HMT - ${formatDate(date)}`;
  const rows = state.summaryRows.map((row, index) => [
    String(index + 1),
    row.nomePaciente || "",
    row.registro || "",
    row.tipo || "",
    row.credor || "",
    row.plantonistas || "",
    row.observacoes || "",
  ]);

  doc.setFillColor(11, 63, 58);
  doc.rect(0, 0, 297, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.text(`${state.summaryRows.length} entrada(s)`, 260, 15, { align: "right" });

  doc.autoTable({
    startY: 32,
    head: [["#", "Nome do Paciente", "Registro", "Tipo", "Credor", "Plantonista(s)", "Observacoes"]],
    body: rows,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2.2, overflow: "linebreak" },
    headStyles: { fillColor: [11, 63, 58], textColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 68 },
      2: { cellWidth: 24 },
      3: { cellWidth: 32 },
      4: { cellWidth: 44 },
      5: { cellWidth: 34 },
      6: { cellWidth: 62 },
    },
    didParseCell(data) {
      if (data.section === "body") {
        const row = state.summaryRows[data.row.index];
        if (isAlertType(row?.tipo)) {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [255, 241, 242];
        }
      }
    },
  });

  doc.save(`etiquetas-hmt-${date}.pdf`);
}

async function generateMonthlyPdfForWhatsApp() {
  const month = reportMonthEl.value || getTodayISO().slice(0, 7);
  toggleBusy(true);
  setStatus("Gerando relatorio mensal em PDF...", "info");

  try {
    const rows = await loadMonthlyEntries(month);
    if (!rows.length) {
      setStatus("Nenhum registro encontrado para o mes selecionado.", "error");
      return;
    }

    const { blob, fileName, summaryText } = buildMonthlyPdf(rows, month);
    const file = new File([blob], fileName, { type: "application/pdf" });

    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({
        files: [file],
        title: `ETIQUETAS HMT - ${formatMonth(month)}`,
        text: summaryText,
      });
      setStatus("Relatorio mensal pronto para envio pelo WhatsApp.", "success");
      return;
    }

    downloadBlob(blob, fileName);
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(summaryText + "\n\nPDF gerado e baixado no aparelho. Anexe o arquivo baixado nesta conversa.")}`;
    window.open(whatsappUrl, "_blank", "noopener");
    setStatus("PDF baixado. O WhatsApp foi aberto com a mensagem do relatorio.", "success");
  } catch (error) {
    setStatus(`Falha ao gerar relatorio mensal: ${error.message}`, "error");
  } finally {
    toggleBusy(false);
  }
}

function buildMonthlyPdf(rows, month) {
  const jsPdf = window.jspdf?.jsPDF;
  if (!jsPdf) {
    throw new Error("Biblioteca de PDF nao carregada.");
  }

  const doc = new jsPdf({ orientation: "landscape", unit: "mm", format: "a4" });
  const title = `ETIQUETAS HMT - RELATORIO MENSAL - ${formatMonth(month)}`;
  const alertCount = rows.filter((row) => isAlertType(row.tipo)).length;
  const tableRows = rows.map((row, index) => [
    String(index + 1),
    formatDate(row.data || ""),
    row.nomePaciente || "",
    row.registro || "",
    row.tipo || "",
    row.credor || "",
    row.plantonistas || "-",
    row.observacoes || "",
  ]);

  doc.setFillColor(11, 63, 58);
  doc.rect(0, 0, 297, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.text(`${rows.length} entrada(s) | ${alertCount} alerta(s)`, 280, 15, { align: "right" });

  doc.autoTable({
    startY: 34,
    head: [["#", "Data", "Nome do Paciente", "Registro", "Tipo", "Credor", "Plantonista(s)", "Observacoes"]],
    body: tableRows,
    theme: "grid",
    styles: { fontSize: 7.6, cellPadding: 2, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [11, 63, 58], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 9 },
      1: { cellWidth: 20 },
      2: { cellWidth: 58 },
      3: { cellWidth: 22 },
      4: { cellWidth: 28 },
      5: { cellWidth: 40 },
      6: { cellWidth: 31 },
      7: { cellWidth: 66 },
    },
    didParseCell(data) {
      if (data.section === "body") {
        const row = rows[data.row.index];
        if (isAlertType(row?.tipo)) {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [255, 241, 242];
        }
      }
    },
  });

  const fileName = `etiquetas-hmt-${month}.pdf`;
  return {
    blob: doc.output("blob"),
    fileName,
    summaryText: `ETIQUETAS HMT - ${formatMonth(month)}\n${rows.length} entrada(s)\n${alertCount} alerta(s): Particular/Complementacao`,
  };
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function resetForm(options = {}) {
  const selectedDate = options.keepDate || fields.data.value || getTodayISO();
  formEl.reset();
  fields.data.value = options.keepDate ? selectedDate : getTodayISO();
  syncPlantonistasRequirement();

  if (!options.keepImage) {
    clearImage();
  }
}

function clearImage() {
  if (state.imageUrl) {
    URL.revokeObjectURL(state.imageUrl);
    state.imageUrl = "";
  }

  previewEl.removeAttribute("src");
  previewEl.classList.remove("has-image");
  state.imageBlob = null;
  document.querySelector("#process-image").disabled = true;
}

function setStatus(message, tone) {
  processingStatusEl.textContent = message;
  processingStatusEl.dataset.tone = tone;
}

function toggleBusy(isBusy) {
  document.querySelectorAll("button, input[type='file'], select, input, textarea").forEach((element) => {
    if (element.id === "clear-form" || element.id === "save-settings" || element.id === "script-url") {
      return;
    }
    element.disabled = isBusy;
  });

  if (!isBusy) {
    document.querySelector("#capture-image").disabled = !state.stream;
    document.querySelector("#process-image").disabled = !state.imageBlob;
    syncPlantonistasRequirement();
  }
}

function isAlertType(value) {
  return ALERT_TYPES.has(String(value || "").trim().toLowerCase());
}

function syncPlantonistasRequirement() {
  const isCaixaTotal = fields.credor.value.trim() === CAIXA_TOTAL;
  fields.plantonistas.disabled = isCaixaTotal;
  fields.plantonistas.required = !isCaixaTotal;

  if (isCaixaTotal) {
    fields.plantonistas.value = "";
  }
}

function getTodayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) {
    return "";
  }
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatMonth(value) {
  if (!value) {
    return "";
  }
  const [year, month] = value.split("-");
  return `${month}/${year}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

window.addEventListener("beforeunload", () => {
  stopCamera();
  if (state.worker) {
    state.worker.terminate();
  }
});
