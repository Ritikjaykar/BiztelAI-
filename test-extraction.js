const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const samples = [
  {
    file: "valid-production-slip.svg",
    expectedErrors: [],
    expected: {
      date: "2026-06-05",
      shift: "A",
      employeeNumber: "E1042",
      operationCode: "OP-210",
      machineNumber: "M-07",
      workOrderNumber: "WO-24091",
      quantityProduced: "480",
      timeTakenMinutes: "420",
    },
  },
  {
    file: "exception-production-slip.svg",
    expectedErrors: [
      "Shift must be A, B, or C.",
      "Employee number should match E1042 style format.",
      "Quantity must be greater than zero.",
    ],
    expected: {
      date: "2026-06-05",
      shift: "D",
      employeeNumber: "E42",
      operationCode: "OP-210",
      machineNumber: "M-07",
      workOrderNumber: "WO-24092",
      quantityProduced: "0",
      timeTakenMinutes: "35",
    },
  },
];

function svgText(file) {
  const svg = readFileSync(join(__dirname, "sample-documents", file), "utf8");
  return [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)]
    .map((match) => match[1].replace(/&amp;/g, "&").trim())
    .filter(Boolean)
    .join("\n");
}

function parseOperationalText(text) {
  const patterns = {
    date: /(?:date|dt)[:\s-]*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    shift: /(?:^|\n)\s*shift\s*[:\-]\s*([A-Z])\b/i,
    employeeNumber: /(?:employee|emp|operator)(?:\s*(?:no|number|#))?[:\s-]*([A-Z]?\d{2,6})/i,
    operationCode: /(?:operation|op)(?:\s*code)?[:\s-]*([A-Z]{0,3}[-\s]?\d{2,5})/i,
    machineNumber: /(?:machine|mc|m\/c)(?:\s*(?:no|number|#))?[:\s-]*([A-Z]?[-\s]?\d{1,4})/i,
    workOrderNumber: /(?:work\s*order|wo|job)(?:\s*(?:no|number|#))?[:\s-]*([A-Z]{0,3}[-\s]?\d{3,8})/i,
    quantityProduced: /(?:quantity\s*produced|quantity|qty|produced)[:\s-]*(\d{1,6})/i,
    timeTakenMinutes: /(?:time\s*taken|time|duration|taken)[:\s-]*(\d{1,4})/i,
  };

  return Object.fromEntries(
    Object.entries(patterns).map(([key, pattern]) => [key, normalizeField(key, text.match(pattern)?.[1] || "")]),
  );
}

function validateRecord(fields) {
  const errors = [];
  if (fields.shift && !["A", "B", "C"].includes(fields.shift)) {
    errors.push("Shift must be A, B, or C.");
  }
  if (fields.employeeNumber && !/^E\d{3,6}$/.test(fields.employeeNumber)) {
    errors.push("Employee number should match E1042 style format.");
  }
  if (fields.operationCode && !/^OP-\d{2,5}$/.test(fields.operationCode)) {
    errors.push("Operation code should match OP-210 style format.");
  }
  if (fields.machineNumber && !/^M-\d{2,4}$/.test(fields.machineNumber)) {
    errors.push("Machine number should match M-01 style format.");
  }
  if (fields.workOrderNumber && !/^WO-\d{3,8}$/.test(fields.workOrderNumber)) {
    errors.push("Work order should match WO-24091 style format.");
  }
  const qty = Number(fields.quantityProduced);
  if (!Number.isFinite(qty) || qty <= 0) {
    errors.push("Quantity must be greater than zero.");
  }
  const time = Number(fields.timeTakenMinutes);
  if (!Number.isFinite(time) || time <= 0 || time > 720) {
    errors.push("Time taken must be between 1 and 720 minutes.");
  }
  return errors;
}

function normalizeField(key, value) {
  const cleaned = String(value || "").trim().replace(/\s+/g, "-").toUpperCase();
  if (key === "machineNumber" && /^\d+$/.test(cleaned)) return `M-${cleaned.padStart(2, "0")}`;
  if (key === "operationCode" && /^\d+$/.test(cleaned)) return `OP-${cleaned}`;
  if (key === "employeeNumber" && /^\d+$/.test(cleaned)) return `E${cleaned}`;
  if (key === "workOrderNumber" && /^\d+$/.test(cleaned)) return `WO-${cleaned}`;
  return cleaned;
}

let failures = 0;

for (const sample of samples) {
  const actual = parseOperationalText(svgText(sample.file));
  for (const [key, expectedValue] of Object.entries(sample.expected)) {
    if (actual[key] !== expectedValue) {
      failures += 1;
      console.error(`${sample.file}: ${key} expected ${expectedValue}, got ${actual[key]}`);
    }
  }
  const errors = validateRecord(actual);
  if (JSON.stringify(errors) !== JSON.stringify(sample.expectedErrors)) {
    failures += 1;
    console.error(`${sample.file}: expected errors ${JSON.stringify(sample.expectedErrors)}, got ${JSON.stringify(errors)}`);
  }
  console.log(`${sample.file}:`, actual);
}

if (failures) {
  process.exitCode = 1;
} else {
  console.log("Extraction tests passed.");
}
