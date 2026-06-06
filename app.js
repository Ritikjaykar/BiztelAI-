const STORAGE_KEY = "biztelai-opsflow-v1";

// schema
const schema = [
  { key: "date",             label: "Date",               type: "date",   required: true  },
  { key: "shift",            label: "Shift",              type: "text",   required: true  },
  { key: "employeeNumber",   label: "Employee No",        type: "text",   required: true  },
  { key: "operationCode",    label: "Operation Code",     type: "text",   required: true  },
  { key: "machineNumber",    label: "Machine No",         type: "text",   required: true  },
  { key: "workOrderNumber",  label: "Work Order No",      type: "text",   required: true  },
  { key: "quantityProduced", label: "Qty Produced",       type: "number", required: true  },
  { key: "timeHours",        label: "Time Taken (hrs)",   type: "number", required: true  },
  { key: "remarks",          label: "Remarks",            type: "text",   required: false },
];

// helpers 
function makeConfidence(value) {
  return Object.fromEntries(schema.map((f) => [f.key, value]));
}

function emptyFields() {
  return Object.fromEntries(schema.map((f) => [f.key, ""]));
}

function id() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function escapeHtml(v) {
  return String(v)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function labelFor(key) {
  return schema.find((f) => f.key === key)?.label || key;
}

// demo records aligned with real dataset formats
const demoRecords = [
  {
    fileName: "machine_shop_demo_valid.jpg",
    fileType: "image/jpeg",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    reviewedAt: new Date(Date.now() - 82000000).toISOString(),
    rowIndex: 1,
    sourceText: "Date 20/4/26 Shift I Emp BT4710 Op 856430 Machine MC-730 WO 165460 Qty 25 Time 4.0 hrs",
    fields: {
      date: "2026-04-20", shift: "I", employeeNumber: "BT4710",
      operationCode: "856430", machineNumber: "MC-730",
      workOrderNumber: "165460", quantityProduced: "25",
      timeHours: "4.0", remarks: "",
    },
    confidence: makeConfidence(0.88),
  },
  {
    fileName: "machine_shop_demo_exception.jpg",
    fileType: "image/jpeg",
    createdAt: new Date(Date.now() - 43200000).toISOString(),
    reviewedAt: null,
    rowIndex: 1,
    sourceText: "Date 18/4/26 Shift I Emp BT1234 Op 54321 Machine ABC-730 WO 165455 Qty - Time 2.0 hrs",
    fields: {
      date: "2026-04-18", shift: "I", employeeNumber: "BT1234",
      operationCode: "54321", machineNumber: "ABC-730",
      workOrderNumber: "165455", quantityProduced: "",
      timeHours: "2.0", remarks: "Qty missing — dash in original",
    },
    confidence: { ...makeConfidence(0.82), quantityProduced: 0.45 },
  },
];

// state
let state = loadState();
let activeId = state.activeId || null;

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { documents: [] }; }
  catch { return { documents: [] }; }
}

function persist(shouldRender = true) {
  state.activeId = activeId;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (shouldRender) render();
}

// DOM handles
const els = {
  fileInput:         document.querySelector("#file-input"),
  dropzone:          document.querySelector("#dropzone"),
  uploadList:        document.querySelector("#upload-list"),
  previewFrame:      document.querySelector("#preview-frame"),
  previewCaption:    document.querySelector("#preview-caption"),
  ocrState:          document.querySelector("#ocr-state"),
  reviewForm:        document.querySelector("#review-form"),
  validationSummary: document.querySelector("#validation-summary"),
  saveRecord:        document.querySelector("#save-record"),
  rerunExtraction:   document.querySelector("#rerun-extraction"),
  historyTable:      document.querySelector("#history-table"),
  searchInput:       document.querySelector("#search-input"),
  statusFilter:      document.querySelector("#status-filter"),
};

function setOcrState(label, tone = "muted") {
  els.ocrState.textContent = label;
  els.ocrState.className = `pill ${tone}`;
}

// file handling 
async function handleFiles(files) {
  for (const file of files) {
    const previewDataUrl = await fileToDataUrl(file);
    const baseDoc = {
      id: id(), fileName: file.name,
      fileType: file.type || "application/octet-stream",
      createdAt: new Date().toISOString(),
      reviewedAt: null, sourceText: "",
      fields: emptyFields(), confidence: makeConfidence(0.3),
      previewDataUrl, rowIndex: 1, totalRows: 1,
    };
    state.documents.unshift(baseDoc);
    activeId = baseDoc.id;
    persist();
    await extractForDocument(baseDoc.id);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}

// OCR and Extraction 
async function extractForDocument(documentId) {
  const doc = state.documents.find((d) => d.id === documentId);
  if (!doc) return;

  setOcrState("Extracting…", "warn");
  let rawText = extractTextFromSvgDataUrl(doc);

  // Try Tesseract for real images
  if (!rawText.trim() && !isSvgDocument(doc) && window.Tesseract && doc.fileType.startsWith("image/")) {
    try {
      const result = await Tesseract.recognize(doc.previewDataUrl, "eng", {
        logger: (e) => {
          if (e.status === "recognizing text")
            setOcrState(`OCR ${Math.round(e.progress * 100)}%`, "warn");
        },
      });
      rawText = result.data.text || "";
    } catch { rawText = ""; }
  }

  // Fallback for demo/non-image
  if (!rawText.trim()) rawText = simulatedExtractionText(doc.fileName);

  doc.sourceText = rawText;

  // Parse all rows from the table text
  const allRows = parseAllRows(rawText, doc.fileName);
  doc.totalRows = allRows.length || 1;

  if (allRows.length > 0) {
    // Apply first row to this document
    doc.fields = allRows[0].fields;
    doc.confidence = allRows[0].confidence;
    doc.rowIndex = 1;

    // Create sibling documents for rows 2+
    // Remove any previously generated siblings for this file first
    state.documents = state.documents.filter(
      (d) => d.id === doc.id || d.parentId !== doc.id
    );
    for (let i = 1; i < allRows.length; i++) {
      const sibling = {
        id: id(),
        parentId: doc.id,
        fileName: doc.fileName,
        fileType: doc.fileType,
        createdAt: doc.createdAt,
        reviewedAt: null,
        sourceText: rawText,
        fields: allRows[i].fields,
        confidence: allRows[i].confidence,
        previewDataUrl: doc.previewDataUrl,
        rowIndex: i + 1,
        totalRows: allRows.length,
      };
      // Insert after parent
      const parentIdx = state.documents.findIndex((d) => d.id === doc.id);
      state.documents.splice(parentIdx + i, 0, sibling);
    }
  }

  setOcrState(`${doc.totalRows} row${doc.totalRows > 1 ? "s" : ""} extracted`, "ok");
  persist();
}

function extractTextFromSvgDataUrl(doc) {
  if (!isSvgDocument(doc) || !doc.previewDataUrl) return "";
  const [meta = "", payload = ""] = doc.previewDataUrl.split(",");
  const svg = meta.includes(";base64")
    ? decodeURIComponent(escape(atob(payload)))
    : decodeURIComponent(payload);
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  return [...parsed.querySelectorAll("text")]
    .map((n) => n.textContent.trim()).filter(Boolean).join("\n");
}

function isSvgDocument(doc) {
  return doc.fileType.includes("svg") || doc.previewDataUrl?.startsWith("data:image/svg+xml");
}

//  Simulated extraction (demo fallback) 
function simulatedExtractionText(fileName) {
  const seed = [...fileName].reduce((s, c) => s + c.charCodeAt(0), 0);
  const shifts   = ["I", "II", "III"];
  const machines = ["MC-730", "MC-780", "MC-810", "MC-840", "MC-850", "MC-720", "MC-760", "MC-800"];
  const shift    = shifts[seed % 3];
  const machine  = machines[seed % machines.length];
  const emp      = `BT${4600 + (seed % 400)}`;
  const opn      = String(856400 + (seed % 100));
  const wo       = String(165400 + (seed % 60));
  const qty      = seed % 7 === 0 ? "-" : String(5 + (seed % 50));
  const hrs      = (2 + (seed % 7) * 0.5).toFixed(1);
  const day      = String((seed % 5) + 18).padStart(2, "0");
  return [
    `Machine shop data`,
    `S.No  Date      Shift  Emp.No    Opn Code  Machine No  Work Order No  Qty.Prod.  Time taken (in hrs)`,
    `1     ${day}/4/26  ${shift}      ${emp}   ${opn}   ${machine}   ${wo}         ${qty}          ${hrs}`,
  ].join("\n");
}

//  multirow table parser 
// handles tesseract output from a tabular handwritten document.
// extract table rows
function parseAllRows(text, fileName) {
  if (!text.trim()) return [];

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Detect lines that are likely data rows (contain a date pattern OR start with a digit row index)
  const dataLines = lines.filter((line) => isDataLine(line));

  if (dataLines.length === 0) {
    // Fallback: parse as single key-value record
    const single = parseSingleRecord(text, fileName);
    return single ? [single] : [];
  }

  return dataLines.map((line) => parseTableRow(line, fileName));
}

// Heuristic: a data row is a TABLE row — has a DD/MM date (not ISO YYYY-MM-DD),
// and is NOT a key:value line (key:value lines have a colon near the start)
function isDataLine(line) {
  // Skip key:value lines like "Date: 2026-06-05" or "Shift: A"
  if (/^[A-Za-z ]+:\s+\S/.test(line)) return false;
  // Must have a DD/MM date pattern (not ISO) — e.g. 20/4/26, 18/4/26
  if (/\b\d{1,2}[\/]\d{1,2}(?:[\/]\d{2,4})?/.test(line)) return true;
  // Or: starts with a row number + has many tokens (pure positional row)
  if (/^\d{1,2}\s+/.test(line) && line.split(/\s+/).length >= 6) return true;
  return false;
}

// Parse a single table row line by positional token analysis
function parseTableRow(line, fileName) {
  const fields = emptyFields();
  const confidence = makeConfidence(0.62);

  // Tokenise — collapse multiple spaces
  const tokens = line.replace(/\s{2,}/g, " ").trim().split(" ");

  // Strip leading row number (1, 2, 3…)
  let idx = 0;
  if (/^\d{1,2}$/.test(tokens[0])) idx = 1;

  // Date: DD/MM/YY or DD/MM/YYYY pattern
  const dateTok = tokens.slice(idx).find((t) => /\d{1,2}[\/\-]\d{1,2}/.test(t));
  if (dateTok) {
    fields.date = normalizeDate(dateTok);
    confidence.date = 0.82;
    idx = Math.max(idx, tokens.indexOf(dateTok) + 1);
  }

  // Shift: Roman (I, II, III, IV) or Arabic (1, 2, 3)
  const shiftTok = tokens.slice(idx).find((t) => /^(I{1,3}V?|IV|VI{0,3}|[123])$/i.test(t));
  if (shiftTok) {
    fields.shift = normalizeShift(shiftTok);
    confidence.shift = 0.78;
    idx = Math.max(idx, tokens.indexOf(shiftTok) + 1);
  }

  // Employee No: BT followed by digits
  const empTok = tokens.slice(idx).find((t) => /^BT\d{3,6}$/i.test(t));
  if (empTok) {
    fields.employeeNumber = empTok.toUpperCase();
    confidence.employeeNumber = 0.84;
    idx = Math.max(idx, tokens.indexOf(empTok) + 1);
  }

  // Operation Code: 5-6 digit number
  const opnTok = tokens.slice(idx).find((t) => /^\d{5,6}$/.test(t));
  if (opnTok) {
    fields.operationCode = opnTok;
    confidence.operationCode = 0.80;
    idx = Math.max(idx, tokens.indexOf(opnTok) + 1);
  }

  // Machine No: MC-XXX, ABC-XXX, or MC XXX
  const mcIdx = tokens.slice(idx).findIndex((t) =>
    /^(MC|ABC|M)[-]?\d{3,4}$/.test(t.replace(/\s/g, "")) ||
    /^(MC|ABC)$/i.test(t)
  );
  if (mcIdx !== -1) {
    let mcTok = tokens[idx + mcIdx];
    // Handle split "MC -730" or "MC- 730"
    if (/^(MC|ABC)$/i.test(mcTok) && tokens[idx + mcIdx + 1]) {
      mcTok = mcTok + tokens[idx + mcIdx + 1].replace(/^[-\s]+/, "-");
      idx = Math.max(idx, idx + mcIdx + 2);
    } else {
      idx = Math.max(idx, idx + mcIdx + 1);
    }
    fields.machineNumber = normalizeMachine(mcTok);
    confidence.machineNumber = 0.80;
  }

  // Work Order No: 6-digit number (after machine)
  const woTok = tokens.slice(idx).find((t) => /^\d{6,8}$/.test(t));
  if (woTok) {
    fields.workOrderNumber = woTok;
    confidence.workOrderNumber = 0.82;
    idx = Math.max(idx, tokens.indexOf(woTok) + 1);
  }

  // Qty: integer or dash (dash = missing)
  const qtyTok = tokens.slice(idx).find((t) => /^\d{1,4}$/.test(t) || /^[-—–]$/.test(t));
  if (qtyTok) {
    if (/^[-—–]$/.test(qtyTok)) {
      fields.quantityProduced = ""; // Missing — will flag mandatory error
      confidence.quantityProduced = 0.45;
    } else {
      fields.quantityProduced = qtyTok;
      confidence.quantityProduced = 0.80;
    }
    idx = Math.max(idx, tokens.indexOf(qtyTok) + 1);
  }

  // Time: decimal hours like 4.0, 7.5, 6, 3.5
  const timeTok = tokens.slice(idx).find((t) => /^\d{1,2}(\.\d)?$/.test(t));
  if (timeTok) {
    fields.timeHours = timeTok;
    confidence.timeHours = 0.82;
  }

  return { fields, confidence };
}

// Parse card style documents
function parseSingleRecord(text, fileName) {
  const fields = emptyFields();
  const confidence = makeConfidence(0.62);

  // Run each line through individually to avoid cross-line contamination
  const lineMap = {};
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    const kv = l.match(/^([^:]+):\s*(.+)$/);
    if (kv) lineMap[kv[1].toLowerCase().trim()] = kv[2].trim();
  }

  // Helper: find value by key aliases
  const get = (...aliases) => {
    for (const a of aliases) {
      for (const [k, v] of Object.entries(lineMap)) {
        if (k.includes(a.toLowerCase())) return v;
      }
    }
    return null;
  };

  // Date — ISO or DD/MM/YY
  const dateRaw = get('date', 'dt');
  if (dateRaw) {
    fields.date = normalizeDateFlex(dateRaw);
    confidence.date = 0.88;
  }

  // Shift — letter A-D or Roman I/II/III or digit
  const shiftRaw = get('shift');
  if (shiftRaw) {
    const sm = shiftRaw.match(/^([A-D]|I{1,3}V?|IV|VI{0,3}|[1-4])$/i);
    fields.shift = sm ? normalizeShift(sm[1]) : shiftRaw.toUpperCase();
    confidence.shift = sm ? 0.88 : 0.55;
  }

  // Employee No — BT#### or E####
  const empRaw = get('employee no', 'employee number', 'emp no', 'emp.');
  if (empRaw) {
    const em = empRaw.match(/((BT|E)\d{2,6}|\d{2,6})/i);
    if (em) {
      fields.employeeNumber = em[1].toUpperCase();
      confidence.employeeNumber = 0.84;
    }
  }

  // Operation Code — OP-### or raw 3-6 digits
  const opRaw = get('operation code', 'opn code', 'op code', 'operation');
  if (opRaw) {
    const om = opRaw.match(/(OP[-\s]?\d{2,5}|\d{3,6})/i);
    if (om) {
      fields.operationCode = om[1].replace(/\s/g, '').toUpperCase();
      confidence.operationCode = 0.84;
    }
  }

  // Machine No — M-07, MC-730, ABC-730
  const mcRaw = get('machine no', 'machine number', 'machine');
  if (mcRaw) {
    const mm = mcRaw.match(/([A-Z]{1,3}[-\s]?\d{2,4})/i);
    if (mm) {
      fields.machineNumber = normalizeMachine(mm[1]);
      confidence.machineNumber = 0.84;
    }
  }

  // Work Order No — WO-##### or raw 5-8 digits
  const woRaw = get('work order', 'work order no', 'w.o', 'wo');
  if (woRaw) {
    const wm = woRaw.match(/(WO[-\s]?\d{3,8}|\d{5,8})/i);
    if (wm) {
      fields.workOrderNumber = wm[1].replace(/\s/g, '').toUpperCase();
      confidence.workOrderNumber = 0.84;
    }
  }

  // Quantity — integer or dash means missing
  const qtyRaw = get('quantity produced', 'qty. prod', 'qty prod', 'quantity', 'qty');
  if (qtyRaw) {
    if (/^[-—–]$/.test(qtyRaw.trim())) {
      fields.quantityProduced = '';
      confidence.quantityProduced = 0.45;
    } else {
      const qm = qtyRaw.match(/\d+/);
      if (qm) {
        fields.quantityProduced = qm[0];
        confidence.quantityProduced = 0.84;
      }
    }
  }

  // Time — may be '420 minutes', '7.5', '7.5 hrs'
  const timeRaw = get('time taken', 'time');
  if (timeRaw) {
    const tm = timeRaw.match(/(\d{1,4}(?:\.\d{1,2})?)\s*(minutes?|mins?|hrs?|hours?)?/i);
    if (tm) {
      let val = parseFloat(tm[1]);
      const unit = (tm[2] || '').toLowerCase();
      if (unit.startsWith('min') && val > 12) val = +(val / 60).toFixed(2);
      fields.timeHours = String(val);
      confidence.timeHours = 0.84;
    }
  }

  // Remarks
  const remRaw = get('remarks', 'remark');
  if (remRaw) {
    fields.remarks = remRaw;
    confidence.remarks = 0.88;
  }

  return { fields, confidence };
}

//  Normalisation helpers 

// normalizeDateFlex: handles ISO YYYY-MM-DD passthrough AND DD/MM/YY conversion
function normalizeDateFlex(raw) {
  raw = String(raw).trim();
  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return normalizeDate(raw);
}

function normalizeDate(raw) {
  // Input: DD/MM/YY, DD/MM/YYYY, DD/MM (partial), DD-MM-YY
  const s = String(raw).replace(/-/g, "/");
  const parts = s.split("/");
  if (parts.length === 2) {
    return `2026-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  if (parts.length === 3) {
    const [d, m, y] = parts;
    // If first part looks like year (4 digits), already in YYYY/MM/DD
    if (d.length === 4) return `${d}-${m.padStart(2, "0")}-${y.padStart(2, "0")}`;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return raw;
}

function normalizeShift(raw) {
  const s = raw.trim().toUpperCase();
  if (s === "1") return "I";
  if (s === "2") return "II";
  if (s === "3") return "III";
  // Keep A/B/C as-is for old-format sample docs
  return s;
}

function normalizeMachine(raw) {
  const v = raw.toUpperCase().replace(/\s+/g, "");
  // If already has a dash (MC-730, M-07, ABC-730), return as-is
  if (/-/.test(v)) return v;
  // Otherwise insert dash between letters and digits
  return v.replace(/^([A-Z]+)(\d)/, "$1-$2");
}

function normalizeFieldValue(key, value) {
  const v = String(value || "").trim();
  if (key === "date") return normalizeDate(v);
  if (key === "shift") return normalizeShift(v);
  if (key === "machineNumber") return normalizeMachine(v);
  if (key === "employeeNumber") return v.toUpperCase();
  return v;
}

//validation
function validateRecord(doc) {
  const errors = [];
  const f = doc.fields;

  // Mandatory fields
  for (const field of schema.filter((s) => s.required)) {
    if (!f[field.key] && f[field.key] !== 0)
      errors.push({ field: field.key, message: `${field.label} is mandatory.` });
  }

  // Shift: Roman I/II/III, Arabic 1/2/3, or letter A/B/C/D (old sample format)
  if (f.shift && !/^(I|II|III|1|2|3|A|B|C|D)$/i.test(f.shift)) {
    errors.push({
      field:"shift",
      message:"Shift must be I, II, III, 1, 2 or 3."
     });
  }

  // Employee: BT####  (real docs) OR E#### (old sample format) OR raw digits
  if (f.employeeNumber && !/^(BT\d{2,6}|E\d{2,6}|\d{2,6})$/i.test(f.employeeNumber)) {
    errors.push({ field: "employeeNumber", message: "Employee No should be BT/E followed by digits (e.g. BT4710 or E1042)." });
  }

  // Operation Code: 5-6 raw digits (real docs) OR OP-### (old sample format) OR 3-6 digits
  if (f.operationCode && !/^(OP-?\d{2,5}|\d{3,6})$/i.test(f.operationCode)) {
    errors.push({ field: "operationCode", message: "Operation Code should be digits or OP-### format (e.g. 856430 or OP-210)." });
  }

  // Machine: 1-3 letters + dash + 2-4 digits: MC-730, M-07, ABC-730
  if (f.machineNumber && !/^[A-Z]{1,3}-\d{2,4}$/.test(f.machineNumber)) {
    errors.push({ field: "machineNumber", message: "Machine No should be like MC-730, M-07, or ABC-730." });
  }

  // Work Order: WO-##### (old format) OR 5-8 raw digits (real docs)
  if (f.workOrderNumber && !/^(WO-?\d{3,8}|\d{5,8})$/i.test(f.workOrderNumber)) {
    errors.push({ field: "workOrderNumber", message: "Work Order should be digits or WO-##### format (e.g. 165460 or WO-24091)." });
  }

  // Quantity — old sample doc has 480 which is fine; raise threshold
  const qty = Number(f.quantityProduced);
  if (f.quantityProduced && (!Number.isFinite(qty) || qty <= 0)) {
    errors.push({ field: "quantityProduced", message: "Quantity must be greater than zero." });
  }
  if (qty > 1000) {
    errors.push({ field: "quantityProduced", message: "Quantity looks unusually high for one shift (>1000)." });
  }

  // Time: stored as hours. Real docs: 3.5–8.0 hrs. Old sample: 420 min → 7 hrs after conversion.
  // Accept 0.25–24 to cover edge cases.
  const hrs = Number(f.timeHours);
  if (f.timeHours && (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24)) {
    errors.push({ field: "timeHours", message: "Time should be between 0.25 and 24 hours." });
  }

  // Duplicate work order (among reviewed records)
    const dup = state.documents.find(
      (d) =>
        d.id !== doc.id &&
        d.reviewedAt &&
        d.fields.workOrderNumber === f.workOrderNumber &&
        d.fields.machineNumber === f.machineNumber &&
        d.fields.date === f.date &&
        f.workOrderNumber
    );
  if (dup) {
    errors.push({ field: "workOrderNumber", message: "Duplicate Work Order No already exists in reviewed records." });
  }

  // Low confidence flags
  for (const [field, score] of Object.entries(doc.confidence || {})) {
    if (score < 0.55) errors.push({ field, message: `${labelFor(field)} has low extraction confidence.` });
  }

  return errors;
}

// ─── Active document helpers ──────────────────────────────────────────────────
function activeDocument() {
  return state.documents.find((d) => d.id === activeId);
}

//  Render 
function render() {
  renderUploads();
  renderPreview();
  renderReviewForm();
  renderHistory();
  renderAnalytics();
}

function renderUploads() {
  // Group siblings under their parent visually
  els.uploadList.innerHTML = state.documents.map((doc) => {
    const isChild = !!doc.parentId;
    const label = doc.totalRows > 1
      ? `Row ${doc.rowIndex}/${doc.totalRows} — ${escapeHtml(doc.fileName)}`
      : escapeHtml(doc.fileName);
    return `<button class="upload-item ${isChild ? "child-row" : ""} ${doc.id === activeId ? "active" : ""}" data-open="${doc.id}">
      <span><strong>${label}</strong><br><small>${new Date(doc.createdAt).toLocaleString()}</small></span>
      ${statusPill(doc)}
    </button>`;
  }).join("");
}

function renderPreview() {
  const doc = activeDocument();
  els.rerunExtraction.disabled = !doc || !!doc.parentId; // only re-run on parent
  els.saveRecord.disabled = !doc;

  if (!doc) {
    els.previewCaption.textContent = "Select or upload a document to begin.";
    els.previewFrame.innerHTML = `<div class="empty-state">No document selected</div>`;
    return;
  }

  const rowLabel = doc.totalRows > 1 ? ` — Row ${doc.rowIndex} of ${doc.totalRows}` : "";
  els.previewCaption.textContent = `${escapeHtml(doc.fileName)}${rowLabel} · ${new Date(doc.createdAt).toLocaleString()}`;

  if (!doc.previewDataUrl) {
    els.previewFrame.innerHTML = `<pre class="source-text">${escapeHtml(doc.sourceText || "Demo record — no image available.")}</pre>`;
  } else if (doc.fileType === "application/pdf") {
    els.previewFrame.innerHTML = `<iframe title="PDF preview" src="${doc.previewDataUrl}"></iframe>`;
  } else if (doc.fileType.startsWith("image/")) {
    els.previewFrame.innerHTML = `<img alt="Uploaded document preview" src="${doc.previewDataUrl}" />`;
  } else {
    els.previewFrame.innerHTML = `<div class="empty-state">Preview unavailable for this file type</div>`;
  }
}

function renderReviewForm() {
  const doc = activeDocument();
  if (!doc) {
    els.reviewForm.innerHTML = `<div class="empty-state">Upload or select a document to review extracted fields.</div>`;
    els.validationSummary.innerHTML = "";
    return;
  }

  const validation = validateRecord(doc);
  const invalidFields = new Set(validation.map((e) => e.field));

  els.reviewForm.innerHTML = schema.map((field) => {
    const value = doc.fields[field.key] ?? "";
    const conf  = Math.round((doc.confidence[field.key] || 0) * 100);
    const confClass = conf < 60 ? "confidence low" : "confidence";
    const input = `<input data-field="${field.key}" type="${field.type}" value="${escapeHtml(value)}" />`;
    return `<div class="field ${invalidFields.has(field.key) ? "invalid" : ""}">
      <label>${field.label}<span class="${confClass}">${conf}%</span></label>
      ${input}
    </div>`;
  }).join("");

  els.validationSummary.innerHTML = validation.length
    ? validation.map((e) => `<div class="validation-item">${escapeHtml(e.message)}</div>`).join("")
    : `<div class="validation-item ok">All checks passed. Record is ready to save.</div>`;
}

function renderHistory() {
  const query  = (els.searchInput.value || "").toLowerCase();
  const filter = els.statusFilter.value;
  const rows   = state.documents.filter((doc) => {
    const blob  = `${doc.fileName} ${Object.values(doc.fields).join(" ")}`.toLowerCase();
    const valid = validateRecord(doc).length === 0;
    return blob.includes(query) && (filter === "all" || (filter === "valid" ? valid : !valid));
  });

  els.historyTable.innerHTML = rows.length
    ? rows.map((doc) => {
        const rowLabel = doc.totalRows > 1 ? ` <span class="row-badge">row ${doc.rowIndex}</span>` : "";
        return `<tr>
          <td>${escapeHtml(doc.fileName)}${rowLabel}</td>
          <td>${doc.fields.date || "-"}</td>
          <td>${doc.fields.shift || "-"}</td>
          <td>${doc.fields.machineNumber || "-"}</td>
          <td>${doc.fields.workOrderNumber || "-"}</td>
          <td>${doc.fields.quantityProduced || "-"}</td>
          <td>${statusPill(doc)}</td>
          <td><button class="link-button" data-open="${doc.id}" data-view-target="workspace">Open</button></td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="8">No records match the current filters.</td></tr>`;
}

function renderAnalytics() {
  const reviewed  = state.documents.filter((d) => d.reviewedAt);
  const failures  = state.documents.reduce((s, d) => s + validateRecord(d).length, 0);
  const totalQty  = reviewed.reduce((s, d) => s + (Number(d.fields.quantityProduced) || 0), 0);
  const totalHrs  = reviewed.reduce((s, d) => s + (Number(d.fields.timeHours) || 0), 0);

  document.querySelector("#metric-uploads").textContent  = state.documents.length;
  document.querySelector("#metric-reviewed").textContent = reviewed.length;
  document.querySelector("#metric-failures").textContent = failures;
  document.querySelector("#metric-quantity").textContent = totalQty.toLocaleString();

  // Extra metric: total hours (update label too)
  const hoursEl = document.querySelector("#metric-hours");
  if (hoursEl) hoursEl.textContent = totalHrs.toFixed(1);

  renderChart("#shift-chart",   groupSum(reviewed, "shift"));
  renderChart("#machine-chart", groupSum(reviewed, "machineNumber"));
  renderChart("#emp-chart",     groupSum(reviewed, "employeeNumber"));

  const exceptions = state.documents
    .map((doc) => ({ doc, errors: validateRecord(doc) }))
    .filter((x) => x.errors.length)
    .slice(0, 10);

  document.querySelector("#exception-list").innerHTML = exceptions.length
    ? exceptions.map(({ doc, errors }) => `<div class="exception-card">
        <strong>${escapeHtml(doc.fileName)}${doc.totalRows > 1 ? ` — row ${doc.rowIndex}` : ""}</strong>
        <span>${errors.map((e) => escapeHtml(e.message)).join(" · ")}</span>
      </div>`).join("")
    : `<div class="empty-state">No exceptions currently queued.</div>`;
}

function groupSum(records, key) {
  return records.reduce((acc, doc) => {
    const label = doc.fields[key] || "Unknown";
    acc[label] = (acc[label] || 0) + (Number(doc.fields.quantityProduced) || 0);
    return acc;
  }, {});
}

function renderChart(selector, values) {
  const container = document.querySelector(selector);
  if (!container) return;
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  container.innerHTML = entries.length
    ? entries.map(([label, value]) => `<div class="bar-row">
        <strong>${escapeHtml(label)}</strong>
        <div class="bar-track"><div class="bar-fill" style="--value: ${(value / max) * 100}%"></div></div>
        <span>${value}</span>
      </div>`).join("")
    : `<div class="empty-state">Save reviewed records to populate this chart.</div>`;
}

function statusPill(doc) {
  if (!doc.reviewedAt)            return `<span class="pill muted">Draft</span>`;
  if (validateRecord(doc).length) return `<span class="pill danger">Review</span>`;
  return `<span class="pill ok">Valid</span>`;
}

//  Event wiring 
document.querySelectorAll(".nav-item").forEach((btn) =>
  btn.addEventListener("click", () => switchView(btn.dataset.view))
);

function switchView(view) {
  document.querySelectorAll(".nav-item").forEach((i) => i.classList.toggle("active", i.dataset.view === view));
  document.querySelectorAll(".view").forEach((i) => i.classList.toggle("active", i.id === view));
}

els.fileInput.addEventListener("change", (e) => handleFiles([...e.target.files]));
els.dropzone.addEventListener("dragover", (e) => { e.preventDefault(); els.dropzone.classList.add("dragging"); });
els.dropzone.addEventListener("dragleave", () => els.dropzone.classList.remove("dragging"));
els.dropzone.addEventListener("drop", (e) => {
  e.preventDefault(); els.dropzone.classList.remove("dragging");
  handleFiles([...e.dataTransfer.files]);
});

document.body.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-open]");
  if (btn) {
    activeId = btn.dataset.open;
    if (btn.dataset.viewTarget) switchView(btn.dataset.viewTarget);
    persist();
  }
});

els.reviewForm.addEventListener("input", (e) => {
  const input = e.target.closest("[data-field]");
  const doc = activeDocument();
  if (!input || !doc) return;
  doc.fields[input.dataset.field] = input.value;
  doc.confidence[input.dataset.field] = Math.max(doc.confidence[input.dataset.field] || 0, 0.99);
  persist(false);
  updateValidationState(doc);
  renderAnalytics();
});

els.reviewForm.addEventListener("keydown", (e) => {
  if (e.key === "Enter") e.preventDefault();
});

els.saveRecord.addEventListener("click", () => {
  const doc = activeDocument();
  if (!doc) return;
  doc.reviewedAt = new Date().toISOString();
  persist();
  setOcrState("Saved ✓", "ok");
});

els.rerunExtraction.addEventListener("click", () => {
  const doc = activeDocument();
  if (doc && !doc.parentId) extractForDocument(doc.id);
});

els.searchInput.addEventListener("input", renderHistory);
els.statusFilter.addEventListener("change", renderHistory);

document.querySelector("#seed-demo").addEventListener("click", () => {
  const seeded = demoRecords.map((r) => ({ ...r, id: id(), previewDataUrl: "" }));
  state.documents = [...seeded, ...state.documents];
  activeId = seeded[0].id;
  persist();
});

document.querySelector("#reset-data").addEventListener("click", () => {
  state = { documents: [] };
  activeId = null;
  localStorage.removeItem(STORAGE_KEY);
  setOcrState("Idle", "muted");
  persist();
});

document.querySelector("#export-json").addEventListener("click", () => {
  const exportData = state.documents.map(({ previewDataUrl, ...rest }) => rest);
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "biztelai-reviewed-records.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

render();

function updateValidationState(doc) {
  const validation = validateRecord(doc);
  const invalidFields = new Set(validation.map((e) => e.field));
  els.reviewForm.querySelectorAll(".field").forEach((fieldEl) => {
    const input = fieldEl.querySelector("[data-field]");
    fieldEl.classList.toggle("invalid", invalidFields.has(input.dataset.field));
    const confEl = fieldEl.querySelector(".confidence");
    if (confEl) confEl.textContent = `${Math.round((doc.confidence[input.dataset.field] || 0) * 100)}%`;
  });
  els.validationSummary.innerHTML = validation.length
    ? validation.map((e) => `<div class="validation-item">${escapeHtml(e.message)}</div>`).join("")
    : `<div class="validation-item ok">All checks passed. Record is ready to save.</div>`;
}
