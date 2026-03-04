// ============================================================
//  FICHEIRO CENTRAL — Code.gs (Versão Limpa MVC - AppSheet Backend)
//
//  Contém APENAS:
//  1. Dashboard Web App (doGet, getDashboardData, readers)
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
const SHEET_NAO_REGISTADOS = "NAO_REGISTADOS_HIST";
const TZ               = "Europe/Lisbon";
const NREG_HOUR        = 23;
const NREG_MINUTE      = 45;


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
function getDashboardData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return JSON.stringify(buildData_(ss));
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

function buildData_(ss) {
  const regSheet    = ss.getSheetByName(SHEET_REGISTOS);
  const obraSheet   = ss.getSheetByName(SHEET_OBRAS);
  const colabSheet  = ss.getSheetByName(SHEET_COLAB);
  const viaSheet    = ss.getSheetByName(SHEET_VIAGENS);
  const deslocSheet = ss.getSheetByName(SHEET_DESLOCACOES);
  const feriasSheet = ss.getSheetByName(SHEET_FERIAS);
  const matSheet    = ss.getSheetByName(SHEET_MATERIAIS_MOV);

  if (!regSheet) throw new Error("Folha não encontrada: " + SHEET_REGISTOS);

  const obrasInfo   = readObras_(obraSheet);
  const colabs      = readColabs_(colabSheet);

  // Mapa nome→€/h lido directamente da sheet (desde linha 1, igual a debugCustos)
  // readColabs_ começa na linha 3 e pode saltar trabalhadores na linha 2
  const colabRateMap = {};
  if (colabSheet) {
    const clLast = colabSheet.getLastRow();
    if (clLast >= 2) {
      colabSheet.getRange(1, 1, clLast, 3).getValues().forEach(r => {
        const n = String(r[0] || "").trim();
        if (n && n !== "Nome") colabRateMap[n] = parseFloat(r[2]) || 0;
      });
    }
  }

  const registos    = readRegistos_(regSheet, colabRateMap);
  const viagens     = readViagens_(viaSheet);
  const deslocacoes = readDeslocacoes_(deslocSheet);
  const ferias      = readFerias_(feriasSheet);
  const materiaisMov = readMateriaisMov_(matSheet);

  // ── Agregar por obra ────────────────────────────────────────
  const obraMap = {};

  registos.forEach(r => {
    const obra = r.obra;
    if (!obra) return;
    if (!obraMap[obra]) obraMap[obra] = {
      custo_total: 0, horas_total: 0, atraso_total: 0,
      trabalhadores: new Set(), faltas: 0, datas: new Set(),
      daily: {}, weekly: {}, monthly: {},
      workerMap: {}, assidMap: {}, faseMap: {}
    };
    const o = obraMap[obra];
    o.custo_total  += r.custo;
    o.horas_total  += r.horas;
    o.atraso_total += r.atraso_min;
    o.trabalhadores.add(r.nome);
    if (r.falta) o.faltas++;
    o.datas.add(r.data);

    // daily
    if (!o.daily[r.data]) o.daily[r.data] = { Custo: 0, Horas: 0, Atraso: 0, Trabalhadores: new Set(), Faltas: 0 };
    o.daily[r.data].Custo        += r.custo;
    o.daily[r.data].Horas        += r.horas;
    o.daily[r.data].Atraso       += r.atraso_min;
    o.daily[r.data].Trabalhadores.add(r.nome);
    if (r.falta) o.daily[r.data].Faltas++;

    // weekly
    const wk = isoWeek_(r.data);
    if (!o.weekly[wk]) o.weekly[wk] = { Custo: 0, Horas: 0 };
    o.weekly[wk].Custo += r.custo;
    o.weekly[wk].Horas += r.horas;

    // monthly
    const mo = r.data.slice(0, 7);
    if (!o.monthly[mo]) o.monthly[mo] = { Custo: 0, Horas: 0 };
    o.monthly[mo].Custo += r.custo;
    o.monthly[mo].Horas += r.horas;

    // workers
    if (!o.workerMap[r.nome]) o.workerMap[r.nome] = {
      funcao: r.funcao, fase: r.fase,
      Custo: 0, Horas: 0, Atraso: 0, Dias: new Set(), Faltas: 0
    };
    o.workerMap[r.nome].Custo  += r.custo;
    o.workerMap[r.nome].Horas  += r.horas;
    o.workerMap[r.nome].Atraso += r.atraso_min;
    o.workerMap[r.nome].Dias.add(r.data);
    if (r.falta) o.workerMap[r.nome].Faltas++;

    // assiduidade
    if (!o.assidMap[r.nome]) o.assidMap[r.nome] = { funcao: r.funcao, dias: {} };
    if (!o.assidMap[r.nome].dias[r.data]) {
      o.assidMap[r.nome].dias[r.data] = {
        horas: 0, falta: false, dispensado: false, custo: 0,
        atraso_min: 0, motivo: "", fases: []
      };
    }
    o.assidMap[r.nome].dias[r.data].horas      += r.horas;
    o.assidMap[r.nome].dias[r.data].custo      += r.custo;
    o.assidMap[r.nome].dias[r.data].atraso_min += r.atraso_min;
    if (r.falta)  o.assidMap[r.nome].dias[r.data].falta  = true;
    if (r.dispensado) o.assidMap[r.nome].dias[r.data].dispensado = true;
    if (r.motivo) o.assidMap[r.nome].dias[r.data].motivo = r.motivo;
    if (r.fase && !o.assidMap[r.nome].dias[r.data].fases.includes(r.fase))
      o.assidMap[r.nome].dias[r.data].fases.push(r.fase);

    // fases
    if (r.fase) {
      if (!o.faseMap[r.fase]) o.faseMap[r.fase] = {
        Custo: 0, Horas: 0, Workers: new Set(), Dias: new Set(), Faltas: 0
      };
      o.faseMap[r.fase].Custo  += r.custo;
      o.faseMap[r.fase].Horas  += r.horas;
      o.faseMap[r.fase].Workers.add(r.nome);
      o.faseMap[r.fase].Dias.add(r.data);
      if (r.falta) o.faseMap[r.fase].Faltas++;
    }
  });

  // ── Mapa de deslocações por obra ────────────────────────────
  const deslocMap = {};
  deslocacoes.forEach(d => {
    if (!d.obra) return;
    if (!deslocMap[d.obra]) deslocMap[d.obra] = { custo: 0, qtd: 0 };
    deslocMap[d.obra].custo += d.custo;
    deslocMap[d.obra].qtd   += d.qtd;
  });

  // ── Materiais (CONSUMO) por obra e por fase ─────────────────
  const matPorObra = {};       // obra -> { custo, qtd }
  const matPorObraFase = {};   // obra -> fase -> { custo, qtd }
  let custoMateriais = 0;

  (materiaisMov || []).forEach(m => {
    const tipo = String(m.tipo || "").trim().toUpperCase();
    if (tipo !== "CONSUMO") return;

    const obra = String(m.obra || "").trim();
    if (!obra) return;

    const fase = String(m.fase || "—").trim() || "—";
    const custo = parseFloat(m.custo) || 0;
    const qtd = parseFloat(m.qtd) || 0;

    custoMateriais += custo;

    if (!matPorObra[obra]) matPorObra[obra] = { custo: 0, qtd: 0 };
    matPorObra[obra].custo += custo;
    matPorObra[obra].qtd   += qtd;

    if (!matPorObraFase[obra]) matPorObraFase[obra] = {};
    if (!matPorObraFase[obra][fase]) matPorObraFase[obra][fase] = { custo: 0, qtd: 0 };
    matPorObraFase[obra][fase].custo += custo;
    matPorObraFase[obra][fase].qtd   += qtd;
  });

  // ── Serializar obra map ─────────────────────────────────────
  const obras = {};
  Object.keys(obraMap).sort().forEach(nome => {
    const o = obraMap[nome];
    const allDates = Array.from(o.datas).sort();
    obras[nome] = {
      custo_mao_obra:    o.custo_total,
      custo_deslocacoes: (deslocMap[nome] || {}).custo || 0,
      qtd_deslocacoes:   (deslocMap[nome] || {}).qtd   || 0,
      custo_materiais:   (matPorObra[nome] || {}).custo || 0,
      custo_total:       o.custo_total
                          + ((deslocMap[nome] || {}).custo || 0)
                          + ((matPorObra[nome] || {}).custo || 0),
      horas_total:   o.horas_total,
      atraso_total:  o.atraso_total,
      trabalhadores: o.trabalhadores.size,
      faltas:        o.faltas,
      dias:          o.datas.size,
      all_dates:     allDates,
      daily: Object.keys(o.daily).sort().map(d => ({
        DATA_str:      d,
        Custo:         o.daily[d].Custo,
        Horas:         o.daily[d].Horas,
        Atraso:        o.daily[d].Atraso,
        Trabalhadores: o.daily[d].Trabalhadores.size,
        Faltas:        o.daily[d].Faltas
      })),
      weekly: Object.keys(o.weekly).sort().map(w => ({
        Semana: w, Custo: o.weekly[w].Custo, Horas: o.weekly[w].Horas
      })),
      monthly: Object.keys(o.monthly).sort().map(m => ({
        Mes: m, Custo: o.monthly[m].Custo, Horas: o.monthly[m].Horas
      })),
      workers: Object.keys(o.workerMap)
        .map(n => ({
          "Nome (auto)":    n,
          "Função (auto)":  o.workerMap[n].funcao,
          "Fase":           o.workerMap[n].fase,
          Custo:            o.workerMap[n].Custo,
          Horas:            o.workerMap[n].Horas,
          Atraso:           o.workerMap[n].Atraso,
          Dias:             o.workerMap[n].Dias.size,
          Faltas:           o.workerMap[n].Faltas
        }))
        .sort((a, b) => b.Custo - a.Custo),
      assiduidade: Object.keys(o.assidMap).map(n => ({
        nome:   n,
        funcao: o.assidMap[n].funcao,
        dias:   o.assidMap[n].dias
      })),
      fases: Object.keys(o.faseMap)
        .map(f => ({
          Fase:    f,
          Custo:   o.faseMap[f].Custo,
          Horas:   o.faseMap[f].Horas,
          Workers: o.faseMap[f].Workers.size,
          Dias:    o.faseMap[f].Dias.size,
          Faltas:  o.faseMap[f].Faltas
        }))
        .sort((a, b) => b.Custo - a.Custo),
      materiais_fases: (matPorObraFase[nome])
        ? Object.keys(matPorObraFase[nome]).map(f => ({
            Fase: f,
            Custo: matPorObraFase[nome][f].custo,
            Qtd:   matPorObraFase[nome][f].qtd
          })).sort((a,b) => b.Custo - a.Custo)
        : [],
    };
  });

  // ── Global KPIs ─────────────────────────────────────────────
  const custoMaoObra     = registos.reduce((s, r) => s + r.custo, 0);
  const custoDeslocacoes = deslocacoes.reduce((s, d) => s + d.custo, 0);
  const custoTotal       = custoMaoObra + custoDeslocacoes + custoMateriais;
  const horasTotal      = registos.reduce((s, r) => s + r.horas, 0);
  const totalAtrasos    = registos.reduce((s, r) => s + r.atraso_min, 0);
  const totalFaltas     = registos.filter(r => r.falta).length;
  const trabUnicos      = new Set(registos.map(r => r.nome)).size;
  const custoViagens    = viagens.reduce((s, v) => s + v.custo_dia, 0);
  const totalViagens    = viagens.reduce((s, v) => s + v.v_efetivas, 0);
  const lastUpdate      = Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm");

  return {
    global: {
      custo_total:        custoTotal,
      custo_mao_obra:     custoMaoObra,
      custo_deslocacoes:  custoDeslocacoes,
      custo_materiais:    custoMateriais,
      horas_total:        horasTotal,
      total_atrasos:      totalAtrasos,
      obras_ativas:       Object.keys(obras).length,
      colaboradores:      trabUnicos,
      faltas:             totalFaltas,
      custo_viagens:      custoViagens,
      total_viagens:      totalViagens,
      last_update:        lastUpdate
    },
    obras:        obras,
    obras_info:   obrasInfo,
    colaboradores: colabs,
    viagens:      viagens,
    deslocacoes:  deslocacoes,
    ferias:       ferias,
    materiais_mov: materiaisMov
  };
}

// ── READERS ───────────────────────────────────────────────────

function readRegistos_(sheet, colabRateMap) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Colunas A-P (16). Mapa actual:
  // A=DATA_ARQUIVO B=DATA_REGISTO C=Nome D=Funcao E=Obra F=Fase de Obra
  // G=Horas H=Atraso_Minutos I=Falta J=Motivo Falta K=Eur_h L=Custo Dia
  // M=Observacao N=ID_Registo O=Dispensado P=Dispensa_Processada_Em
  const numCols = Math.max(sheet.getLastColumn(), 16);
  const data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  const results = [];

  data.forEach(row => {
    const obra = String(row[4] || "").trim();  // col E
    if (!obra) return;

    // col B = DATA_REGISTO
    const rawData = row[1];
    const dateStr = rawData instanceof Date
      ? Utilities.formatDate(rawData, TZ, "yyyy-MM-dd")
      : String(rawData).slice(0, 10);

    const nome      = String(row[2] || "").trim();
    const horas     = parseFloat(row[6]) || 0;
    const atrasoMin = parseFloat(row[7]) || 0;
    const falta     = row[8] === true || String(row[8]).toLowerCase() === "true";
    const dispensado = row[14] === true || String(row[14]).toLowerCase() === "true";
    const rawDispensaProcessada = row[15];
    const dispensaProcessadaEm = rawDispensaProcessada instanceof Date
      ? Utilities.formatDate(rawDispensaProcessada, TZ, "yyyy-MM-dd HH:mm:ss")
      : String(rawDispensaProcessada || "").trim();

    // Recalcular €/h e custo a partir de COLABORADORES (AppSheet pode gravar valores errados)
    // Fórmula igual à AppSheet: Horas_Efetivas = Horas - (Atraso_Minutos/60)
    //                           Custo = Falta ? 0 : Horas_Efetivas * €/h
    const rateFromColab = (colabRateMap && colabRateMap[nome] !== undefined)
      ? colabRateMap[nome]
      : parseFloat(row[10]) || 0;
    const horasEfetivas = horas - (atrasoMin / 60);
    const custoCalc     = falta ? 0 : horasEfetivas * rateFromColab;

    results.push({
      data:       dateStr,
      nome:       nome,
      funcao:     String(row[3] || "").trim(),   // D
      obra:       obra,                          // E
      fase:       String(row[5] || "").trim(),   // F
      horas:      horas,                         // G
      atraso_min: atrasoMin,                     // H
      falta:      falta,                         // I
      motivo:     String(row[9] || "").trim(),   // J
      dispensado: dispensado,                    // O
      dispensa_processada_em: dispensaProcessadaEm, // P
      eur_h:      rateFromColab,
      custo:      custoCalc,
    });
  });

  return results;
}

function readObras_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];
  const data = sheet.getRange(3, 1, lastRow - 2, 3).getValues();
  return data
    .filter(r => r[0] && String(r[0]).trim() !== "" && String(r[0]).trim() !== "Obra_ID")
    .map(r => ({
      Obra_ID:  String(r[0]).trim(),
      Local_ID: String(r[1]).trim(),
      Ativa:    String(r[2]).trim()
    }));
}

function readColabs_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];
  const data = sheet.getRange(3, 1, lastRow - 2, 3).getValues();
  return data
    .filter(r => r[0] && String(r[0]).trim() !== "" && String(r[0]).trim() !== "Nome")
    .map(r => ({
      Nome:   String(r[0]).trim(),
      Funcao: String(r[1]).trim(),
      Eur_h:  parseFloat(r[2]) || 0
    }));
}

function readViagens_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];
  const data = sheet.getRange(3, 1, lastRow - 2, 9).getValues();
  return data
    .filter(r => r[0] && r[0] !== "Data")
    .map(r => {
      const rawD = r[0];
      const dateStr = rawD instanceof Date
        ? Utilities.formatDate(rawD, TZ, "yyyy-MM-dd")
        : String(rawD).slice(0, 10);
      return {
        Data_str:   dateStr,
        DiaSem:     parseInt(r[1]) || 0,
        V_Padrao:   parseFloat(r[2]) || 0,
        V_Real:     r[3] !== "" ? parseFloat(r[3]) : null,
        V_Efetivas: parseFloat(r[4]) || 0,
        Viatura:    String(r[5] || "").trim(),
        Obra:       String(r[6] || "").trim() || null,
        Custo_Via:  parseFloat(r[7]) || 0,
        custo_dia:  parseFloat(r[8]) || 0,
        v_efetivas: parseFloat(r[4]) || 0,
      };
    });
}


function readDeslocacoes_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Nova estrutura (9 colunas):
  // A=ID_Viagem, B=Data, C=Obra_Destino(legacy), D=Destino(novo),
  // E=Veiculo, F=Motorista, G=Origem, H=Quantidade_Viagens, I=Custo_Total
  const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();

  return data
    .filter(r => {
      // Obra válida em D (novo) ou em C (legacy)
      const obra = String(r[3] || r[2] || "").trim();
      return obra !== "" && obra !== "Obra_Destino" && obra !== "Destino";
    })
    .map(r => {
      const rawD = r[1];
      const dateStr = rawD instanceof Date
        ? Utilities.formatDate(rawD, TZ, "yyyy-MM-dd")
        : String(rawD).slice(0, 10);

      // Usa Destino (col D) se preenchido, senão cai para Obra_Destino (col C - legacy)
      const obra = String(r[3] || r[2] || "").trim();

      return {
        data:      dateStr,
        obra:      obra,
        veiculo:   String(r[4] || "").trim(),
        motorista: String(r[5] || "").trim(),
        origem:    String(r[6] || "").trim(),
        qtd:       parseFloat(r[7]) || 0,
        custo:     parseFloat(r[8]) || 0,
      };
    });
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
  const cCustoTot  = findCol_(["custo_total", "custo total"]);
  const cCustoUnit = findCol_(["custo_unit", "custo unit"]);
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
    const custoTot = cCustoTot >= 0 ? num_(r[cCustoTot]) : (qtd * custoUnit);

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


// ════════════════════════════════════════════════════════════
//  SECÇÃO 2 — MENU & HELPERS
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
//  SECÇÃO 3 — LIMPEZA AUTOMÁTICA DE LINHAS VAZIAS
// ════════════════════════════════════════════════════════════

/**
 * Trigger onChange instalável.
 * Dispara quando a AppSheet elimina um registo, deixando uma linha vazia.
 * Para instalar: Executar installOnChangeTrigger() UMA VEZ manualmente.
 */
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
}

/**
 * Remove todas as linhas completamente vazias de REGISTOS_POR_DIA.
 * Percorre de baixo para cima para não deslocar índices ao apagar.
 */
function limparLinhasVazias_() {
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
  limparLinhasVazias_();
  SpreadsheetApp.getUi().alert("✅ Linhas vazias eliminadas de REGISTOS_POR_DIA.");
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

function readFerias_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const results = [];

  data.forEach(row => {
    const nome = String(row[0] || "").trim();
    if (!nome) return;

    const admRaw = row[1];
    const admStr = admRaw instanceof Date
      ? Utilities.formatDate(admRaw, TZ, "yyyy-MM-dd")
      : String(admRaw).slice(0, 10);

    const refIniRaw = row[3];
    const refIniStr = refIniRaw instanceof Date
      ? Utilities.formatDate(refIniRaw, TZ, "yyyy-MM-dd")
      : String(refIniRaw || "").slice(0, 10);

    const refFimRaw = row[4];
    const refFimStr = refFimRaw instanceof Date
      ? Utilities.formatDate(refFimRaw, TZ, "yyyy-MM-dd")
      : String(refFimRaw || "").slice(0, 10);

    results.push({
      nome:            nome,
      data_admissao:   admStr,
      dias_total:      parseInt(row[2]) || 0,
      ano_ref_inicio:  refIniStr,
      ano_ref_fim:     refFimStr,
      dias_usados:     parseInt(row[5]) || 0,
      dias_disponiveis: parseInt(row[6]) || 0
    });
  });

  return results;
}

/** Corre automaticamente quando o ficheiro é aberto. Apenas para atalhos de UI. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🏗 Dashboard")
    .addItem("Abrir Dashboard", "abrirDashboard")
    .addItem("Limpar linhas vazias", "limparLinhasVaziasManual")
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
function isoWeek_(dateStr) {
  const d           = new Date(dateStr + "T12:00:00");
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const dayOfYear   = Math.floor((d - startOfYear) / 86400000);
  const weekNum     = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
  return d.getFullYear() + "-S" + String(weekNum).padStart(2, "0");
}
