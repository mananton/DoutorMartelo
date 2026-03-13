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
const SHEET_NAO_REGISTADOS = "NAO_REGISTADOS_HIST";
const SHEET_LEGACY_MAO_OBRA = "LEGACY_MAO_OBRA";
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

// SECTION 3 - LIMPEZA AUTOMATICA DE LINHAS VAZIAS

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
