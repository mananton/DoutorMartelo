// ============================================================

// READERS E HELPERS DE LEITURA

// ============================================================



function normalizeHeader_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, " ");
}

function getColMap_(sheet, headerRow) {
  if (!sheet) return {};
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return {};
  const headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const map = {};
  for (let i = 0; i < headers.length; i++) {
    const key = normalizeHeader_(headers[i]);
    if (key) map[key] = i;
  }
  return map;
}

function pickCol_(colMap, aliases, fallbackIndex) {
  for (let i = 0; i < aliases.length; i++) {
    const key = normalizeHeader_(aliases[i]);
    if (Object.prototype.hasOwnProperty.call(colMap, key)) return colMap[key];
  }
  return fallbackIndex;
}

function formatDateValue_(rawValue, withTime) {
  if (rawValue instanceof Date) {
    return Utilities.formatDate(
      rawValue,
      TZ,
      withTime ? "yyyy-MM-dd HH:mm:ss" : "yyyy-MM-dd"
    );
  }

  const text = String(rawValue || "").trim();
  if (!text) return "";
  if (withTime) return text;

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

  const ptDate = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (ptDate) {
    const d = String(ptDate[1]).padStart(2, "0");
    const m = String(ptDate[2]).padStart(2, "0");
    const y = ptDate[3];
    return y + "-" + m + "-" + d;
  }

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, TZ, "yyyy-MM-dd");
  }

  return text.slice(0, 10);
}

function toBool_(value) {
  return value === true || String(value).trim().toLowerCase() === "true";
}


function hasValue_(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function isNumericLike_(value) {
  if (typeof value === "number") return !isNaN(value);
  const text = String(value || "").trim();
  if (!text) return false;
  const normalized = text
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  return /^-?\d+(?:\.\d+)?$/.test(normalized);
}

function createDataQualityDiagnostics_() {
  return {
    total_issues: 0,
    summary: {},
    samples: []
  };
}

function pushDataQualityIssue_(diagnostics, code, detail) {
  if (!diagnostics || !code) return;
  diagnostics.total_issues += 1;
  diagnostics.summary[code] = (diagnostics.summary[code] || 0) + 1;
  if (diagnostics.samples.length >= 25) return;
  diagnostics.samples.push(Object.assign({ code: code }, detail || {}));
}

function isIsoDateKey_(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function pickRegistoDate_(row, cols) {
  const fromReg = formatDateValue_(row[cols.dataRegisto], false);
  if (isIsoDateKey_(fromReg)) return fromReg;

  const fromArquivo = formatDateValue_(row[cols.dataArquivo], false);
  if (isIsoDateKey_(fromArquivo)) return fromArquivo;

  return fromReg || fromArquivo || "";
}

function buildColabRateMap_(colabSheet) {
  const map = {};
  if (!colabSheet) return map;

  const colMap = getColMap_(colabSheet, 2);
  const cNome = pickCol_(colMap, ["Nome"], 0);
  const cRate = pickCol_(colMap, ["€/h", "Eur_h", "Eur h"], 2);
  const lastRow = colabSheet.getLastRow();
  const lastCol = Math.max(colabSheet.getLastColumn(), cRate + 1, cNome + 1);
  if (lastRow < 2) return map;

  const data = colabSheet.getRange(1, 1, lastRow, lastCol).getValues();
  for (let i = 0; i < data.length; i++) {
    const nome = String(data[i][cNome] || "").trim();
    if (!nome || nome === "Nome") continue;
    map[nome] = parseFloat(data[i][cRate]) || 0;
  }
  return map;
}

function readRegistos_(sheet, colabRateMap, diagnostics) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const cols = getRegistosCols_(getColMap_(sheet, 1));
  const numCols = Math.max(sheet.getLastColumn(), 16);
  const rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  const out = [];

  for (let i = 0; i < rows.length; i++) {
    const mapped = mapRegistoRow_(rows[i], cols, colabRateMap, diagnostics, i + 2);
    if (mapped) out.push(mapped);
  }
  return out;
}

function readLegacyMaoObra_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const colMap = getColMap_(sheet, 1);
  const cols = {
    data: pickCol_(colMap, ["Data"], 0),
    obra: pickCol_(colMap, ["Obra"], 1),
    fase: pickCol_(colMap, ["Fase de Obra", "Fase"], 2),
    horas: pickCol_(colMap, ["Horas"], 3),
    custoDia: pickCol_(colMap, ["Custo Dia", "Custo_Dia", "Custo Dia (EUR)", "Custo Dia (?)"], 4),
    origem: pickCol_(colMap, ["Origem"], -1),
    nota: pickCol_(colMap, ["Nota", "Observacao", "Observação"], -1)
  };
  const numCols = Math.max(sheet.getLastColumn(), 5);
  const rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  const out = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const obra = String(row[cols.obra] || "").trim();
    if (!obra) continue;

    out.push({
      data: formatDateValue_(row[cols.data], false),
      obra: obra,
      fase: String(row[cols.fase] || "").trim() || "Sem Fase",
      horas: parseFloat(row[cols.horas]) || 0,
      custo: parseFloat(row[cols.custoDia]) || 0,
      origem: cols.origem >= 0 ? String(row[cols.origem] || "").trim() : "legacy",
      nota: cols.nota >= 0 ? String(row[cols.nota] || "").trim() : ""
    });
  }

  return out;
}

function readLegacyMateriais_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const colMap = getColMap_(sheet, 1);
  const cols = {
    data: pickCol_(colMap, ["Data"], 0),
    obra: pickCol_(colMap, ["Obra"], 1),
    fase: pickCol_(colMap, ["Fase de Obra", "Fase"], 2),
    material: pickCol_(colMap, ["Material"], 3),
    quantidade: pickCol_(colMap, ["Quantidade"], 4),
    custoUnit: pickCol_(colMap, ["Custo_Unit", "Custo Unit", "Custo Unitario", "Custo Unitário"], 5),
    custoSemIva: pickCol_(colMap, ["Custo_Total Sem IVA", "Custo Total Sem IVA", "Custo_Total_Sem_IVA"], 6),
    iva: pickCol_(colMap, ["IVA"], 7),
    custoComIva: pickCol_(colMap, ["Custo_Total Com IVA", "Custo Total Com IVA", "Custo_Total_Com_IVA"], 8)
  };
  const numCols = Math.max(sheet.getLastColumn(), 9);
  const rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  const out = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const obra = String(row[cols.obra] || "").trim();
    const material = String(row[cols.material] || "").trim();
    if (!obra || !material) continue;

    const custoComIva = parseFloat(row[cols.custoComIva]) || 0;
    const custoSemIva = parseFloat(row[cols.custoSemIva]) || 0;
    const custo = custoComIva || custoSemIva || 0;
    const quantidade = parseFloat(row[cols.quantidade]) || 0;

    out.push({
      data: formatDateValue_(row[cols.data], false),
      obra: obra,
      fase: String(row[cols.fase] || "").trim() || "Sem Fase",
      material: material,
      unidade: "",
      quantidade: quantidade,
      custo_unit: parseFloat(row[cols.custoUnit]) || 0,
      custo_total_sem_iva: custoSemIva,
      iva: parseFloat(row[cols.iva]) || 0,
      custo_total_com_iva: custoComIva || custo,
      custo_total: custo,
      source: "legacy_materiais",

      // aliases usados pela agregacao atual
      qtd: quantidade,
      custo: custo
    });
  }

  return out;
}

function getRegistosCols_(colMap) {
  return {
    dataArquivo: pickCol_(colMap, ["DATA_ARQUIVO", "Data Arquivo"], 0),
    dataRegisto: pickCol_(colMap, ["DATA_REGISTO", "Data Registo", "Data"], 1),
    nome: pickCol_(colMap, ["Nome"], 2),
    funcao: pickCol_(colMap, ["Fun??o", "Funcao"], 3),
    obra: pickCol_(colMap, ["Obra"], 4),
    fase: pickCol_(colMap, ["Fase de Obra", "Fase"], 5),
    horas: pickCol_(colMap, ["Horas"], 6),
    atraso: pickCol_(colMap, ["Atraso_Minutos", "Atraso Minutos"], 7),
    falta: pickCol_(colMap, ["Falta"], 8),
    motivo: pickCol_(colMap, ["Motivo Falta", "Motivo"], 9),
    eurh: pickCol_(colMap, ["?/h", "Eur_h", "Eur h"], 10),
    custoDia: pickCol_(colMap, ["Custo Dia (?)", "Custo Dia", "Custo_Dia", "Custo Dia (EUR)"], 11),
    observacao: pickCol_(colMap, ["Observa??o", "Observacao"], 12),
    dispensado: pickCol_(colMap, ["Dispensado"], 14),
    dispensaProc: pickCol_(colMap, ["Dispensa_Processada_Em", "Dispensa Processada Em"], 15)
  };
}

function mapRegistoRow_(row, cols, colabRateMap, diagnostics, rowNumber) {
  const nome = String(row[cols.nome] || "").trim();
  const obra = String(row[cols.obra] || "").trim();
  const data = pickRegistoDate_(row, cols);
  const rawHoras = row[cols.horas];
  const rawCustoDia = row[cols.custoDia];

  if (!obra) {
    pushDataQualityIssue_(diagnostics, "registos_missing_obra", {
      sheet: SHEET_REGISTOS,
      row: rowNumber,
      nome: nome,
      data_registo_raw: formatDateValue_(row[cols.dataRegisto], false),
      data_arquivo_raw: formatDateValue_(row[cols.dataArquivo], false)
    });
    return null;
  }

  if (!isIsoDateKey_(data)) {
    pushDataQualityIssue_(diagnostics, "registos_invalid_date", {
      sheet: SHEET_REGISTOS,
      row: rowNumber,
      nome: nome,
      obra: obra,
      resolved_date: data,
      data_registo_raw: formatDateValue_(row[cols.dataRegisto], false),
      data_arquivo_raw: formatDateValue_(row[cols.dataArquivo], false)
    });
  }

  if (hasValue_(rawHoras) && !isNumericLike_(rawHoras)) {
    pushDataQualityIssue_(diagnostics, "registos_invalid_horas", {
      sheet: SHEET_REGISTOS,
      row: rowNumber,
      nome: nome,
      obra: obra,
      raw_value: String(rawHoras)
    });
  }

  if (hasValue_(rawCustoDia) && !isNumericLike_(rawCustoDia)) {
    pushDataQualityIssue_(diagnostics, "registos_invalid_custo_dia", {
      sheet: SHEET_REGISTOS,
      row: rowNumber,
      nome: nome,
      obra: obra,
      raw_value: String(rawCustoDia)
    });
  }

  const horas = parseFloat(row[cols.horas]) || 0;
  const atrasoMin = parseFloat(row[cols.atraso]) || 0;
  const falta = toBool_(row[cols.falta]);
  const hasCustoDia = hasValue_(rawCustoDia);
  const custoDia = parseFloat(rawCustoDia) || 0;
  const rate = (colabRateMap && colabRateMap[nome] !== undefined)
    ? colabRateMap[nome]
    : (parseFloat(row[cols.eurh]) || 0);

  const horasEfetivas = horas - (atrasoMin / 60);
  const custoFormula = falta ? 0 : horasEfetivas * rate;
  const custoFinal = hasCustoDia ? custoDia : custoFormula;

  return {
    data: data,
    nome: nome,
    funcao: String(row[cols.funcao] || "").trim() || "-",
    obra: obra,
    fase: String(row[cols.fase] || "").trim() || "Sem Fase",
    horas: horas,
    atraso_min: atrasoMin,
    falta: falta,
    motivo: String(row[cols.motivo] || "").trim(),
    observacao: String(row[cols.observacao] || "").trim(),
    dispensado: toBool_(row[cols.dispensado]),
    dispensa_processada_em: formatDateValue_(row[cols.dispensaProc], true),
    eur_h: rate,
    custo: custoFinal
  };
}

function readObras_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];

  const colMap = getColMap_(sheet, 2);
  const cObra = pickCol_(colMap, ["Obra_ID", "Obra"], 0);
  const cLocal = pickCol_(colMap, ["Local_ID", "Local"], 1);
  const cAtiva = pickCol_(colMap, ["Ativa", "Activo", "Ativo"], 2);
  const width = Math.max(sheet.getLastColumn(), cAtiva + 1, cLocal + 1, cObra + 1);
  const rows = sheet.getRange(3, 1, lastRow - 2, width).getValues();

  return rows
    .filter(r => String(r[cObra] || "").trim() && String(r[cObra] || "").trim() !== "Obra_ID")
    .map(r => ({
      Obra_ID: String(r[cObra] || "").trim(),
      Local_ID: String(r[cLocal] || "").trim(),
      Ativa: String(r[cAtiva] || "").trim()
    }));
}

function readColabs_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];

  const colMap = getColMap_(sheet, 2);
  const cNome = pickCol_(colMap, ["Nome"], 0);
  const cFuncao = pickCol_(colMap, ["Função", "Funcao"], 1);
  const cRate = pickCol_(colMap, ["€/h", "Eur_h", "Eur h"], 2);
  const width = Math.max(sheet.getLastColumn(), cRate + 1, cFuncao + 1, cNome + 1);
  const rows = sheet.getRange(3, 1, lastRow - 2, width).getValues();

  return rows
    .filter(r => String(r[cNome] || "").trim() && String(r[cNome] || "").trim() !== "Nome")
    .map(r => ({
      Nome: String(r[cNome] || "").trim(),
      Funcao: String(r[cFuncao] || "").trim(),
      Eur_h: parseFloat(r[cRate]) || 0
    }));
}

function readViagens_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];

  const colMap = getColMap_(sheet, 2);
  const cData = pickCol_(colMap, ["Data"], 0);
  const cDiaSem = pickCol_(colMap, ["DiaSem", "Dia da Semana"], 1);
  const cPadrao = pickCol_(colMap, ["V_Padrao", "V Padrão"], 2);
  const cReal = pickCol_(colMap, ["V_Real", "V Real"], 3);
  const cEfet = pickCol_(colMap, ["V_Efetivas", "V Efetivas"], 4);
  const cViatura = pickCol_(colMap, ["Viatura"], 5);
  const cObra = pickCol_(colMap, ["Obra"], 6);
  const cCustoVia = pickCol_(colMap, ["Custo_Via", "Custo Via"], 7);
  const cCustoDia = pickCol_(colMap, ["Custo_Dia", "Custo Dia"], 8);
  const width = Math.max(sheet.getLastColumn(), cCustoDia + 1);
  const rows = sheet.getRange(3, 1, lastRow - 2, width).getValues();

  return rows
    .filter(r => String(r[cData] || "").trim() && String(r[cData] || "").trim() !== "Data")
    .map(r => ({
      Data_str: formatDateValue_(r[cData], false),
      DiaSem: parseInt(r[cDiaSem], 10) || 0,
      V_Padrao: parseFloat(r[cPadrao]) || 0,
      V_Real: r[cReal] !== "" ? parseFloat(r[cReal]) : null,
      V_Efetivas: parseFloat(r[cEfet]) || 0,
      Viatura: String(r[cViatura] || "").trim(),
      Obra: String(r[cObra] || "").trim() || null,
      Custo_Via: parseFloat(r[cCustoVia]) || 0,
      custo_dia: parseFloat(r[cCustoDia]) || 0,
      v_efetivas: parseFloat(r[cEfet]) || 0
    }));
}

function readDeslocacoes_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const colMap = getColMap_(sheet, 1);
  const cData = pickCol_(colMap, ["Data"], 1);
  const cDestino = pickCol_(colMap, ["Destino", "Obra_Destino", "Obra Destino"], 3);
  const cObraLegacy = pickCol_(colMap, ["Obra_Destino", "Obra Destino"], 2);
  const cVeiculo = pickCol_(colMap, ["Veiculo", "Viatura"], 4);
  const cMotorista = pickCol_(colMap, ["Motorista"], 5);
  const cOrigem = pickCol_(colMap, ["Origem"], 6);
  const cQtd = pickCol_(colMap, ["Quantidade_Viagens", "Quantidade Viagens", "Qtd"], 7);
  const cCusto = pickCol_(colMap, ["Custo_Total", "Custo Total"], 8);
  const width = Math.max(sheet.getLastColumn(), cCusto + 1, cQtd + 1);
  const rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  const out = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const obra = String(row[cDestino] || row[cObraLegacy] || "").trim();
    if (!obra || obra === "Obra_Destino" || obra === "Destino") continue;
    out.push({
      data: formatDateValue_(row[cData], false),
      obra: obra,
      veiculo: String(row[cVeiculo] || "").trim(),
      motorista: String(row[cMotorista] || "").trim(),
      origem: String(row[cOrigem] || "").trim(),
      qtd: parseFloat(row[cQtd]) || 0,
      custo: parseFloat(row[cCusto]) || 0
    });
  }
  return out;
}

function readMateriaisMov_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h || "").trim());
  const lower = header.map(h => h.toLowerCase());

  function findCol_(variants) {
    for (let i = 0; i < variants.length; i++) {
      const v = String(variants[i]).toLowerCase();
      let idx = lower.indexOf(v);
      if (idx >= 0) return idx;
    }
    for (let i = 0; i < variants.length; i++) {
      const v = String(variants[i]).toLowerCase();
      let idx = lower.findIndex(h => h.includes(v));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  const cId        = findCol_(["id_mov", "id_movimento", "id"]);
  const cData      = findCol_(["data"]);
  const cTipo      = findCol_(["tipo"]);
  const cObra      = findCol_(["obra"]);
  const cFase      = findCol_(["fase"]);
  const cMaterial  = findCol_(["material"]);
  const cUnidade   = findCol_(["unidade"]);
  const cQtd       = findCol_(["quantidade"]);
  const cCustoTotComIva = findCol_([
    "custo_total com iva",
    "custo_total_com_iva",
    "custo total com iva",
    "custo com iva"
  ]);
  const cCustoTotSemIva = findCol_([
    "custo_total sem iva",
    "custo_total_sem_iva",
    "custo total sem iva",
    "custo sem iva"
  ]);
  const cCustoTotLegacy = findCol_(["custo_total", "custo total"]);
  const cCustoUnit = findCol_(["custo_unit", "custo unit"]);
  const cDesc1     = findCol_(["desconto 1", "desconto_1", "desconto1"]);
  const cDesc2     = findCol_(["desconto 2", "desconto_2", "desconto2"]);
  const cIva       = findCol_(["iva"]);
  const cFornecedor = findCol_(["fornecedor"]);
  const cNif        = findCol_(["nif"]);
  const cEntrega    = findCol_(["entrega?", "entrega ?", "entrega"]);
  const cDocFatura = findCol_(["nº doc/fatura", "n doc/fatura", "doc_fatura", "doc/fatura"]);
  const cLote      = findCol_(["lote"]);
  const cObs       = findCol_(["observação", "observacao", "obs"]);

  function num_(v) {
    if (typeof v === "number") return v;
    const s = String(v || "").replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const out = [];

  rows.forEach((r, i) => {
    const tipo = cTipo >= 0 ? String(r[cTipo] || "").trim().toUpperCase() : "";
    if (!tipo) return;

    const rawD = cData >= 0 ? r[cData] : null;
    const dateStr = rawD instanceof Date
      ? Utilities.formatDate(rawD, TZ, "yyyy-MM-dd")
      : String(rawD || "").slice(0, 10);

    // Data é obrigatória (senão o filtro "Hoje" fica errado)
    if (!dateStr) return;

    const material = cMaterial >= 0 ? String(r[cMaterial] || "").trim() : "";
    if (!material) return;

    const id = (cId >= 0 && r[cId]) ? String(r[cId]).trim() : ("MOV-" + (i + 2));

    const qtd = cQtd >= 0 ? num_(r[cQtd]) : 0;
    const custoUnit = cCustoUnit >= 0 ? num_(r[cCustoUnit]) : 0;
    const custoTotComIva = cCustoTotComIva >= 0 ? num_(r[cCustoTotComIva]) : 0;
    const custoTotSemIva = cCustoTotSemIva >= 0 ? num_(r[cCustoTotSemIva]) : 0;
    let custoTot = 0;
    if (cCustoTotComIva >= 0) custoTot = custoTotComIva;
    else if (cCustoTotLegacy >= 0) custoTot = num_(r[cCustoTotLegacy]);
    else if (cCustoTotSemIva >= 0) custoTot = custoTotSemIva;
    else custoTot = qtd * custoUnit;

    out.push({
      id_mov: id,
      data: dateStr,
      tipo,
      obra: cObra >= 0 ? String(r[cObra] || "").trim() : "",
      fase: cFase >= 0 ? String(r[cFase] || "").trim() : "",
      material,
      unidade: cUnidade >= 0 ? String(r[cUnidade] || "").trim() : "",
      quantidade: qtd,
      custo_unit: custoUnit,
      custo_total: custoTot,
      custo_total_com_iva: cCustoTotComIva >= 0 ? custoTotComIva : custoTot,
      custo_total_sem_iva: cCustoTotSemIva >= 0 ? custoTotSemIva : 0,
      iva: cIva >= 0 ? num_(r[cIva]) : 0,
      desconto_1: cDesc1 >= 0 ? num_(r[cDesc1]) : 0,
      desconto_2: cDesc2 >= 0 ? num_(r[cDesc2]) : 0,
      fornecedor: cFornecedor >= 0 ? String(r[cFornecedor] || "").trim() : "",
      nif: cNif >= 0 ? String(r[cNif] || "").trim() : "",
      entrega: cEntrega >= 0 ? String(r[cEntrega] || "").trim() : "",
      doc_fatura: cDocFatura >= 0 ? String(r[cDocFatura] || "").trim() : "",
      lote:       cLote >= 0 ? String(r[cLote] || "").trim() : "",
      observacao: cObs >= 0 ? String(r[cObs] || "").trim() : "",

      // aliases para agregação (matPorObra usa m.custo / m.qtd)
      id: id,
      qtd: qtd,
      custo: custoTot
    });
  });

  return out;
}

function readMateriaisMovDashboard_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  const colMap = getColMap_(sheet, 1);
  const cId = pickCol_(colMap, ["ID_Mov", "ID_Movimento", "ID"], -1);
  const cData = pickCol_(colMap, ["Data"], -1);
  const cTipo = pickCol_(colMap, ["Tipo"], -1);
  const cObra = pickCol_(colMap, ["Obra"], -1);
  const cFase = pickCol_(colMap, ["Fase"], -1);
  const cMaterial = pickCol_(colMap, ["Material", "Item_Oficial", "Item Oficial", "Descricao_Original", "Descricao Original"], -1);
  const cIdItem = pickCol_(colMap, ["ID_Item", "Id_Item"], -1);
  const cUnidade = pickCol_(colMap, ["Unidade", "Unidade_Material", "Unidade Material"], -1);
  const cQtd = pickCol_(colMap, ["Quantidade"], -1);
  const cCustoTotComIva = pickCol_(colMap, ["Custo_Total Com IVA", "Custo Total Com IVA", "Custo_Com_IVA", "Custo Com IVA"], -1);
  const cCustoTotSemIva = pickCol_(colMap, ["Custo_Total Sem IVA", "Custo Total Sem IVA", "Custo_Sem_IVA", "Custo Sem IVA"], -1);
  const cCustoTotLegacy = pickCol_(colMap, ["Custo_Total", "Custo Total"], -1);
  const cCustoUnit = pickCol_(colMap, ["Custo_Unit", "Custo Unit", "Custo Unitario", "Custo Unitário"], -1);
  const cDesc1 = pickCol_(colMap, ["Desconto 1", "Desconto_1", "Desconto1"], -1);
  const cDesc2 = pickCol_(colMap, ["Desconto 2", "Desconto_2", "Desconto2"], -1);
  const cIva = pickCol_(colMap, ["IVA"], -1);
  const cFornecedor = pickCol_(colMap, ["Fornecedor"], -1);
  const cNif = pickCol_(colMap, ["NIF"], -1);
  const cEntrega = pickCol_(colMap, ["Entrega?", "Entrega"], -1);
  const cDocFatura = pickCol_(colMap, ["Nº Doc/Fatura", "N Doc/Fatura", "Doc_Fatura", "Doc/Fatura"], -1);
  const cLote = pickCol_(colMap, ["Lote"], -1);
  const cObs = pickCol_(colMap, ["Observação", "Observacoes", "Observacao", "Obs"], -1);

  function num_(v) {
    if (typeof v === "number") return v;
    const s = String(v || "")
      .replace(/\s/g, "")
      .replace(/€/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const out = [];

  rows.forEach(function(r, i) {
    const tipo = cTipo >= 0 ? String(r[cTipo] || "").trim().toUpperCase() : "";
    if (!tipo) return;

    const dateStr = formatDateValue_(cData >= 0 ? r[cData] : null, false);
    if (!dateStr) return;

    const obra = cObra >= 0 ? String(r[cObra] || "").trim() : "";
    const normalizedObra = normalizeHeader_(obra);
    const dashboardConsumo = tipo === "CONSUMO" && !!obra && obra !== "-" && normalizedObra !== "escritorio";
    const id = (cId >= 0 && r[cId]) ? String(r[cId]).trim() : ("MOV-" + (i + 2));
    const idItem = cIdItem >= 0 ? String(r[cIdItem] || "").trim() : "";
    const material = cMaterial >= 0 ? String(r[cMaterial] || "").trim() : "";
    const qtd = cQtd >= 0 ? num_(r[cQtd]) : 0;
    const custoUnit = cCustoUnit >= 0 ? num_(r[cCustoUnit]) : 0;
    const custoTotComIva = cCustoTotComIva >= 0 ? num_(r[cCustoTotComIva]) : 0;
    const custoTotSemIva = cCustoTotSemIva >= 0 ? num_(r[cCustoTotSemIva]) : 0;

    let custoTot = 0;
    if (cCustoTotComIva >= 0) custoTot = custoTotComIva;
    else if (cCustoTotLegacy >= 0) custoTot = num_(r[cCustoTotLegacy]);
    else if (cCustoTotSemIva >= 0) custoTot = custoTotSemIva;
    else custoTot = qtd * custoUnit;

    out.push({
      id_mov: id,
      id: id,
      data: dateStr,
      tipo: tipo,
      obra: obra,
      fase: cFase >= 0 ? String(r[cFase] || "").trim() : "",
      id_item: idItem,
      material: material || idItem || "\u2014",
      unidade: cUnidade >= 0 ? String(r[cUnidade] || "").trim() : "",
      quantidade: qtd,
      qtd: qtd,
      custo_unit: custoUnit,
      custo_total: custoTot,
      custo_total_com_iva: cCustoTotComIva >= 0 ? custoTotComIva : custoTot,
      custo_total_sem_iva: cCustoTotSemIva >= 0 ? custoTotSemIva : 0,
      custo: custoTot,
      iva: cIva >= 0 ? num_(r[cIva]) : 0,
      desconto_1: cDesc1 >= 0 ? num_(r[cDesc1]) : 0,
      desconto_2: cDesc2 >= 0 ? num_(r[cDesc2]) : 0,
      fornecedor: cFornecedor >= 0 ? String(r[cFornecedor] || "").trim() : "",
      nif: cNif >= 0 ? String(r[cNif] || "").trim() : "",
      entrega: cEntrega >= 0 ? String(r[cEntrega] || "").trim() : "",
      doc_fatura: cDocFatura >= 0 ? String(r[cDocFatura] || "").trim() : "",
      lote: cLote >= 0 ? String(r[cLote] || "").trim() : "",
      observacao: cObs >= 0 ? String(r[cObs] || "").trim() : "",
      dashboard_consumo: dashboardConsumo,
      source: "materiais_mov"
    });
  });

  return out;
}

function readFerias_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const colMap = getColMap_(sheet, 1);
  const cNome = pickCol_(colMap, ["Nome"], 0);
  const cAdm = pickCol_(colMap, ["Data_Admissao", "Data Admissao", "Data Admissão"], 1);
  const cTotal = pickCol_(colMap, ["Dias_Total", "Dias Total"], 2);
  const cRefIni = pickCol_(colMap, ["Ano_Ref_Inicio", "Ano Ref Inicio", "Ano Ref Início"], 3);
  const cRefFim = pickCol_(colMap, ["Ano_Ref_Fim", "Ano Ref Fim"], 4);
  const cUsados = pickCol_(colMap, ["Dias_Usados", "Dias Usados"], 5);
  const cDisponiveis = pickCol_(colMap, ["Dias_Disponiveis", "Dias Disponíveis", "Dias Disponiveis"], 6);
  const width = Math.max(sheet.getLastColumn(), cDisponiveis + 1);
  const rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  const out = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nome = String(row[cNome] || "").trim();
    if (!nome) continue;

    out.push({
      nome: nome,
      data_admissao: formatDateValue_(row[cAdm], false),
      dias_total: parseInt(row[cTotal], 10) || 0,
      ano_ref_inicio: formatDateValue_(row[cRefIni], false),
      ano_ref_fim: formatDateValue_(row[cRefFim], false),
      dias_usados: parseInt(row[cUsados], 10) || 0,
      dias_disponiveis: parseInt(row[cDisponiveis], 10) || 0
    });
  }

  return out;
}

function readPessoalEfetivo_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  const hRow = typeof findHeaderRowLocation_ !== 'undefined' ? findHeaderRowLocation_(sheet, ["Nome", "Nacionalidade"]) : 1;
  if (lastRow <= hRow) return [];

  const colMap = getColMap_(sheet, hRow);
  const cNome = pickCol_(colMap, ["Nome"], -1);
  const cNacionalidade = pickCol_(colMap, ["Nacionalidade"], -1);
  const cDataNasc = pickCol_(colMap, ["Data Nascimento", "Data_Nascimento"], -1);
  const cMorada = pickCol_(colMap, ["Morada"], -1);
  const cTelefone = pickCol_(colMap, ["Telefone"], -1);
  const cEmail = pickCol_(colMap, ["email", "Email"], -1);
  const cFotoUrl = pickCol_(colMap, ["Foto_URL", "Foto URL", "Foto"], -1);
  const cInicioContrato = pickCol_(colMap, ["Dta Inicio Contrato", "Data Inicio Contrato"], -1);
  const cTerminoContrato = pickCol_(colMap, ["Data Termino Contrato", "Dta Termino Contrato"], -1);
  const cConducao = pickCol_(colMap, ["Carta Condução", "Carta Conducao"], -1);
  const cCatCarta = pickCol_(colMap, ["Categorias", "Categorias Carta"], -1);
  const cCam = pickCol_(colMap, ["CAM"], -1);
  const cNumCarta = pickCol_(colMap, ["Nº Carta", "N Carta", "Numero Carta"], -1);
  const cCC = pickCol_(colMap, ["Cartão de Cidadão", "Cartao de Cidadao"], -1);
  const cResidencia = pickCol_(colMap, ["Cartão Residencia", "Cartao Residencia"], -1);
  const cPassaporte = pickCol_(colMap, ["Passaporte"], -1);
  const cVisto = pickCol_(colMap, ["Visto"], -1);
  const cCertificacoes = pickCol_(colMap, ["Certificações", "Certificacoes"], -1);
  const cOcorrencias = pickCol_(colMap, ["Ocorrências", "Ocorrencias"], -1);

  if (cNome < 0) return [];
  
  const rows = sheet.getRange(hRow + 1, 1, lastRow - hRow, lastCol).getValues();
  const out = [];
  
  rows.forEach(function(r) {
    const nome = String(r[cNome] || "").trim();
    if (!nome) return;
    
    out.push({
      nome: nome,
      nacionalidade: cNacionalidade >= 0 ? String(r[cNacionalidade] || "").trim() : "",
      data_nascimento: formatDateValue_(cDataNasc >= 0 ? r[cDataNasc] : null, false),
      morada: cMorada >= 0 ? String(r[cMorada] || "").trim() : "",
      telefone: cTelefone >= 0 ? String(r[cTelefone] || "").trim() : "",
      email: cEmail >= 0 ? String(r[cEmail] || "").trim() : "",
      foto_url: cFotoUrl >= 0 ? String(r[cFotoUrl] || "").trim() : "",
      data_inicio_contrato: formatDateValue_(cInicioContrato >= 0 ? r[cInicioContrato] : null, false),
      data_termino_contrato: formatDateValue_(cTerminoContrato >= 0 ? r[cTerminoContrato] : null, false),
      carta_conducao: cConducao >= 0 ? String(r[cConducao] || "").trim() : "",
      categorias_carta: cCatCarta >= 0 ? String(r[cCatCarta] || "").trim() : "",
      cam: cCam >= 0 ? String(r[cCam] || "").trim() : "",
      numero_carta: cNumCarta >= 0 ? String(r[cNumCarta] || "").trim() : "",
      cartao_cidadao: cCC >= 0 ? String(r[cCC] || "").trim() : "",
      cartao_residencia: cResidencia >= 0 ? String(r[cResidencia] || "").trim() : "",
      passaporte: cPassaporte >= 0 ? String(r[cPassaporte] || "").trim() : "",
      visto: cVisto >= 0 ? String(r[cVisto] || "").trim() : "",
      certificacoes: cCertificacoes >= 0 ? String(r[cCertificacoes] || "").trim() : "",
      ocorrencias: cOcorrencias >= 0 ? String(r[cOcorrencias] || "").trim() : ""
    });
  });

  return out;
}

// ── FATURAS ──────────────────────────────────────────────
function readFaturas_(sheet) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  var colMap = getColMap_(sheet, 1);
  var cId = pickCol_(colMap, ["ID_Fatura", "Id_Fatura"], -1);
  var cFornecedor = pickCol_(colMap, ["Fornecedor"], -1);
  var cNif = pickCol_(colMap, ["NIF"], -1);
  var cNrDoc = pickCol_(colMap, ["Nº Doc/Fatura", "Nr_Documento", "Nr Documento", "N Doc/Fatura", "Doc_Fatura"], -1);
  var cData = pickCol_(colMap, ["Data Fatura", "Data_Fatura"], -1);
  var cValSemIva = pickCol_(colMap, ["Valor Sem IVA", "Valor_Sem_IVA"], -1);
  var cIva = pickCol_(colMap, ["IVA"], -1);
  var cValComIva = pickCol_(colMap, ["Valor Com IVA", "Valor_Com_IVA"], -1);
  var cObs = pickCol_(colMap, ["Observações", "Observacoes", "Obs"], -1);
  var cEstado = pickCol_(colMap, ["Estado"], -1);
  var cTipoDoc = pickCol_(colMap, ["Tipo_Doc", "Tipo Doc"], -1);
  var cDocOrigem = pickCol_(colMap, ["Doc_Origem", "Doc Origem"], -1);
  var cPaga = pickCol_(colMap, ["Paga", "Paga?"], -1);
  var cDataPag = pickCol_(colMap, ["Data_Pagamento", "Data Pagamento"], -1);

  if (cId < 0) return [];

  function num_(v) {
    if (typeof v === "number") return v;
    var s = String(v || "").replace(/\s/g, "").replace(/€/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  var rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];

  rows.forEach(function(r) {
    var id = String(r[cId] || "").trim();
    if (!id) return;
    out.push({
      id_fatura: id,
      fornecedor: cFornecedor >= 0 ? String(r[cFornecedor] || "").trim() : "",
      nif: cNif >= 0 ? String(r[cNif] || "").trim() : "",
      nr_documento: cNrDoc >= 0 ? String(r[cNrDoc] || "").trim() : "",
      data_fatura: formatDateValue_(cData >= 0 ? r[cData] : null, false),
      valor_sem_iva: cValSemIva >= 0 ? num_(r[cValSemIva]) : 0,
      iva: cIva >= 0 ? num_(r[cIva]) : 0,
      valor_com_iva: cValComIva >= 0 ? num_(r[cValComIva]) : 0,
      observacoes: cObs >= 0 ? String(r[cObs] || "").trim() : "",
      estado: cEstado >= 0 ? String(r[cEstado] || "").trim() : "",
      tipo_doc: cTipoDoc >= 0 ? String(r[cTipoDoc] || "").trim() : "FATURA",
      doc_origem: cDocOrigem >= 0 ? String(r[cDocOrigem] || "").trim() : "",
      paga: cPaga >= 0 ? toBool_(r[cPaga]) : false,
      data_pagamento: formatDateValue_(cDataPag >= 0 ? r[cDataPag] : null, false)
    });
  });

  return out;
}

// ── FATURAS_ITENS ────────────────────────────────────────
function readFaturasItens_(sheet) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  var colMap = getColMap_(sheet, 1);
  var cId = pickCol_(colMap, ["ID_Item_Fatura", "Id_Item_Fatura"], -1);
  var cIdFatura = pickCol_(colMap, ["ID_Fatura", "Id_Fatura"], -1);
  var cFornecedor = pickCol_(colMap, ["Fornecedor"], -1);
  var cNif = pickCol_(colMap, ["NIF"], -1);
  var cNrDoc = pickCol_(colMap, ["Nº Doc/Fatura", "Nr_Documento", "Nr Documento"], -1);
  var cData = pickCol_(colMap, ["Data Fatura", "Data_Fatura"], -1);
  var cDescricao = pickCol_(colMap, ["Descricao_Original", "Descricao Original", "Descrição Original"], -1);
  var cIdItem = pickCol_(colMap, ["ID_Item", "Id_Item"], -1);
  var cItemOficial = pickCol_(colMap, ["Item_Oficial", "Item Oficial"], -1);
  var cUnidade = pickCol_(colMap, ["Unidade"], -1);
  var cNatureza = pickCol_(colMap, ["Natureza"], -1);
  var cQtd = pickCol_(colMap, ["Quantidade"], -1);
  var cCustoUnit = pickCol_(colMap, ["Custo_Unit", "Custo Unit", "Custo Unitário", "Custo Unitario"], -1);
  var cDesc1 = pickCol_(colMap, ["Desconto 1", "Desconto_1"], -1);
  var cDesc2 = pickCol_(colMap, ["Desconto 2", "Desconto_2"], -1);
  var cCustoSemIva = pickCol_(colMap, ["Custo_Total Sem IVA", "Custo Total Sem IVA", "Custo_Total_Sem_IVA"], -1);
  var cIva = pickCol_(colMap, ["IVA"], -1);
  var cCustoComIva = pickCol_(colMap, ["Custo_Total Com IVA", "Custo Total Com IVA", "Custo_Total_Com_IVA"], -1);
  var cDestino = pickCol_(colMap, ["Destino"], -1);
  var cObra = pickCol_(colMap, ["Obra"], -1);
  var cFase = pickCol_(colMap, ["Fase"], -1);
  var cObs = pickCol_(colMap, ["Observações", "Observacoes", "Obs"], -1);

  if (cId < 0) return [];

  function num_(v) {
    if (typeof v === "number") return v;
    var s = String(v || "").replace(/\s/g, "").replace(/€/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  var rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];

  rows.forEach(function(r) {
    var id = String(r[cId] || "").trim();
    if (!id) return;
    out.push({
      id_item_fatura: id,
      id_fatura: cIdFatura >= 0 ? String(r[cIdFatura] || "").trim() : "",
      fornecedor: cFornecedor >= 0 ? String(r[cFornecedor] || "").trim() : "",
      nif: cNif >= 0 ? String(r[cNif] || "").trim() : "",
      nr_documento: cNrDoc >= 0 ? String(r[cNrDoc] || "").trim() : "",
      data_fatura: formatDateValue_(cData >= 0 ? r[cData] : null, false),
      descricao_original: cDescricao >= 0 ? String(r[cDescricao] || "").trim() : "",
      id_item: cIdItem >= 0 ? String(r[cIdItem] || "").trim() : "",
      item_oficial: cItemOficial >= 0 ? String(r[cItemOficial] || "").trim() : "",
      unidade: cUnidade >= 0 ? String(r[cUnidade] || "").trim() : "",
      natureza: cNatureza >= 0 ? String(r[cNatureza] || "").trim() : "",
      quantidade: cQtd >= 0 ? num_(r[cQtd]) : 0,
      custo_unit: cCustoUnit >= 0 ? num_(r[cCustoUnit]) : 0,
      desconto_1: cDesc1 >= 0 ? num_(r[cDesc1]) : 0,
      desconto_2: cDesc2 >= 0 ? num_(r[cDesc2]) : 0,
      custo_total_sem_iva: cCustoSemIva >= 0 ? num_(r[cCustoSemIva]) : 0,
      iva: cIva >= 0 ? num_(r[cIva]) : 0,
      custo_total_com_iva: cCustoComIva >= 0 ? num_(r[cCustoComIva]) : 0,
      destino: cDestino >= 0 ? String(r[cDestino] || "").trim() : "",
      obra: cObra >= 0 ? String(r[cObra] || "").trim() : "",
      fase: cFase >= 0 ? String(r[cFase] || "").trim() : "",
      observacoes: cObs >= 0 ? String(r[cObs] || "").trim() : ""
    });
  });

  return out;
}

// ── NOTAS_CREDITO_ITENS ──────────────────────────────────
function readNotasCreditoItens_(sheet) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  var colMap = getColMap_(sheet, 1);
  var cId = pickCol_(colMap, ["ID_Item_Nota_Credito", "Id_Item_Nota_Credito"], -1);
  var cIdFatura = pickCol_(colMap, ["ID_Fatura", "Id_Fatura"], -1);
  var cFornecedor = pickCol_(colMap, ["Fornecedor"], -1);
  var cNif = pickCol_(colMap, ["NIF"], -1);
  var cNrDoc = pickCol_(colMap, ["Nº Doc/Fatura", "Nr_Documento", "Nr Documento"], -1);
  var cDocOrigem = pickCol_(colMap, ["Doc_Origem", "Doc Origem"], -1);
  var cData = pickCol_(colMap, ["Data Fatura", "Data_Fatura"], -1);
  var cDescricao = pickCol_(colMap, ["Descricao_Original", "Descricao Original"], -1);
  var cIdItem = pickCol_(colMap, ["ID_Item", "Id_Item"], -1);
  var cItemOficial = pickCol_(colMap, ["Item_Oficial", "Item Oficial"], -1);
  var cUnidade = pickCol_(colMap, ["Unidade"], -1);
  var cNatureza = pickCol_(colMap, ["Natureza"], -1);
  var cQtd = pickCol_(colMap, ["Quantidade"], -1);
  var cCustoUnit = pickCol_(colMap, ["Custo_Unit", "Custo Unit"], -1);
  var cCustoSemIva = pickCol_(colMap, ["Custo_Total Sem IVA", "Custo Total Sem IVA"], -1);
  var cIva = pickCol_(colMap, ["IVA"], -1);
  var cCustoComIva = pickCol_(colMap, ["Custo_Total Com IVA", "Custo Total Com IVA"], -1);
  var cCategoria = pickCol_(colMap, ["Categoria_Nota_Credito", "Categoria Nota Credito"], -1);
  var cObra = pickCol_(colMap, ["Obra"], -1);
  var cFase = pickCol_(colMap, ["Fase"], -1);
  var cEstado = pickCol_(colMap, ["Estado"], -1);
  var cObs = pickCol_(colMap, ["Observações", "Observacoes", "Obs"], -1);

  if (cId < 0) return [];

  function num_(v) {
    if (typeof v === "number") return v;
    var s = String(v || "").replace(/\s/g, "").replace(/€/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  var rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];

  rows.forEach(function(r) {
    var id = String(r[cId] || "").trim();
    if (!id) return;
    out.push({
      id_item_nota_credito: id,
      id_fatura: cIdFatura >= 0 ? String(r[cIdFatura] || "").trim() : "",
      fornecedor: cFornecedor >= 0 ? String(r[cFornecedor] || "").trim() : "",
      nif: cNif >= 0 ? String(r[cNif] || "").trim() : "",
      nr_documento: cNrDoc >= 0 ? String(r[cNrDoc] || "").trim() : "",
      doc_origem: cDocOrigem >= 0 ? String(r[cDocOrigem] || "").trim() : "",
      data_fatura: formatDateValue_(cData >= 0 ? r[cData] : null, false),
      descricao_original: cDescricao >= 0 ? String(r[cDescricao] || "").trim() : "",
      id_item: cIdItem >= 0 ? String(r[cIdItem] || "").trim() : "",
      item_oficial: cItemOficial >= 0 ? String(r[cItemOficial] || "").trim() : "",
      unidade: cUnidade >= 0 ? String(r[cUnidade] || "").trim() : "",
      natureza: cNatureza >= 0 ? String(r[cNatureza] || "").trim() : "",
      quantidade: cQtd >= 0 ? num_(r[cQtd]) : 0,
      custo_unit: cCustoUnit >= 0 ? num_(r[cCustoUnit]) : 0,
      custo_total_sem_iva: cCustoSemIva >= 0 ? num_(r[cCustoSemIva]) : 0,
      iva: cIva >= 0 ? num_(r[cIva]) : 0,
      custo_total_com_iva: cCustoComIva >= 0 ? num_(r[cCustoComIva]) : 0,
      categoria_nota_credito: cCategoria >= 0 ? String(r[cCategoria] || "").trim() : "",
      obra: cObra >= 0 ? String(r[cObra] || "").trim() : "",
      fase: cFase >= 0 ? String(r[cFase] || "").trim() : "",
      estado: cEstado >= 0 ? String(r[cEstado] || "").trim() : "",
      observacoes: cObs >= 0 ? String(r[cObs] || "").trim() : ""
    });
  });

  return out;
}

// ── STOCK_ATUAL ──────────────────────────────────────────
function readStockAtual_(sheet) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  var colMap = getColMap_(sheet, 1);
  var cIdItem = pickCol_(colMap, ["ID_Item", "Id_Item"], -1);
  var cItemOficial = pickCol_(colMap, ["Item_Oficial", "Item Oficial"], -1);
  var cMaterial = pickCol_(colMap, ["Material"], -1);
  var cUnidade = pickCol_(colMap, ["Unidade"], -1);
  var cStock = pickCol_(colMap, ["Stock_Atual", "Stock Atual"], -1);
  var cCustoMedio = pickCol_(colMap, ["Custo_Medio_Atual", "Custo Medio Atual", "Custo Médio Atual"], -1);

  if (cIdItem < 0) return [];

  function num_(v) {
    if (typeof v === "number") return v;
    var s = String(v || "").replace(/\s/g, "").replace(/€/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  var rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];

  rows.forEach(function(r) {
    var id = String(r[cIdItem] || "").trim();
    if (!id) return;
    var stockQtd = cStock >= 0 ? num_(r[cStock]) : 0;
    var custoMedio = cCustoMedio >= 0 ? num_(r[cCustoMedio]) : 0;
    out.push({
      id_item: id,
      item_oficial: cItemOficial >= 0 ? String(r[cItemOficial] || "").trim() : "",
      material: cMaterial >= 0 ? String(r[cMaterial] || "").trim() : "",
      unidade: cUnidade >= 0 ? String(r[cUnidade] || "").trim() : "",
      stock_atual: stockQtd,
      custo_medio_atual: custoMedio,
      valor_stock: stockQtd * custoMedio
    });
  });

  return out;
}

// ── AFETACOES_OBRA ───────────────────────────────────────
function readAfetacoesObra_(sheet) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  var colMap = getColMap_(sheet, 1);
  var cId = pickCol_(colMap, ["ID_Afetacao", "Id_Afetacao"], -1);
  var cOrigem = pickCol_(colMap, ["Origem"], -1);
  var cSourceId = pickCol_(colMap, ["Source_ID", "Source ID"], -1);
  var cData = pickCol_(colMap, ["Data"], -1);
  var cIdItem = pickCol_(colMap, ["ID_Item", "Id_Item"], -1);
  var cItemOficial = pickCol_(colMap, ["Item_Oficial", "Item Oficial"], -1);
  var cNatureza = pickCol_(colMap, ["Natureza"], -1);
  var cQtd = pickCol_(colMap, ["Quantidade"], -1);
  var cUnidade = pickCol_(colMap, ["Unidade"], -1);
  var cCustoUnit = pickCol_(colMap, ["Custo_Unit", "Custo Unit"], -1);
  var cCustoTotal = pickCol_(colMap, ["Custo_Total", "Custo Total"], -1);
  var cCustoSemIva = pickCol_(colMap, ["Custo_Total Sem IVA", "Custo Total Sem IVA"], -1);
  var cIva = pickCol_(colMap, ["IVA"], -1);
  var cCustoComIva = pickCol_(colMap, ["Custo_Total Com IVA", "Custo Total Com IVA"], -1);
  var cObra = pickCol_(colMap, ["Obra"], -1);
  var cFase = pickCol_(colMap, ["Fase"], -1);
  var cFornecedor = pickCol_(colMap, ["Fornecedor"], -1);
  var cNif = pickCol_(colMap, ["NIF"], -1);
  var cNrDoc = pickCol_(colMap, ["Nr_Documento", "Nr Documento", "Nº Doc/Fatura"], -1);
  var cObs = pickCol_(colMap, ["Observações", "Observacoes", "Obs"], -1);

  if (cId < 0) return [];

  function num_(v) {
    if (typeof v === "number") return v;
    var s = String(v || "").replace(/\s/g, "").replace(/€/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  var rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];

  rows.forEach(function(r) {
    var id = String(r[cId] || "").trim();
    if (!id) return;
    out.push({
      id_afetacao: id,
      origem: cOrigem >= 0 ? String(r[cOrigem] || "").trim() : "",
      source_id: cSourceId >= 0 ? String(r[cSourceId] || "").trim() : "",
      data: formatDateValue_(cData >= 0 ? r[cData] : null, false),
      id_item: cIdItem >= 0 ? String(r[cIdItem] || "").trim() : "",
      item_oficial: cItemOficial >= 0 ? String(r[cItemOficial] || "").trim() : "",
      natureza: cNatureza >= 0 ? String(r[cNatureza] || "").trim() : "",
      quantidade: cQtd >= 0 ? num_(r[cQtd]) : 0,
      unidade: cUnidade >= 0 ? String(r[cUnidade] || "").trim() : "",
      custo_unit: cCustoUnit >= 0 ? num_(r[cCustoUnit]) : 0,
      custo_total: cCustoTotal >= 0 ? num_(r[cCustoTotal]) : 0,
      custo_total_sem_iva: cCustoSemIva >= 0 ? num_(r[cCustoSemIva]) : 0,
      iva: cIva >= 0 ? num_(r[cIva]) : 0,
      custo_total_com_iva: cCustoComIva >= 0 ? num_(r[cCustoComIva]) : 0,
      obra: cObra >= 0 ? String(r[cObra] || "").trim() : "",
      fase: cFase >= 0 ? String(r[cFase] || "").trim() : "",
      fornecedor: cFornecedor >= 0 ? String(r[cFornecedor] || "").trim() : "",
      nif: cNif >= 0 ? String(r[cNif] || "").trim() : "",
      nr_documento: cNrDoc >= 0 ? String(r[cNrDoc] || "").trim() : "",
      observacoes: cObs >= 0 ? String(r[cObs] || "").trim() : ""
    });
  });

  return out;
}

// ── MATERIAIS_CAD ────────────────────────────────────────
function readMateriaisCad_(sheet) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  var colMap = getColMap_(sheet, 1);
  var cIdItem = pickCol_(colMap, ["ID_Item", "Id_Item"], -1);
  var cItemOficial = pickCol_(colMap, ["Item_Oficial", "Item Oficial"], -1);
  var cNatureza = pickCol_(colMap, ["Natureza"], -1);
  var cUnidade = pickCol_(colMap, ["Unidade"], -1);
  var cObs = pickCol_(colMap, ["Observações", "Observacoes", "Obs"], -1);
  var cEstado = pickCol_(colMap, ["Estado_Cadastro", "Estado Cadastro"], -1);

  if (cIdItem < 0) return [];

  var rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];
  var seen = {};

  rows.forEach(function(r) {
    var id = String(r[cIdItem] || "").trim();
    if (!id || seen[id]) return;
    seen[id] = true;
    out.push({
      id_item: id,
      item_oficial: cItemOficial >= 0 ? String(r[cItemOficial] || "").trim() : "",
      natureza: cNatureza >= 0 ? String(r[cNatureza] || "").trim() : "",
      unidade: cUnidade >= 0 ? String(r[cUnidade] || "").trim() : "",
      observacoes: cObs >= 0 ? String(r[cObs] || "").trim() : "",
      estado_cadastro: cEstado >= 0 ? String(r[cEstado] || "").trim() : ""
    });
  });

  return out;
}
