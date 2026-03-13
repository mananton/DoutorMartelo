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
