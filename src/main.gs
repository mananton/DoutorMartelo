function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================
//  FICHEIRO CENTRAL — Code.gs (Versão Limpa MVC - AppSheet Backend)
//
//  Contém APENAS:
//  1. Dashboard Web App (doGet, include, getDashboardData)
//  2. Menu OnOpen simplificado
//  3. Helpers
// ============================================================

// ── CONFIGURAÇÃO GLOBAL ───────────────────────────────────────
const SHEET_REGISTOS   = "REGISTOS_POR_DIA"; // arquivo direto gerido pela AppSheet
const SHEET_OBRAS      = "OBRAS";
const SHEET_COLAB      = "COLABORADORES";
const SHEET_VIAGENS    = "VIAGENS_DIARIAS";
const SHEET_DESLOCACOES = "REGISTO_DESLOCACOES"; // viagens por obra (AppSheet)
const SHEET_FERIAS      = "FERIAS";
const SHEET_MATERIAIS_MOV = "MATERIAIS_MOV";
const SHEET_MATERIAIS_CAD = "MATERIAIS_CAD";
const SHEET_STOCK_ATUAL = "STOCK_ATUAL";
const SHEET_FATURAS = "FATURAS";
const SHEET_FATURAS_ITENS = "FATURAS_ITENS";
const SHEET_COMPROMISSOS_OBRA = "COMPROMISSOS_OBRA";
const SHEET_NAO_REGISTADOS = "NAO_REGISTADOS_HIST";
const SHEET_LEGACY_MAO_OBRA = "LEGACY_MAO_OBRA";
const SHEET_LEGACY_MATERIAIS = "MATERIAIS_LEGACY";
const SHEET_LEGACY_MATERIAIS_ALT = "LEGACY_MATERIAIS";
const TZ               = "Europe/Lisbon";
const NREG_HOUR        = 23;
const NREG_MINUTE      = 45;
const ENABLE_EMPTY_ROW_CLEANUP = true; // limpeza automática reativada

// ════════════════════════════════════════════════════════════
//  SECÇÃO 1 — DASHBOARD WEB APP
// ════════════════════════════════════════════════════════════

/** Serve o dashboard HTML quando o URL é aberto no browser */
function doGet(e) {
  return HtmlService
    .createTemplateFromFile("index")
    .evaluate()
    .setTitle("Dashboard de Gestão de Obra")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Chamado pelo dashboard via google.script.run para obter os dados JSON */
function getDashboardData(options) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const opts = options || {};
    if (String(opts.mode || "").toLowerCase() === "legacy") {
      return JSON.stringify(buildData_(ss));
    }
    return JSON.stringify(buildRawData_(ss));
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

function getLegacyMateriaisSheet_(ss) {
  if (!ss) return null;
  return ss.getSheetByName(SHEET_LEGACY_MATERIAIS) ||
    ss.getSheetByName(SHEET_LEGACY_MATERIAIS_ALT);
}

function getAutoIdSpecs_() {
  return [
    {
      sheetName: SHEET_FATURAS,
      prefix: "FAT",
      idHeaders: ["ID_Fatura"],
      signalHeaders: ["Fornecedor", "NIF", "Nº Doc/Fatura", "N Doc/Fatura", "Data Fatura", "Valor"]
    },
    {
      sheetName: SHEET_COMPROMISSOS_OBRA,
      prefix: "COMP",
      idHeaders: ["ID_Compromisso"],
      signalHeaders: ["Fornecedor", "NIF", "Tipo_Doc", "Doc_Origem", "Obra", "Fase", "Descricao", "Valor_Com_IVA"]
    },
    {
      sheetName: SHEET_FATURAS_ITENS,
      prefix: "FIT",
      idHeaders: ["ID_Item_Fatura", "ID Item Fatura"],
      signalHeaders: ["ID_Fatura", "Descricao_Original", "Quantidade", "Custo_Unit", "Destino"]
    },
    {
      sheetName: SHEET_MATERIAIS_MOV,
      prefix: "MOV",
      idHeaders: ["ID_Mov", "ID Mov", "ID_Movimento"],
      signalHeaders: ["Data", "Tipo", "ID_Item", "Item_Oficial", "Material", "Quantidade"]
    }
  ];
}

function findHeaderIndexByAliases_(headers, aliases) {
  const normalized = headers.map(function(h) { return normalizeHeader_(h); });
  for (let i = 0; i < aliases.length; i++) {
    const key = normalizeHeader_(aliases[i]);
    const idx = normalized.indexOf(key);
    if (idx >= 0) return idx;
  }
  return -1;
}

function rowHasSignalData_(row, indexes) {
  for (let i = 0; i < indexes.length; i++) {
    const idx = indexes[i];
    if (idx < 0) continue;
    const value = row[idx];
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return true;
  }
  return false;
}

function parseAutoIdNumber_(value, prefix) {
  const match = String(value || "").trim().match(new RegExp("^" + prefix + "-(\\d+)$", "i"));
  return match ? parseInt(match[1], 10) : 0;
}

function formatAutoId_(prefix, number) {
  return prefix + "-" + String(number).padStart(6, "0");
}

function assignMissingIdsForSheet_(sheet, spec) {
  if (!sheet || !spec) return 0;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return 0;

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idCol = findHeaderIndexByAliases_(headers, spec.idHeaders || []);
  if (idCol < 0) return 0;

  const signalIndexes = (spec.signalHeaders || [])
    .map(function(alias) { return findHeaderIndexByAliases_(headers, [alias]); })
    .filter(function(idx) { return idx >= 0; });
  if (!signalIndexes.length) return 0;

  const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const idValues = rows.map(function(row) { return [row[idCol]]; });
  let nextNumber = 0;
  let changed = 0;

  for (let i = 0; i < rows.length; i++) {
    nextNumber = Math.max(nextNumber, parseAutoIdNumber_(rows[i][idCol], spec.prefix));
  }

  for (let i = 0; i < rows.length; i++) {
    const existing = String(rows[i][idCol] || "").trim();
    if (existing) continue;
    if (!rowHasSignalData_(rows[i], signalIndexes)) continue;
    nextNumber += 1;
    idValues[i][0] = formatAutoId_(spec.prefix, nextNumber);
    changed += 1;
  }

  if (changed > 0) {
    sheet.getRange(2, idCol + 1, idValues.length, 1).setValues(idValues);
  }
  return changed;
}

function ensureManagedSheetIdsForSheet_(sheet) {
  if (!sheet) return 0;
  if (sheet.getName() === SHEET_MATERIAIS_CAD) {
    return processMateriaisCadSheet_(sheet);
  }
  const spec = getAutoIdSpecs_().find(function(item) {
    return item.sheetName === sheet.getName();
  });
  return spec ? assignMissingIdsForSheet_(sheet, spec) : 0;
}

function ensureManagedSheetIds_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const specs = getAutoIdSpecs_();
  let total = 0;
  specs.forEach(function(spec) {
    total += assignMissingIdsForSheet_(ss.getSheetByName(spec.sheetName), spec);
  });
  total += processMateriaisCadSheet_(ss.getSheetByName(SHEET_MATERIAIS_CAD));
  return total;
}

function buildLookupById_(sheet, idAliases, fieldAliasesMap) {
  const out = {};
  if (!sheet) return out;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return out;

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idCol = findHeaderIndexByAliases_(headers, idAliases || []);
  if (idCol < 0) return out;

  const fieldIndexes = {};
  Object.keys(fieldAliasesMap || {}).forEach(function(key) {
    fieldIndexes[key] = findHeaderIndexByAliases_(headers, fieldAliasesMap[key]);
  });

  const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  rows.forEach(function(row) {
    const id = String(row[idCol] || "").trim();
    if (!id) return;
    if (!out[id]) out[id] = {};
    Object.keys(fieldIndexes).forEach(function(key) {
      const idx = fieldIndexes[key];
      out[id][key] = idx >= 0 ? row[idx] : "";
    });
  });
  return out;
}

function parseNumberLoose_(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").trim();
  if (!text) return 0;
  const normalized = text
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

function buildAverageCostByItemFromMov_(sheet) {
  const out = {};
  if (!sheet) return out;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return out;

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const cols = {
    tipo: findHeaderIndexByAliases_(headers, ["Tipo"]),
    idItem: findHeaderIndexByAliases_(headers, ["ID_Item", "ID Item"]),
    qtd: findHeaderIndexByAliases_(headers, ["Quantidade"]),
    custoUnit: findHeaderIndexByAliases_(headers, ["Custo_Unit", "Custo Unit"]),
    custoComIva: findHeaderIndexByAliases_(headers, ["Custo_Total Com IVA", "Custo Total Com IVA"]),
    custoSemIva: findHeaderIndexByAliases_(headers, ["Custo_Total Sem IVA", "Custo Total Sem IVA"])
  };
  if (cols.idItem < 0) return out;

  const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  rows.forEach(function(row) {
    const tipo = String(cols.tipo >= 0 ? row[cols.tipo] : "").trim().toUpperCase();
    if (tipo !== "ENTRADA") return;
    const idItem = String(row[cols.idItem] || "").trim();
    const qtd = parseNumberLoose_(cols.qtd >= 0 ? row[cols.qtd] : 0);
    if (!idItem || qtd <= 0) return;
    let custoUnit = parseNumberLoose_(cols.custoUnit >= 0 ? row[cols.custoUnit] : 0);
    if (!custoUnit) {
      const totalComIva = parseNumberLoose_(cols.custoComIva >= 0 ? row[cols.custoComIva] : 0);
      const totalSemIva = parseNumberLoose_(cols.custoSemIva >= 0 ? row[cols.custoSemIva] : 0);
      const total = totalComIva || totalSemIva || 0;
      custoUnit = qtd > 0 ? (total / qtd) : 0;
    }
    if (!custoUnit) return;
    if (!out[idItem]) out[idItem] = { totalQty: 0, totalValue: 0 };
    out[idItem].totalQty += qtd;
    out[idItem].totalValue += (custoUnit * qtd);
  });

  Object.keys(out).forEach(function(idItem) {
    const bucket = out[idItem];
    out[idItem] = bucket.totalQty > 0 ? (bucket.totalValue / bucket.totalQty) : 0;
  });
  return out;
}

function normalizeNature_(value) {
  const key = normalizeHeader_(value).replace(/\s+/g, "_").toUpperCase();
  if (key === "MATERIAL") return "MATERIAL";
  if (key === "SERVICO" || key === "SERVIÇO") return "SERVICO";
  if (key === "ALUGUER") return "ALUGUER";
  if (key === "TRANSPORTE") return "TRANSPORTE";
  return "";
}

function getNaturePrefix_(natureza) {
  switch (normalizeNature_(natureza)) {
    case "MATERIAL": return "MAT";
    case "SERVICO": return "SER";
    case "ALUGUER": return "ALQ";
    case "TRANSPORTE": return "TRN";
    default: return "MAT";
  }
}

function normalizeMaterialText_(value) {
  let text = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  const replacements = [
    [/\bABRA\.?C?\b/g, " ABRACADEIRA "],
    [/\bC\/PARAF\.?\b/g, " COM PARAFUSO "],
    [/\bP\/\b/g, " PARA "],
    [/\bMULTICA(?:MADA)?\b/g, " MULTICAMADA "],
    [/\bT[ÊE]\b/g, " TE "],
    [/\bVINTE E CINCO\b/g, " 25 "],
    [/\bVINTE\b/g, " 20 "],
    [/\bTRINTA E DOIS\b/g, " 32 "],
    [/\bQUARENTA E CINCO\b/g, " 45 "],
    [/\bQUARENTA\b/g, " 40 "],
    [/\bCINQUENTA\b/g, " 50 "],
    [/\bSETENTA E CINCO\b/g, " 75 "],
    [/\bNOVENTA\b/g, " 90 "]
  ];
  replacements.forEach(function(pair) {
    text = text.replace(pair[0], pair[1]);
  });

  return text
    .replace(/[º°]/g, " ")
    .replace(/[\"']/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function materialTokens_(value) {
  const stop = {
    COM: true,
    PARA: true,
    DE: true,
    DA: true,
    DO: true,
    DAS: true,
    DOS: true,
    EM: true,
    E: true,
    O: true,
    A: true
  };
  return normalizeMaterialText_(value)
    .split(" ")
    .filter(function(token) {
      return token && !stop[token];
    });
}

function materialNumericSignature_(value) {
  const matches = normalizeMaterialText_(value).match(/\d+(?:\.\d+)?/g);
  return matches ? matches.join("|") : "";
}

function scoreMaterialSimilarity_(left, right) {
  const leftNorm = normalizeMaterialText_(left);
  const rightNorm = normalizeMaterialText_(right);
  if (!leftNorm || !rightNorm) return 0;
  if (leftNorm === rightNorm) return 1;

  const leftTokens = materialTokens_(leftNorm);
  const rightTokens = materialTokens_(rightNorm);
  const leftSet = {};
  const rightSet = {};
  leftTokens.forEach(function(token) { leftSet[token] = true; });
  rightTokens.forEach(function(token) { rightSet[token] = true; });

  let inter = 0;
  Object.keys(leftSet).forEach(function(token) {
    if (rightSet[token]) inter += 1;
  });
  const union = Object.keys(leftSet).length + Object.keys(rightSet).length - inter;
  let score = union > 0 ? (inter / union) : 0;

  const leftNums = materialNumericSignature_(leftNorm);
  const rightNums = materialNumericSignature_(rightNorm);
  if (leftNums && rightNums) {
    score += leftNums === rightNums ? 0.18 : -0.15;
  }
  if (leftNorm.indexOf(rightNorm) >= 0 || rightNorm.indexOf(leftNorm) >= 0) {
    score += 0.08;
  }
  return Math.max(0, Math.min(1, score));
}

function suggestItemOficialFromDescricao_(value) {
  return normalizeMaterialText_(value)
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getMateriaisCadColumns_(headers) {
  return {
    idItem: findHeaderIndexByAliases_(headers, ["ID_Item", "ID Item"]),
    fornecedor: findHeaderIndexByAliases_(headers, ["Fornecedor"]),
    descricao: findHeaderIndexByAliases_(headers, ["Descricao_Original", "Descrição_Original", "Descricao Original"]),
    itemOficial: findHeaderIndexByAliases_(headers, ["Item_Oficial", "Item Oficial"]),
    natureza: findHeaderIndexByAliases_(headers, ["Natureza"]),
    unidade: findHeaderIndexByAliases_(headers, ["Unidade"]),
    observacoes: findHeaderIndexByAliases_(headers, ["Observacoes", "Observação", "Observacao"]),
    estado: findHeaderIndexByAliases_(headers, ["Estado_Cadastro", "Estado Cadastro"])
  };
}

function buildMateriaisCadContext_(sheet) {
  if (!sheet) return null;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return null;

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const cols = getMateriaisCadColumns_(headers);
  const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const nextByPrefix = {};

  rows.forEach(function(row) {
    const id = String(cols.idItem >= 0 ? row[cols.idItem] : "").trim();
    const match = id.match(/^([A-Z]{3})-(\d+)$/i);
    if (!match) return;
    const prefix = match[1].toUpperCase();
    const number = parseInt(match[2], 10) || 0;
    nextByPrefix[prefix] = Math.max(nextByPrefix[prefix] || 0, number);
  });

  const records = rows.map(function(row, index) {
    return {
      rowNum: index + 2,
      idItem: String(cols.idItem >= 0 ? row[cols.idItem] : "").trim(),
      fornecedor: String(cols.fornecedor >= 0 ? row[cols.fornecedor] : "").trim(),
      descricao: String(cols.descricao >= 0 ? row[cols.descricao] : "").trim(),
      itemOficial: String(cols.itemOficial >= 0 ? row[cols.itemOficial] : "").trim(),
      natureza: normalizeNature_(cols.natureza >= 0 ? row[cols.natureza] : ""),
      unidade: String(cols.unidade >= 0 ? row[cols.unidade] : "").trim(),
      normalizedFornecedor: normalizeHeader_(cols.fornecedor >= 0 ? row[cols.fornecedor] : "").toUpperCase(),
      normalizedDescricao: normalizeMaterialText_(cols.descricao >= 0 ? row[cols.descricao] : "")
    };
  });

  return {
    sheet: sheet,
    lastCol: lastCol,
    headers: headers,
    cols: cols,
    rows: rows,
    records: records,
    nextByPrefix: nextByPrefix
  };
}

function buildMateriaisCatalogById_(sheet) {
  const out = {};
  const ctx = buildMateriaisCadContext_(sheet);
  if (!ctx) return out;

  ctx.records.forEach(function(record) {
    if (!record.idItem) return;
    if (!out[record.idItem]) {
      out[record.idItem] = {
        itemOficial: "",
        unidade: "",
        natureza: ""
      };
    }
    if (!out[record.idItem].itemOficial && record.itemOficial) out[record.idItem].itemOficial = record.itemOficial;
    if (!out[record.idItem].unidade && record.unidade) out[record.idItem].unidade = record.unidade;
    if (!out[record.idItem].natureza && record.natureza) out[record.idItem].natureza = record.natureza;
  });
  return out;
}

function findBestMaterialCadMatch_(ctx, fornecedor, descricao, natureza, excludeRowNum) {
  if (!ctx || !descricao) return null;
  const normalizedFornecedor = normalizeHeader_(fornecedor).toUpperCase();
  const normalizedDescricao = normalizeMaterialText_(descricao);
  const naturezaNorm = normalizeNature_(natureza);
  let best = null;

  for (let i = 0; i < ctx.records.length; i++) {
    const record = ctx.records[i];
    if (!record.descricao) continue;
    if (record.rowNum === excludeRowNum) continue;

    if (normalizedFornecedor &&
        record.normalizedFornecedor === normalizedFornecedor &&
        record.normalizedDescricao === normalizedDescricao) {
      return {
        type: "exact",
        score: 1,
        record: record
      };
    }

    let score = scoreMaterialSimilarity_(normalizedDescricao, record.normalizedDescricao);
    if (!score) continue;
    if (normalizedFornecedor && record.normalizedFornecedor === normalizedFornecedor) score += 0.05;
    if (naturezaNorm && record.natureza && naturezaNorm !== record.natureza) score -= 0.08;
    if (!best || score > best.score) {
      best = {
        type: score >= 0.9 ? "similar_strong" : "similar",
        score: score,
        record: record
      };
    }
  }

  return best && best.score >= 0.78 ? best : null;
}

function processMateriaisCadRow_(sheet, rowNum, ctx) {
  if (!sheet || rowNum < 2) return 0;
  const context = ctx || buildMateriaisCadContext_(sheet);
  if (!context) return 0;

  const cols = context.cols;
  const rowIndex = rowNum - 2;
  if (rowIndex < 0 || rowIndex >= context.rows.length) return 0;

  const row = context.rows[rowIndex].slice();
  const fornecedor = String(cols.fornecedor >= 0 ? row[cols.fornecedor] : "").trim();
  const descricao = String(cols.descricao >= 0 ? row[cols.descricao] : "").trim();
  const naturezaRaw = cols.natureza >= 0 ? row[cols.natureza] : "";
  const natureza = normalizeNature_(naturezaRaw);
  const unidade = String(cols.unidade >= 0 ? row[cols.unidade] : "").trim();
  let idItem = String(cols.idItem >= 0 ? row[cols.idItem] : "").trim();
  let itemOficial = String(cols.itemOficial >= 0 ? row[cols.itemOficial] : "").trim();
  let changed = 0;
  let estado = "";

  if (!fornecedor && !descricao && !natureza && !unidade) return 0;

  const match = findBestMaterialCadMatch_(context, fornecedor, descricao, natureza, rowNum);
  if (match && match.record) {
    if (!idItem || match.type === "exact" || match.type === "similar_strong") {
      idItem = match.record.idItem || idItem;
      if (cols.idItem >= 0 && row[cols.idItem] !== idItem) {
        row[cols.idItem] = idItem;
        changed += 1;
      }
    }
    if (match.record.itemOficial && (!itemOficial || match.type === "exact" || match.type === "similar_strong")) {
      itemOficial = match.record.itemOficial;
      if (cols.itemOficial >= 0 && row[cols.itemOficial] !== itemOficial) {
        row[cols.itemOficial] = itemOficial;
        changed += 1;
      }
    }
    if (cols.unidade >= 0 && !unidade && match.record.unidade) {
      row[cols.unidade] = match.record.unidade;
      changed += 1;
    }
    if (cols.natureza >= 0 && !natureza && match.record.natureza) {
      row[cols.natureza] = match.record.natureza;
      changed += 1;
    }
    estado = match.type === "exact" ? "DUPLICADO_EXATO" : "SEMELHANTE_REVER";
  } else {
    if (!idItem) {
      const prefix = getNaturePrefix_(natureza || "MATERIAL");
      const nextNum = (context.nextByPrefix[prefix] || 0) + 1;
      context.nextByPrefix[prefix] = nextNum;
      idItem = formatAutoId_(prefix, nextNum);
      if (cols.idItem >= 0) {
        row[cols.idItem] = idItem;
        changed += 1;
      }
    }
    if (!itemOficial && cols.itemOficial >= 0) {
      itemOficial = suggestItemOficialFromDescricao_(descricao);
      row[cols.itemOficial] = itemOficial;
      changed += 1;
    }
    estado = "NOVO_ITEM";
  }

  if (cols.estado >= 0 && row[cols.estado] !== estado) {
    row[cols.estado] = estado;
    changed += 1;
  }

  if (changed > 0) {
    sheet.getRange(rowNum, 1, 1, context.lastCol).setValues([row]);
  }
  if (cols.estado >= 0) {
    sheet.getRange(rowNum, cols.estado + 1).setBackground(getStatusBackgroundColor_(estado));
  }

  context.rows[rowIndex] = row;
  context.records[rowIndex] = {
    rowNum: rowNum,
    idItem: String(cols.idItem >= 0 ? row[cols.idItem] : "").trim(),
    fornecedor: String(cols.fornecedor >= 0 ? row[cols.fornecedor] : "").trim(),
    descricao: String(cols.descricao >= 0 ? row[cols.descricao] : "").trim(),
    itemOficial: String(cols.itemOficial >= 0 ? row[cols.itemOficial] : "").trim(),
    natureza: normalizeNature_(cols.natureza >= 0 ? row[cols.natureza] : ""),
    unidade: String(cols.unidade >= 0 ? row[cols.unidade] : "").trim(),
    normalizedFornecedor: normalizeHeader_(cols.fornecedor >= 0 ? row[cols.fornecedor] : "").toUpperCase(),
    normalizedDescricao: normalizeMaterialText_(cols.descricao >= 0 ? row[cols.descricao] : "")
  };

  return changed > 0 && estado === "NOVO_ITEM" ? 1 : 0;
}

function processMateriaisCadSheet_(sheet) {
  if (!sheet || sheet.getName() !== SHEET_MATERIAIS_CAD) return 0;
  const ctx = buildMateriaisCadContext_(sheet);
  if (!ctx) return 0;
  let generated = 0;
  for (let rowNum = 2; rowNum <= ctx.rows.length + 1; rowNum++) {
    generated += processMateriaisCadRow_(sheet, rowNum, ctx);
  }
  return generated;
}

function hydrateFaturasItensFromCatalog_(sheet, rowNum) {
  if (!sheet || rowNum < 2 || sheet.getName() !== SHEET_FATURAS_ITENS) return;
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const cols = {
    fornecedor: findHeaderIndexByAliases_(headers, ["Fornecedor"]),
    descricao: findHeaderIndexByAliases_(headers, ["Descricao_Original", "Descrição_Original", "Descricao Original"]),
    idItem: findHeaderIndexByAliases_(headers, ["ID_Item", "ID Item"]),
    itemOficial: findHeaderIndexByAliases_(headers, ["Item_Oficial", "Item Oficial"]),
    unidade: findHeaderIndexByAliases_(headers, ["Unidade"]),
    estado: findHeaderIndexByAliases_(headers, ["Estado_Mapeamento", "Estado Mapeamento"]),
    sugestao: findHeaderIndexByAliases_(headers, ["Sugestao_Alias", "Sugestão_Alias", "Sugestao Alias"])
  };
  if (cols.descricao < 0) return;

  const row = sheet.getRange(rowNum, 1, 1, lastCol).getValues()[0];
  const fornecedor = String(cols.fornecedor >= 0 ? row[cols.fornecedor] : "").trim();
  const descricao = String(cols.descricao >= 0 ? row[cols.descricao] : "").trim();
  if (!fornecedor && !descricao) return;

  if (!descricao) {
    if (cols.idItem >= 0) sheet.getRange(rowNum, cols.idItem + 1).setValue("");
    if (cols.itemOficial >= 0) sheet.getRange(rowNum, cols.itemOficial + 1).setValue("");
    if (cols.unidade >= 0) sheet.getRange(rowNum, cols.unidade + 1).setValue("");
    if (cols.estado >= 0) sheet.getRange(rowNum, cols.estado + 1).setValue("");
    if (cols.sugestao >= 0) sheet.getRange(rowNum, cols.sugestao + 1).setValue("");
    if (cols.estado >= 0) {
      sheet.getRange(rowNum, cols.estado + 1).setBackground("#ffffff");
    }
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cadCtx = buildMateriaisCadContext_(ss.getSheetByName(SHEET_MATERIAIS_CAD));
  const match = findBestMaterialCadMatch_(cadCtx, fornecedor, descricao, "", 0);

  if (match && match.record) {
    if (cols.idItem >= 0) sheet.getRange(rowNum, cols.idItem + 1).setValue(match.record.idItem || "");
    if (cols.itemOficial >= 0) sheet.getRange(rowNum, cols.itemOficial + 1).setValue(match.record.itemOficial || "");
    if (cols.unidade >= 0) sheet.getRange(rowNum, cols.unidade + 1).setValue(match.record.unidade || "");
    if (cols.estado >= 0) sheet.getRange(rowNum, cols.estado + 1).setValue(match.type === "exact" ? "ITEM_ENCONTRADO" : "SEMELHANTE_REVER");
    if (cols.sugestao >= 0) sheet.getRange(rowNum, cols.sugestao + 1).setValue("");
  } else if (cols.estado >= 0 && descricao) {
    if (cols.idItem >= 0) sheet.getRange(rowNum, cols.idItem + 1).setValue("");
    if (cols.itemOficial >= 0) sheet.getRange(rowNum, cols.itemOficial + 1).setValue("");
    if (cols.unidade >= 0) sheet.getRange(rowNum, cols.unidade + 1).setValue("");
    sheet.getRange(rowNum, cols.estado + 1).setValue("CADASTRO_EM_FALTA");
    if (cols.sugestao >= 0) {
      const sugestao = suggestItemOficialFromDescricao_(descricao);
      sheet.getRange(rowNum, cols.sugestao + 1).setValue(sugestao);
    }
  }

  if (cols.estado >= 0) {
    const estadoAtual = sheet.getRange(rowNum, cols.estado + 1).getValue();
    sheet.getRange(rowNum, cols.estado + 1).setBackground(getStatusBackgroundColor_(estadoAtual));
  }
}

function hydrateFaturasItensFromFaturas_(sheet, rowNum) {
  if (!sheet || rowNum < 2 || sheet.getName() !== SHEET_FATURAS_ITENS) return;
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const cols = {
    idFatura: findHeaderIndexByAliases_(headers, ["ID_Fatura", "ID Fatura"]),
    fornecedor: findHeaderIndexByAliases_(headers, ["Fornecedor"]),
    nif: findHeaderIndexByAliases_(headers, ["NIF"]),
    doc: findHeaderIndexByAliases_(headers, ["Nº Doc/Fatura", "NÂº Doc/Fatura", "N Doc/Fatura"]),
    data: findHeaderIndexByAliases_(headers, ["Data Fatura", "Data"])
  };
  if (cols.idFatura < 0) return;

  const row = sheet.getRange(rowNum, 1, 1, lastCol).getValues()[0];
  const idFatura = String(row[cols.idFatura] || "").trim();
  if (!idFatura) {
    if (cols.fornecedor >= 0) sheet.getRange(rowNum, cols.fornecedor + 1).setValue("");
    if (cols.nif >= 0) sheet.getRange(rowNum, cols.nif + 1).setValue("");
    if (cols.doc >= 0) sheet.getRange(rowNum, cols.doc + 1).setValue("");
    if (cols.data >= 0) sheet.getRange(rowNum, cols.data + 1).setValue("");
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const faturasLookup = buildLookupById_(
    ss.getSheetByName(SHEET_FATURAS),
    ["ID_Fatura", "ID Fatura"],
    {
      fornecedor: ["Fornecedor"],
      nif: ["NIF"],
      doc: ["Nº Doc/Fatura", "NÂº Doc/Fatura", "N Doc/Fatura"],
      data: ["Data Fatura", "Data"]
    }
  );
  const fat = faturasLookup[idFatura] || {};
  if (cols.fornecedor >= 0) sheet.getRange(rowNum, cols.fornecedor + 1).setValue(fat.fornecedor || "");
  if (cols.nif >= 0) sheet.getRange(rowNum, cols.nif + 1).setValue(fat.nif || "");
  if (cols.doc >= 0) sheet.getRange(rowNum, cols.doc + 1).setValue(fat.doc || "");
  if (cols.data >= 0) sheet.getRange(rowNum, cols.data + 1).setValue(fat.data || "");
}

function hydrateMateriaisMovFromCatalog_(sheet, rowNum) {
  if (!sheet || rowNum < 2 || sheet.getName() !== SHEET_MATERIAIS_MOV) return;
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const movCols = {
    idItem: findHeaderIndexByAliases_(headers, ["ID_Item", "ID Item"]),
    itemOficial: findHeaderIndexByAliases_(headers, ["Item_Oficial", "Item Oficial"]),
    material: findHeaderIndexByAliases_(headers, ["Material"]),
    unidade: findHeaderIndexByAliases_(headers, ["Unidade"]),
    custoUnit: findHeaderIndexByAliases_(headers, ["Custo_Unit", "Custo Unit"])
  };
  if (movCols.idItem < 0) return;

  const rowValues = sheet.getRange(rowNum, 1, 1, lastCol).getValues()[0];
  const idItem = String(rowValues[movCols.idItem] || "").trim();
  if (!idItem) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cadLookup = buildMateriaisCatalogById_(ss.getSheetByName(SHEET_MATERIAIS_CAD));
  const stockLookup = buildLookupById_(
    ss.getSheetByName(SHEET_STOCK_ATUAL),
    ["ID_Item", "ID Item"],
    {
      custoMedio: ["Custo_Medio_Atual", "Custo Medio Atual"]
    }
  );

  const avgCostByItem = buildAverageCostByItemFromMov_(sheet);
  const cad = cadLookup[idItem] || {};
  const stock = stockLookup[idItem] || {};
  const itemOficial = cad.itemOficial || "";
  const custoMedio = parseNumberLoose_(stock.custoMedio) || parseNumberLoose_(avgCostByItem[idItem]);

  if (movCols.itemOficial >= 0 && itemOficial) {
    rowValues[movCols.itemOficial] = itemOficial;
  }
  if (movCols.material >= 0 && itemOficial) {
    rowValues[movCols.material] = itemOficial;
  }
  if (movCols.unidade >= 0 && cad.unidade !== undefined && cad.unidade !== "") {
    rowValues[movCols.unidade] = cad.unidade;
  }
  if (movCols.custoUnit >= 0 && custoMedio) {
    rowValues[movCols.custoUnit] = custoMedio;
  }

  sheet.getRange(rowNum, 1, 1, lastCol).setValues([rowValues]);
}

function buildFatItemSourceMarker_(idItemFatura) {
  return "[SRC_FIT:" + String(idItemFatura || "").trim() + "]";
}

function parseSourceMarkersFromRows_(rows, obsIdx) {
  const out = {};
  if (obsIdx < 0) return out;
  for (let i = 0; i < rows.length; i++) {
    const obs = String(rows[i][obsIdx] || "");
    const match = obs.match(/\[SRC_FIT:([^\]]+)\]/i);
    if (match && match[1]) {
      out[String(match[1]).trim()] = {
        rowIndex: i,
        rowNumber: i + 2,
        row: rows[i].slice()
      };
    }
  }
  return out;
}

function normalizeDestinoValue_(value) {
  const normalized = normalizeHeader_(value).replace(/\s+/g, "_").toUpperCase();
  if (normalized === "ESTOQUE" || normalized === "STOCK") return "STOCK";
  if (normalized === "CONSUMO_DIRETO" || normalized === "CONSUMO") return "CONSUMO";
  return normalized;
}

function appendSourceMarkerToObs_(obs, idItemFatura) {
  const base = String(obs || "").trim();
  const marker = buildFatItemSourceMarker_(idItemFatura);
  if (base.indexOf(marker) >= 0) return base;
  return base ? (base + " " + marker) : marker;
}

function computeNetUnitCostFromFatItem_(row, itemCols) {
  const quantidade = parseNumberLoose_(itemCols.quantidade >= 0 ? row[itemCols.quantidade] : 0);
  const custoSemIva = parseNumberLoose_(itemCols.custoSemIva >= 0 ? row[itemCols.custoSemIva] : 0);
  if (quantidade > 0 && custoSemIva > 0) {
    return custoSemIva / quantidade;
  }

  let custoUnit = parseNumberLoose_(itemCols.custoUnit >= 0 ? row[itemCols.custoUnit] : 0);
  const desconto1 = parseNumberLoose_(itemCols.desconto1 >= 0 ? row[itemCols.desconto1] : 0);
  const desconto2 = parseNumberLoose_(itemCols.desconto2 >= 0 ? row[itemCols.desconto2] : 0);

  if (desconto1) custoUnit = custoUnit * (1 - desconto1 / 100);
  if (desconto2) custoUnit = custoUnit * (1 - desconto2 / 100);
  return custoUnit;
}

function nextSequentialIdForSheet_(sheet, idHeaders, prefix) {
  if (!sheet) return 1;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return 1;

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idCol = findHeaderIndexByAliases_(headers, idHeaders || []);
  if (idCol < 0) return 1;

  const values = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  let maxNum = 0;
  for (let i = 0; i < values.length; i++) {
    maxNum = Math.max(maxNum, parseAutoIdNumber_(values[i][0], prefix));
  }
  return maxNum + 1;
}

function isFatItemRowActiveForMovement_(row, itemCols) {
  const idItemFatura = String(itemCols.idItemFatura >= 0 ? row[itemCols.idItemFatura] : "").trim();
  const descricao = String(itemCols.descricao >= 0 ? row[itemCols.descricao] : "").trim();
  const idItem = String(itemCols.idItem >= 0 ? row[itemCols.idItem] : "").trim();
  const itemOficial = String(itemCols.itemOficial >= 0 ? row[itemCols.itemOficial] : "").trim();
  const destino = normalizeDestinoValue_(itemCols.destino >= 0 ? row[itemCols.destino] : "");
  const quantidade = parseNumberLoose_(itemCols.quantidade >= 0 ? row[itemCols.quantidade] : 0);
  const obra = String(itemCols.obra >= 0 ? row[itemCols.obra] : "").trim();
  const fase = String(itemCols.fase >= 0 ? row[itemCols.fase] : "").trim();

  if (!idItemFatura || !descricao || !idItem || !itemOficial || quantidade <= 0) return false;
  if (destino !== "STOCK" && destino !== "CONSUMO") return false;
  if (destino === "CONSUMO" && (!obra || !fase)) return false;
  return true;
}

function reconcileGeneratedMateriaisMovRows_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const itemsSheet = ss.getSheetByName(SHEET_FATURAS_ITENS);
  const movSheet = ss.getSheetByName(SHEET_MATERIAIS_MOV);
  if (!itemsSheet || !movSheet) return 0;

  const itemsLastRow = itemsSheet.getLastRow();
  const itemsLastCol = itemsSheet.getLastColumn();
  const itemHeaders = itemsLastCol > 0 ? itemsSheet.getRange(1, 1, 1, itemsLastCol).getValues()[0] : [];
  const itemCols = {
    idItemFatura: findHeaderIndexByAliases_(itemHeaders, ["ID_Item_Fatura", "ID Item Fatura"]),
    descricao: findHeaderIndexByAliases_(itemHeaders, ["Descricao_Original", "Descricao Original"]),
    idItem: findHeaderIndexByAliases_(itemHeaders, ["ID_Item", "ID Item"]),
    itemOficial: findHeaderIndexByAliases_(itemHeaders, ["Item_Oficial", "Item Oficial"]),
    quantidade: findHeaderIndexByAliases_(itemHeaders, ["Quantidade"]),
    destino: findHeaderIndexByAliases_(itemHeaders, ["Destino"]),
    obra: findHeaderIndexByAliases_(itemHeaders, ["Obra"]),
    fase: findHeaderIndexByAliases_(itemHeaders, ["Fase"])
  };
  const validIds = {};
  if (itemCols.idItemFatura >= 0 && itemsLastRow >= 2) {
    const itemValues = itemsSheet.getRange(2, 1, itemsLastRow - 1, itemsLastCol).getValues();
    itemValues.forEach(function(row) {
      if (!isFatItemRowActiveForMovement_(row, itemCols)) return;
      const id = String(row[itemCols.idItemFatura] || "").trim();
      if (id) validIds[id] = true;
    });
  }

  const movLastRow = movSheet.getLastRow();
  const movLastCol = movSheet.getLastColumn();
  if (movLastRow < 2 || movLastCol < 1) return 0;

  const movHeaders = movSheet.getRange(1, 1, 1, movLastCol).getValues()[0];
  const obsCol = findHeaderIndexByAliases_(movHeaders, ["Observacoes", "Observação", "Observacao", "Obs"]);
  if (obsCol < 0) return 0;

  const movRows = movSheet.getRange(2, 1, movLastRow - 1, movLastCol).getValues();
  let removed = 0;
  for (let i = movRows.length - 1; i >= 0; i--) {
    const obs = String(movRows[i][obsCol] || "");
    const match = obs.match(/\[SRC_FIT:([^\]]+)\]/i);
    if (!match || !match[1]) continue;
    const idItemFatura = String(match[1] || "").trim();
    if (idItemFatura && !validIds[idItemFatura]) {
      movSheet.deleteRow(i + 2);
      removed += 1;
    }
  }
  return removed;
}

function gerarMovimentosMateriais_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const itemsSheet = ss.getSheetByName(SHEET_FATURAS_ITENS);
  const movSheet = ss.getSheetByName(SHEET_MATERIAIS_MOV);
  if (!itemsSheet || !movSheet) {
    throw new Error("Folhas obrigatorias nao encontradas: FATURAS_ITENS / MATERIAIS_MOV");
  }

  const itemsLastRow = itemsSheet.getLastRow();
  const itemsLastCol = itemsSheet.getLastColumn();
  if (itemsLastRow < 2 || itemsLastCol < 1) {
    return { generated: 0, existing: 0, invalid: 0, totalRows: 0 };
  }

  const itemHeaders = itemsSheet.getRange(1, 1, 1, itemsLastCol).getValues()[0];
  const itemRows = itemsSheet.getRange(2, 1, itemsLastRow - 1, itemsLastCol).getValues();
  const itemCols = {
    idItemFatura: findHeaderIndexByAliases_(itemHeaders, ["ID_Item_Fatura", "ID Item Fatura"]),
    fornecedor: findHeaderIndexByAliases_(itemHeaders, ["Fornecedor"]),
    nif: findHeaderIndexByAliases_(itemHeaders, ["NIF"]),
    doc: findHeaderIndexByAliases_(itemHeaders, ["Nº Doc/Fatura", "N Doc/Fatura", "Doc Fatura"]),
    data: findHeaderIndexByAliases_(itemHeaders, ["Data Fatura", "Data"]),
    descricao: findHeaderIndexByAliases_(itemHeaders, ["Descricao_Original", "Descricao Original"]),
    idItem: findHeaderIndexByAliases_(itemHeaders, ["ID_Item", "ID Item"]),
    itemOficial: findHeaderIndexByAliases_(itemHeaders, ["Item_Oficial", "Item Oficial"]),
    unidade: findHeaderIndexByAliases_(itemHeaders, ["Unidade"]),
    quantidade: findHeaderIndexByAliases_(itemHeaders, ["Quantidade"]),
    custoUnit: findHeaderIndexByAliases_(itemHeaders, ["Custo_Unit", "Custo Unit"]),
    desconto1: findHeaderIndexByAliases_(itemHeaders, ["Desconto 1", "Desconto_1"]),
    desconto2: findHeaderIndexByAliases_(itemHeaders, ["Desconto 2", "Desconto_2"]),
    custoSemIva: findHeaderIndexByAliases_(itemHeaders, ["Custo_Total Sem IVA", "Custo Total Sem IVA"]),
    iva: findHeaderIndexByAliases_(itemHeaders, ["IVA"]),
    custoComIva: findHeaderIndexByAliases_(itemHeaders, ["Custo_Total Com IVA", "Custo Total Com IVA"]),
    destino: findHeaderIndexByAliases_(itemHeaders, ["Destino"]),
    obra: findHeaderIndexByAliases_(itemHeaders, ["Obra"]),
    fase: findHeaderIndexByAliases_(itemHeaders, ["Fase"]),
    observacoes: findHeaderIndexByAliases_(itemHeaders, ["Observacoes", "Observação", "Observacao"]),
    estado: findHeaderIndexByAliases_(itemHeaders, ["Estado_Mapeamento", "Estado Mapeamento"]),
    sugestao: findHeaderIndexByAliases_(itemHeaders, ["Sugestao_Alias", "Sugestão_Alias", "Sugestao Alias"])
  };

  const movLastRow = movSheet.getLastRow();
  const movLastCol = movSheet.getLastColumn();
  const movHeaders = movLastCol > 0 ? movSheet.getRange(1, 1, 1, movLastCol).getValues()[0] : [];
  const movCols = {
    idMov: findHeaderIndexByAliases_(movHeaders, ["ID_Mov", "ID Mov", "ID_Movimento"]),
    data: findHeaderIndexByAliases_(movHeaders, ["Data"]),
    tipo: findHeaderIndexByAliases_(movHeaders, ["Tipo"]),
    idItem: findHeaderIndexByAliases_(movHeaders, ["ID_Item", "ID Item"]),
    itemOficial: findHeaderIndexByAliases_(movHeaders, ["Item_Oficial", "Item Oficial"]),
    material: findHeaderIndexByAliases_(movHeaders, ["Material"]),
    unidade: findHeaderIndexByAliases_(movHeaders, ["Unidade"]),
    quantidade: findHeaderIndexByAliases_(movHeaders, ["Quantidade"]),
    custoUnit: findHeaderIndexByAliases_(movHeaders, ["Custo_Unit", "Custo Unit"]),
    desconto1: findHeaderIndexByAliases_(movHeaders, ["Desconto 1", "Desconto_1"]),
    desconto2: findHeaderIndexByAliases_(movHeaders, ["Desconto 2", "Desconto_2"]),
    custoSemIva: findHeaderIndexByAliases_(movHeaders, ["Custo_Total Sem IVA", "Custo Total Sem IVA"]),
    iva: findHeaderIndexByAliases_(movHeaders, ["IVA"]),
    custoComIva: findHeaderIndexByAliases_(movHeaders, ["Custo_Total Com IVA", "Custo Total Com IVA"]),
    obra: findHeaderIndexByAliases_(movHeaders, ["Obra"]),
    fase: findHeaderIndexByAliases_(movHeaders, ["Fase"]),
    fornecedor: findHeaderIndexByAliases_(movHeaders, ["Fornecedor"]),
    nif: findHeaderIndexByAliases_(movHeaders, ["NIF"]),
    doc: findHeaderIndexByAliases_(movHeaders, ["Nº Doc/Fatura", "N Doc/Fatura", "Doc Fatura"]),
    observacoes: findHeaderIndexByAliases_(movHeaders, ["Observacoes", "Observação", "Observacao", "Obs"])
  };

  const existingRows = movLastRow >= 2
    ? movSheet.getRange(2, 1, movLastRow - 1, movLastCol).getValues()
    : [];
  const existingMarkers = parseSourceMarkersFromRows_(existingRows, movCols.observacoes);
  const materiaisCatalogById = buildMateriaisCatalogById_(ss.getSheetByName(SHEET_MATERIAIS_CAD));

  const statusValues = itemCols.estado >= 0
    ? itemRows.map(function(row) { return [row[itemCols.estado]]; })
    : null;
  const statusBgValues = itemCols.estado >= 0
    ? itemsSheet.getRange(2, itemCols.estado + 1, itemRows.length, 1).getBackgrounds()
    : null;
  const sugestaoValues = itemCols.sugestao >= 0
    ? itemRows.map(function(row) { return [row[itemCols.sugestao]]; })
    : null;

  const newMovRows = [];
  const updatedMovRows = [];
  let nextMovNum = nextSequentialIdForSheet_(movSheet, ["ID_Mov", "ID Mov", "ID_Movimento"], "MOV");
  let generated = 0;
  let updated = 0;
  let existing = 0;
  let invalid = 0;

  function readCell_(row, idx) {
    return idx >= 0 ? row[idx] : "";
  }

  function setStatus_(rowIndex, status) {
    if (!statusValues) return;
    statusValues[rowIndex][0] = status;
    if (!statusBgValues) return;
    statusBgValues[rowIndex][0] = getStatusBackgroundColor_(status);
  }

  for (let i = 0; i < itemRows.length; i++) {
    const row = itemRows[i];
    const idItemFatura = String(readCell_(row, itemCols.idItemFatura) || "").trim();
    const descricao = String(readCell_(row, itemCols.descricao) || "").trim();
    const idItem = String(readCell_(row, itemCols.idItem) || "").trim();
    const catalogItem = materiaisCatalogById[idItem] || {};
    const itemOficial = String(catalogItem.itemOficial || readCell_(row, itemCols.itemOficial) || "").trim();
    const unidade = String(catalogItem.unidade || readCell_(row, itemCols.unidade) || "").trim();
    const destino = normalizeDestinoValue_(readCell_(row, itemCols.destino));
    const obra = String(readCell_(row, itemCols.obra) || "").trim();
    const fase = String(readCell_(row, itemCols.fase) || "").trim();
    const quantidade = parseNumberLoose_(readCell_(row, itemCols.quantidade));
    const custoUnitLiquido = computeNetUnitCostFromFatItem_(row, itemCols);

    if (sugestaoValues && descricao && !String(sugestaoValues[i][0] || "").trim()) {
      sugestaoValues[i][0] = suggestItemOficialFromDescricao_(descricao);
    }

    if (!rowHasSignalData_(row, [itemCols.idItemFatura, itemCols.descricao, itemCols.quantidade, itemCols.custoUnit])) {
      continue;
    }
    if (!idItemFatura) {
      setStatus_(i, "ID_ITEM_FATURA_EM_FALTA");
      invalid += 1;
      continue;
    }
    if (!descricao) {
      setStatus_(i, "DESCRICAO_EM_FALTA");
      invalid += 1;
      continue;
    }
    if (!idItem || !itemOficial) {
      setStatus_(i, "CADASTRO_EM_FALTA");
      invalid += 1;
      continue;
    }
    if (quantidade <= 0) {
      setStatus_(i, "QUANTIDADE_INVALIDA");
      invalid += 1;
      continue;
    }
    if (destino !== "STOCK" && destino !== "CONSUMO") {
      setStatus_(i, "DESTINO_INVALIDO");
      invalid += 1;
      continue;
    }
    if (destino === "CONSUMO" && !obra) {
      setStatus_(i, "OBRA_EM_FALTA");
      invalid += 1;
      continue;
    }
    if (destino === "CONSUMO" && !fase) {
      setStatus_(i, "FASE_EM_FALTA");
      invalid += 1;
      continue;
    }
    const existingMarker = existingMarkers[idItemFatura];
    const movRow = existingMarker ? existingMarker.row.slice() : new Array(movLastCol).fill("");
    if (movCols.idMov >= 0 && !existingMarker) movRow[movCols.idMov] = formatAutoId_("MOV", nextMovNum++);
    if (movCols.data >= 0) movRow[movCols.data] = readCell_(row, itemCols.data);
    if (movCols.tipo >= 0) movRow[movCols.tipo] = destino === "STOCK" ? "ENTRADA" : "CONSUMO";
    if (movCols.idItem >= 0) movRow[movCols.idItem] = idItem;
    if (movCols.itemOficial >= 0) movRow[movCols.itemOficial] = itemOficial;
    if (movCols.material >= 0) movRow[movCols.material] = itemOficial || descricao;
    if (movCols.unidade >= 0) movRow[movCols.unidade] = unidade;
    if (movCols.quantidade >= 0) movRow[movCols.quantidade] = quantidade;
    if (movCols.custoUnit >= 0) movRow[movCols.custoUnit] = custoUnitLiquido;
    if (movCols.desconto1 >= 0) movRow[movCols.desconto1] = readCell_(row, itemCols.desconto1);
    if (movCols.desconto2 >= 0) movRow[movCols.desconto2] = readCell_(row, itemCols.desconto2);
    if (movCols.custoSemIva >= 0) movRow[movCols.custoSemIva] = readCell_(row, itemCols.custoSemIva);
    if (movCols.iva >= 0) movRow[movCols.iva] = readCell_(row, itemCols.iva);
    if (movCols.custoComIva >= 0) movRow[movCols.custoComIva] = readCell_(row, itemCols.custoComIva);
    if (movCols.obra >= 0) movRow[movCols.obra] = destino === "CONSUMO" ? obra : "";
    if (movCols.fase >= 0) movRow[movCols.fase] = destino === "CONSUMO" ? fase : "";
    if (movCols.fornecedor >= 0) movRow[movCols.fornecedor] = readCell_(row, itemCols.fornecedor);
    if (movCols.nif >= 0) movRow[movCols.nif] = readCell_(row, itemCols.nif);
    if (movCols.doc >= 0) movRow[movCols.doc] = readCell_(row, itemCols.doc);
    if (movCols.observacoes >= 0) {
      movRow[movCols.observacoes] = appendSourceMarkerToObs_(readCell_(row, itemCols.observacoes), idItemFatura);
    }

    if (existingMarker) {
      updatedMovRows.push({
        rowNumber: existingMarker.rowNumber,
        values: movRow
      });
      existingMarkers[idItemFatura].row = movRow.slice();
      setStatus_(i, "MOVIMENTO_ATUALIZADO");
      updated += 1;
    } else {
      newMovRows.push(movRow);
      existingMarkers[idItemFatura] = { rowNumber: movLastRow + newMovRows.length, row: movRow.slice() };
      setStatus_(i, "MOVIMENTO_GERADO");
      generated += 1;
    }
  }

  if (updatedMovRows.length) {
    updatedMovRows.forEach(function(entry) {
      movSheet.getRange(entry.rowNumber, 1, 1, movLastCol).setValues([entry.values]);
    });
  }
  if (newMovRows.length) {
    const startRow = movSheet.getLastRow() + 1;
    movSheet.getRange(startRow, 1, newMovRows.length, movLastCol).setValues(newMovRows);
    if (movCols.tipo >= 0) {
      movSheet.getRange(startRow, movCols.tipo + 1, newMovRows.length, 1).clearDataValidations();
    }
  }
  if (statusValues) {
    itemsSheet.getRange(2, itemCols.estado + 1, statusValues.length, 1).setValues(statusValues);
    itemsSheet.getRange(2, itemCols.estado + 1, statusBgValues.length, 1).setBackgrounds(statusBgValues);
  }
  if (sugestaoValues) {
    itemsSheet.getRange(2, itemCols.sugestao + 1, sugestaoValues.length, 1).setValues(sugestaoValues);
  }

  return {
    generated: generated,
    updated: updated,
    existing: existing,
    invalid: invalid,
    totalRows: itemRows.length
  };
}

function getStatusBackgroundColor_(status) {
  const key = String(status || "").trim().toUpperCase();
  if (!key) return "#ffffff";
  if (key === "ALIAS_EM_FALTA" || key === "CADASTRO_EM_FALTA" || key === "SEMELHANTE_REVER") return "#fff2cc";
  if (key === "MOVIMENTO_GERADO" || key === "MOVIMENTO_ATUALIZADO") return "#d9ead3";
  if (key === "JA_EXISTENTE" || key === "MOVIMENTO_JA_EXISTE" || key === "MOVIMENTO_JA_EXISTIA") return "#d9eaf7";
  if (key === "DUPLICADO_EXATO" || key === "ITEM_ENCONTRADO") return "#d9eaf7";
  if (key === "NOVO_ITEM" || key === "OK") return "#d9ead3";
  return "#f4cccc";
}

function gerarMovimentosMateriaisManual() {
  const result = gerarMovimentosMateriais_();
  SpreadsheetApp.getUi().alert(
    "Movimentos gerados: " + result.generated +
    "\nMovimentos atualizados: " + (result.updated || 0) +
    "\nJa existentes: " + result.existing +
    "\nLinhas invalidas: " + result.invalid
  );
}

// SECTION 3 - LIMPEZA AUTOMATICA DE LINHAS VAZIAS

function onEdit(e) {
  try {
    const sheet = e && e.range ? e.range.getSheet() : null;
    if (sheet && sheet.getName() === SHEET_MATERIAIS_CAD) {
      const startRow = e.range.getRow();
      const endRow = startRow + e.range.getNumRows() - 1;
      const ctx = buildMateriaisCadContext_(sheet);
      for (let rowNum = Math.max(2, startRow); rowNum <= endRow; rowNum++) {
        processMateriaisCadRow_(sheet, rowNum, ctx);
      }
    } else {
      ensureManagedSheetIdsForSheet_(sheet);
    }
    if (sheet && sheet.getName() === SHEET_FATURAS_ITENS) {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const idFaturaCol = findHeaderIndexByAliases_(headers, ["ID_Fatura", "ID Fatura"]);
      const fornecedorCol = findHeaderIndexByAliases_(headers, ["Fornecedor"]);
      const descricaoCol = findHeaderIndexByAliases_(headers, ["Descricao_Original", "Descrição_Original", "Descricao Original"]);
      const destinoCol = findHeaderIndexByAliases_(headers, ["Destino"]);
      const quantidadeCol = findHeaderIndexByAliases_(headers, ["Quantidade"]);
      const obraCol = findHeaderIndexByAliases_(headers, ["Obra"]);
      const faseCol = findHeaderIndexByAliases_(headers, ["Fase"]);
      const editedStart = e.range.getColumn();
      const editedEnd = editedStart + e.range.getNumColumns() - 1;
      const idFaturaTouched = idFaturaCol >= 0 && idFaturaCol + 1 >= editedStart && idFaturaCol + 1 <= editedEnd;
      const fornecedorTouched = fornecedorCol >= 0 && fornecedorCol + 1 >= editedStart && fornecedorCol + 1 <= editedEnd;
      const descricaoTouched = descricaoCol >= 0 && descricaoCol + 1 >= editedStart && descricaoCol + 1 <= editedEnd;
      const movementTouched =
        (destinoCol >= 0 && destinoCol + 1 >= editedStart && destinoCol + 1 <= editedEnd) ||
        (quantidadeCol >= 0 && quantidadeCol + 1 >= editedStart && quantidadeCol + 1 <= editedEnd) ||
        (obraCol >= 0 && obraCol + 1 >= editedStart && obraCol + 1 <= editedEnd) ||
        (faseCol >= 0 && faseCol + 1 >= editedStart && faseCol + 1 <= editedEnd);
      if (idFaturaTouched || fornecedorTouched || descricaoTouched || movementTouched) {
        const startRow = e.range.getRow();
        const endRow = startRow + e.range.getNumRows() - 1;
        for (let rowNum = Math.max(2, startRow); rowNum <= endRow; rowNum++) {
          if (idFaturaTouched) {
            hydrateFaturasItensFromFaturas_(sheet, rowNum);
          }
          hydrateFaturasItensFromCatalog_(sheet, rowNum);
        }
        reconcileGeneratedMateriaisMovRows_();
        gerarMovimentosMateriais_();
      }
    }
    if (sheet && sheet.getName() === SHEET_MATERIAIS_MOV) {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const idItemCol = findHeaderIndexByAliases_(headers, ["ID_Item", "ID Item"]);
      if (idItemCol >= 0) {
        const startCol = e.range.getColumn();
        const endCol = startCol + e.range.getNumColumns() - 1;
        if (idItemCol + 1 >= startCol && idItemCol + 1 <= endCol) {
          const startRow = e.range.getRow();
          const endRow = startRow + e.range.getNumRows() - 1;
          for (let rowNum = Math.max(2, startRow); rowNum <= endRow; rowNum++) {
            hydrateMateriaisMovFromCatalog_(sheet, rowNum);
          }
        }
      }
    }
  } catch (err) {
    Logger.log("Erro na atribuicao automatica de IDs: " + err);
  }
}

function onSheetChange(e) {
  if (e &&
      e.changeType !== "REMOVE_ROW" &&
      e.changeType !== "EDIT" &&
      e.changeType !== "INSERT_ROW") {
    return;
  }
  limparLinhasVazias_();
  corrigirCustosRegistos_();
  processarDispensados_();
  ensureManagedSheetIds_();
  reconcileGeneratedMateriaisMovRows_();

  // Sync para Supabase (migração paralela)
  try {
    syncToSupabase(e);
  } catch (err) {
    Logger.log("Erro na sync Supabase: " + err);
  }
}

/**
 * Remove todas as linhas completamente vazias de REGISTOS_POR_DIA.
 * Percorre de baixo para cima para não deslocar índices ao apagar.
 */
function limparLinhasVazias_(forceRun) {
  if (!ENABLE_EMPTY_ROW_CLEANUP && !forceRun) return;
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_REGISTOS);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return; // Só cabeçalho ou vazio — nada a fazer

  const numRows = lastRow - 1; // excluir cabeçalho (linha 1)
  const values  = sheet.getRange(2, 1, numRows, sheet.getLastColumn()).getValues();

  // Percorrer de baixo para cima — apagar linhas completamente vazias
  for (let i = numRows - 1; i >= 0; i--) {
    const isEmpty = values[i].every(cell => cell === "" || cell === null);
    if (isEmpty) {
      sheet.deleteRow(i + 2); // +2 porque i é 0-based e há cabeçalho na linha 1
    }
  }
}

/**
 * Instala o trigger onChange na spreadsheet.
 * EXECUTAR MANUALMENTE UMA ÚNICA VEZ no editor do Apps Script.
 * Verificar em: Editar > Triggers do projecto actual.
 */
function installOnChangeTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "onSheetChange")
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("onSheetChange")
    .forSpreadsheet(ss)
    .onChange()
    .create();

  Logger.log("✅ Trigger onChange instalado com sucesso.");
}

/**
 * Remove o trigger onChange instalado.
 * Usar apenas se quiseres desactivar a limpeza automática.
 */
function uninstallOnChangeTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "onSheetChange")
    .forEach(t => ScriptApp.deleteTrigger(t));

  Logger.log("Trigger removido.");
}

/**
 * Instala o trigger diário (dias úteis) que grava os trabalhadores não registados.
 * Usa uma cadeia de triggers one-shot para garantir agendamento no próximo dia útil às 23:45.
 */
function installDailyNaoRegistadosTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "executarRegistoNaoRegistadosAgendado_")
    .forEach(t => ScriptApp.deleteTrigger(t));

  agendarProximoNaoRegistados_();
  Logger.log("Trigger de não registados agendado para o próximo dia útil às 23:45.");
}

/**
 * Remove o trigger diário dos não registados.
 */
function uninstallDailyNaoRegistadosTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "executarRegistoNaoRegistadosAgendado_")
    .forEach(t => ScriptApp.deleteTrigger(t));

  Logger.log("Trigger de não registados removido.");
}

/**
 * Handler do trigger agendado. Não executar manualmente.
 */
function executarRegistoNaoRegistadosAgendado_() {
  try {
    registarNaoRegistadosDoDia_();
  } finally {
    agendarProximoNaoRegistados_();
  }
}

/**
 * Agenda a próxima execução para as 23:45 do próximo dia útil.
 */
function agendarProximoNaoRegistados_() {
  const agora = new Date();
  let proximo = new Date(agora);
  proximo.setHours(NREG_HOUR, NREG_MINUTE, 0, 0);

  if (proximo.getTime() <= agora.getTime()) {
    proximo.setDate(proximo.getDate() + 1);
    proximo.setHours(NREG_HOUR, NREG_MINUTE, 0, 0);
  }

  while (ehFimDeSemana_(proximo)) {
    proximo.setDate(proximo.getDate() + 1);
    proximo.setHours(NREG_HOUR, NREG_MINUTE, 0, 0);
  }

  ScriptApp.newTrigger("executarRegistoNaoRegistadosAgendado_")
    .timeBased()
    .at(proximo)
    .create();
}

/**
 * Grava em NAO_REGISTADOS_HIST a fotografia dos colaboradores que ficaram por registar no dia.
 * Guarda DATA_REF, Nome e Funcao. Não corrige retroativamente.
 */
function registarNaoRegistadosDoDia_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(SHEET_NAO_REGISTADOS);
  const colabSheet = ss.getSheetByName(SHEET_COLAB);
  const regSheet = ss.getSheetByName(SHEET_REGISTOS);
  if (!histSheet || !colabSheet || !regSheet) return;

  const agora = new Date();
  if (ehFimDeSemana_(agora)) return;

  const dataRef = Utilities.formatDate(agora, TZ, "yyyy-MM-dd");

  // Evitar duplicados para o mesmo dia caso a função seja disparada mais do que uma vez.
  const histLastRow = histSheet.getLastRow();
  if (histLastRow >= 2) {
    const datasExistentes = histSheet.getRange(2, 1, histLastRow - 1, 1).getValues();
    const jaExiste = datasExistentes.some(r => {
      const raw = r[0];
      const data = raw instanceof Date
        ? Utilities.formatDate(raw, TZ, "yyyy-MM-dd")
        : String(raw || "").trim();
      return data === dataRef;
    });
    if (jaExiste) return;
  }

  const nomesRegistados = new Set();
  const regLastRow = regSheet.getLastRow();
  if (regLastRow >= 2) {
    const regData = regSheet.getRange(2, 2, regLastRow - 1, 2).getValues(); // B=data, C=nome
    regData.forEach(r => {
      const rawData = r[0];
      const data = rawData instanceof Date
        ? Utilities.formatDate(rawData, TZ, "yyyy-MM-dd")
        : String(rawData || "").slice(0, 10);
      const nome = String(r[1] || "").trim();
      if (data === dataRef && nome) nomesRegistados.add(nome);
    });
  }

  const linhas = [];
  const colabLastRow = colabSheet.getLastRow();
  if (colabLastRow >= 1) {
    const colabData = colabSheet.getRange(1, 1, colabLastRow, 2).getValues();
    colabData.forEach(r => {
      const nome = String(r[0] || "").trim();
      const funcao = String(r[1] || "").trim();
      if (!nome || nome === "Nome") return;
      if (!nomesRegistados.has(nome)) linhas.push([dataRef, nome, funcao]);
    });
  }

  if (!linhas.length) return;
  histSheet.getRange(histSheet.getLastRow() + 1, 1, linhas.length, 3).setValues(linhas);
}

function ehFimDeSemana_(dateObj) {
  const dow = parseInt(Utilities.formatDate(dateObj, TZ, "u"), 10); // 1=Seg ... 7=Dom
  return dow === 6 || dow === 7;
}

/**
 * Atalho manual no menu para limpar linhas vazias imediatamente.
 */
function limparLinhasVaziasManual() {
  limparLinhasVazias_(true);
  SpreadsheetApp.getUi().alert("✅ Linhas vazias eliminadas de REGISTOS_POR_DIA.");
}

function gerarIdsEmFaltaManual() {
  const total = ensureManagedSheetIds_();
  SpreadsheetApp.getUi().alert("IDs gerados: " + total);
}

/**
 * Corrige €/h (col K) e Custo_Dia (col L) em REGISTOS_POR_DIA
 * usando as taxas de COLABORADORES. Só escreve se o valor estiver errado.
 * Fórmula: Horas_Efetivas = Horas - (Atraso/60); Custo = Falta ? 0 : Horas_Efetivas * €/h
 */
function corrigirCustosRegistos_() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_REGISTOS);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // Mapa nome→€/h desde COLABORADORES (linha 1+, filtra cabeçalho)
  const colabSheet = ss.getSheetByName(SHEET_COLAB);
  if (!colabSheet) return;
  const rateMap = {};
  colabSheet.getRange(1, 1, colabSheet.getLastRow(), 3).getValues().forEach(r => {
    const n = String(r[0] || "").trim();
    if (n && n !== "Nome") rateMap[n] = parseFloat(r[2]) || 0;
  });

  const numRows = lastRow - 1;
  const data    = sheet.getRange(2, 1, numRows, 12).getValues();
  const updates = []; // [[row, col, value], ...]

  data.forEach((row, i) => {
    const nome      = String(row[2] || "").trim();
    if (!nome || rateMap[nome] === undefined) return;

    const horas     = parseFloat(row[6]) || 0;
    const atrasoMin = parseFloat(row[7]) || 0;
    const falta     = row[8] === true || String(row[8]).toLowerCase() === "true";
    const sheetRate = parseFloat(row[10]) || 0;
    const sheetCost = parseFloat(row[11]) || 0;

    const correctRate = rateMap[nome];
    const horasEfet   = horas - (atrasoMin / 60);
    const correctCost = falta ? 0 : horasEfet * correctRate;

    const sheetRow = i + 2; // +2: cabeçalho + 0-based
    if (Math.abs(sheetRate - correctRate) > 0.001) {
      updates.push([sheetRow, 11, correctRate]);   // col K = 11
    }
    if (Math.abs(sheetCost - correctCost) > 0.01) {
      updates.push([sheetRow, 12, Math.round(correctCost * 100) / 100]); // col L = 12
    }
  });

  // Escrever apenas as células que precisam de correcção
  updates.forEach(u => {
    sheet.getRange(u[0], u[1]).setValue(u[2]);
  });
}

/**
 * Remove da lista activa os colaboradores marcados como dispensados.
 * Marca a coluna P para nÃ£o reprocessar a mesma linha de REGISTOS_POR_DIA.
 */
function processarDispensados_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const regSheet = ss.getSheetByName(SHEET_REGISTOS);
  const colabSheet = ss.getSheetByName(SHEET_COLAB);
  if (!regSheet || !colabSheet) return;

  const regLastRow = regSheet.getLastRow();
  if (regLastRow < 2) return;

  const regNumRows = regLastRow - 1;
  const regValues = regSheet
    .getRange(2, 1, regNumRows, Math.max(regSheet.getLastColumn(), 16))
    .getValues();

  const nomesParaRemover = new Set();
  const linhasProcessadas = [];

  regValues.forEach((row, idx) => {
    const nome = String(row[2] || "").trim();
    if (!nome || nome === "Nome") return;

    const dispensado = row[14] === true || String(row[14]).toLowerCase() === "true";
    if (!dispensado) return;

    const jaProcessado = row[15] instanceof Date || String(row[15] || "").trim() !== "";
    if (jaProcessado) return;

    nomesParaRemover.add(nome);
    linhasProcessadas.push(idx + 2);
  });

  if (!nomesParaRemover.size) return;

  const colabLastRow = colabSheet.getLastRow();
  if (colabLastRow >= 1) {
    const colabValues = colabSheet.getRange(1, 1, colabLastRow, 1).getValues();
    for (let i = colabValues.length - 1; i >= 0; i--) {
      const nome = String(colabValues[i][0] || "").trim();
      if (nome && nome !== "Nome" && nomesParaRemover.has(nome)) {
        colabSheet.deleteRow(i + 1);
      }
    }
  }

  const processedAt = new Date();
  linhasProcessadas.forEach(rowNum => {
    regSheet.getRange(rowNum, 16).setValue(processedAt);
  });
}

/**
 * DIAGNÓSTICO — Executar manualmente no editor do Apps Script.
 * Compara nomes e €/h entre COLABORADORES e REGISTOS_POR_DIA.
 * Resultado: ver em View > Logs (ou Executions).
 */
/**
 * DIAGNOSTICO DE CUSTOS.
 * Compara nomes e tarifas entre COLABORADORES e REGISTOS_POR_DIA.
 */
function debugCustos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Ler COLABORADORES — mostrar todos os nomes e taxas
  const colabSheet = ss.getSheetByName(SHEET_COLAB);
  const colabLast = colabSheet.getLastRow();
  const colabData = colabSheet.getRange(1, 1, colabLast, 3).getValues();
  Logger.log("══ COLABORADORES (raw, todas as linhas) ══");
  colabData.forEach((r, i) => {
    const nome = String(r[0] || "");
    const funcao = String(r[1] || "");
    const eurh = r[2];
    Logger.log("  Linha " + (i+1) + ": Nome=[" + nome + "] len=" + nome.length +
      " | Funcao=[" + funcao + "] | €/h=" + eurh + " (tipo:" + typeof eurh + ")");
  });

  // 2. Ler REGISTOS_POR_DIA — filtrar apenas trabalhadores com €/h != esperado
  const regSheet = ss.getSheetByName(SHEET_REGISTOS);
  const regLast = regSheet.getLastRow();
  if (regLast < 2) { Logger.log("REGISTOS vazio."); return; }

  const regData = regSheet.getRange(2, 1, regLast - 1, 12).getValues();

  // Mapa colaboradores
  const rateMap = {};
  colabData.forEach(r => {
    const nome = String(r[0] || "").trim();
    if (nome && nome !== "Nome") rateMap[nome] = parseFloat(r[2]) || 0;
  });

  Logger.log("\n══ MAPA COLABORADORES (trimmed) ══");
  Object.keys(rateMap).sort().forEach(n => {
    Logger.log("  [" + n + "] → " + rateMap[n] + " €/h");
  });

  Logger.log("\n══ REGISTOS COM PROBLEMAS ══");
  let problemas = 0;
  regData.forEach((row, i) => {
    const nome = String(row[2] || "").trim();  // col C
    if (!nome) return;
    const sheetRate = parseFloat(row[10]) || 0; // col K
    const sheetCost = parseFloat(row[11]) || 0; // col L
    const horas = parseFloat(row[6]) || 0;      // col G
    const expectedRate = rateMap[nome];

    if (expectedRate === undefined) {
      Logger.log("  ❌ Linha " + (i+2) + ": [" + nome + "] NÃO EXISTE em COLABORADORES!");
      problemas++;
    } else if (Math.abs(sheetRate - expectedRate) > 0.001) {
      Logger.log("  ⚠️ Linha " + (i+2) + ": [" + nome + "] sheet €/h=" + sheetRate +
        " mas COLABORADORES=" + expectedRate +
        " | Horas=" + horas + " | Custo sheet=" + sheetCost +
        " vs esperado=" + (horas * expectedRate).toFixed(2));
      problemas++;
    }
  });

  if (problemas === 0) {
    Logger.log("  ✅ Todos os registos têm €/h consistente com COLABORADORES.");
  }
  Logger.log("\nTotal problemas: " + problemas);
}

/**
 * Lê saldo de férias por colaborador.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Array<Object>}
 */
/** Corre automaticamente quando o ficheiro Ã© aberto. Apenas para atalhos de UI. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🏗 Dashboard")
    .addItem("Abrir Dashboard", "abrirDashboard")
    .addItem("Limpar linhas vazias", "limparLinhasVaziasManual")
    .addItem("Gerar IDs em falta", "gerarIdsEmFaltaManual")
    .addItem("Gerar movimentos materiais", "gerarMovimentosMateriaisManual")
    .addToUi();
  SpreadsheetApp.getUi()
    .createMenu("⟳ Sync")
    .addItem("Sincronizar tudo", "syncAll")
    .addItem("Tentar pendentes agora", "syncRetryPendingNow")
    .addItem("Ver estado da sync", "syncShowStatus")
    .addItem("Limpar falhas da sync", "syncClearFailures")
    .addToUi();
}

/** Abre o dashboard numa nova aba do browser */
function abrirDashboard() {
  const url  = ScriptApp.getService().getUrl();
  const html = HtmlService.createHtmlOutput(
    "<script>window.open('" + url + "','_blank');google.script.host.close();</script>"
  ).setWidth(10).setHeight(10);
  SpreadsheetApp.getUi().showModalDialog(html, "A abrir dashboard...");
}

/** Devolve o número da semana ISO no formato "YYYY-SWW" */
// ============================================================
//  SECÇÃO 4 — SYNC PARA SUPABASE (adicionar ao final do main.gs)
//  NÃO remover nenhum código existente!
// ============================================================
// ── Configuração Sync ───────────────────────────────────────
// ── Mapeamento: nome da aba → endpoint + campos ─────────────
// ── Sync: Trigger automático ────────────────────────────────
// ── Sync: Manual de todas as abas ───────────────────────────
// ── Sync: Helpers (prefixo sync para não conflitar) ─────────
