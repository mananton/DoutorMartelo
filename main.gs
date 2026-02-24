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
const TZ               = "Europe/Lisbon";


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

  if (!regSheet) throw new Error("Folha não encontrada: " + SHEET_REGISTOS);

  const registos    = readRegistos_(regSheet);
  const obrasInfo   = readObras_(obraSheet);
  const colabs      = readColabs_(colabSheet);
  const viagens     = readViagens_(viaSheet);
  const deslocacoes = readDeslocacoes_(deslocSheet);

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
    if (!o.assidMap[r.nome].dias[r.data]) o.assidMap[r.nome].dias[r.data] = { horas: 0, falta: false, custo: 0, atraso_min: 0, motivo: "" };
    o.assidMap[r.nome].dias[r.data].horas      += r.horas;
    o.assidMap[r.nome].dias[r.data].custo      += r.custo;
    o.assidMap[r.nome].dias[r.data].atraso_min += r.atraso_min;
    if (r.falta)  o.assidMap[r.nome].dias[r.data].falta  = true;
    if (r.motivo) o.assidMap[r.nome].dias[r.data].motivo = r.motivo;

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

  // ── Serializar obra map ─────────────────────────────────────
  const obras = {};
  Object.keys(obraMap).sort().forEach(nome => {
    const o = obraMap[nome];
    const allDates = Array.from(o.datas).sort();
    obras[nome] = {
      custo_mao_obra:    o.custo_total,
      custo_deslocacoes: (deslocMap[nome] || {}).custo || 0,
      qtd_deslocacoes:   (deslocMap[nome] || {}).qtd   || 0,
      custo_total:       o.custo_total + ((deslocMap[nome] || {}).custo || 0),
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
        .sort((a, b) => b.Custo - a.Custo)
    };
  });

  // ── Global KPIs ─────────────────────────────────────────────
  const custoMaoObra    = registos.reduce((s, r) => s + r.custo, 0);
  const custoDeslocacoes = deslocacoes.reduce((s, d) => s + d.custo, 0);
  const custoTotal      = custoMaoObra + custoDeslocacoes;
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
    deslocacoes:  deslocacoes
  };
}

// ── READERS ───────────────────────────────────────────────────

function readRegistos_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Colunas A-L (12). Mapa actual: A=ID_Arquivo B=Data C=Nome D=Funcao E=Obra
  // F=Fase G=Horas H=Atraso_Minutos I=Falta J=Motivo_Falta K=Eur_h L=Custo_Dia
  const data = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  const results = [];

  data.forEach(row => {
    const obra = String(row[4] || "").trim();  // col E
    if (!obra) return;

    // col B = DATA_REGISTO
    const rawData = row[1];
    const dateStr = rawData instanceof Date
      ? Utilities.formatDate(rawData, TZ, "yyyy-MM-dd")
      : String(rawData).slice(0, 10);

    results.push({
      data:       dateStr,
      nome:       String(row[2] || "").trim(),   // C
      funcao:     String(row[3] || "").trim(),   // D
      obra:       obra,                          // E
      fase:       String(row[5] || "").trim(),   // F
      horas:      parseFloat(row[6]) || 0,       // G
      atraso_min: parseFloat(row[7]) || 0,       // H — Atraso_Minutos (novo)
      falta:      row[8] === true || String(row[8]).toLowerCase() === "true",  // I
      motivo:     String(row[9] || "").trim(),   // J — Motivo Falta (novo)
      eur_h:      parseFloat(row[10]) || 0,      // K
      custo:      parseFloat(row[11]) || 0,      // L
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
  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  return data
    .filter(r => r[2] && String(r[2]).trim() !== "" && String(r[2]).trim() !== "Obra_Destino")
    .map(r => {
      const rawD = r[1];
      const dateStr = rawD instanceof Date
        ? Utilities.formatDate(rawD, TZ, "yyyy-MM-dd")
        : String(rawD).slice(0, 10);
      return {
        data:   dateStr,
        obra:   String(r[2]).trim(),
        origem: String(r[3] || "").trim(),
        qtd:    parseFloat(r[4]) || 0,
        custo:  parseFloat(r[5]) || 0,
      };
    });
}


// ════════════════════════════════════════════════════════════
//  SECÇÃO 2 — MENU & HELPERS
// ════════════════════════════════════════════════════════════

/** Corre automaticamente quando o ficheiro é aberto. Apenas para atalhos de UI. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🏗 Dashboard")
    .addItem("Abrir Dashboard", "abrirDashboard")
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