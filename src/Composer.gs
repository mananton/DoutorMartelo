// ============================================================
// COMPOSER (PAYLOAD RAW V2)
// ============================================================

const RAW_V2_COLLECTION_KEYS_ = [
  "registos",
  "obras_info",
  "colaboradores",
  "viagens",
  "deslocacoes",
  "ferias",
  "pessoal_efetivo",
  "materiais_mov",
  "legacy_mao_obra",
  "legacy_materiais",
  "faturas",
  "faturas_itens",
  "notas_credito_itens",
  "stock_atual",
  "afetacoes_obra",
  "materiais_cad"
];

function createRawV2Payload_(partial) {
  const base = partial || {};
  const payload = {
    payload_mode: "raw_v2",
    payload_source: String(base.payload_source || "sheets").toLowerCase(),
    generated_at: base.generated_at || Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm"),
    diagnostics: base.diagnostics || createDataQualityDiagnostics_()
  };

  RAW_V2_COLLECTION_KEYS_.forEach(function(key) {
    payload[key] = Array.isArray(base[key]) ? base[key] : [];
  });

  return payload;
}

function assertRawV2PayloadContract_(payload) {
  if (!payload || payload.payload_mode !== "raw_v2") {
    throw new Error("Payload raw_v2 invalido.");
  }

  if (!payload.payload_source) {
    throw new Error("Payload raw_v2 invalido: origem em falta.");
  }

  RAW_V2_COLLECTION_KEYS_.forEach(function(key) {
    if (!Array.isArray(payload[key])) {
      throw new Error("Payload raw_v2 invalido: lista em falta -> " + key);
    }
  });

  if (!payload.diagnostics || typeof payload.diagnostics !== "object") {
    throw new Error("Payload raw_v2 invalido: diagnostics em falta.");
  }

  return payload;
}

function buildRawData_(ss) {
  const regSheet = ss.getSheetByName(SHEET_REGISTOS);
  const obraSheet = ss.getSheetByName(SHEET_OBRAS);
  const colabSheet = ss.getSheetByName(SHEET_COLAB);
  const viaSheet = ss.getSheetByName(SHEET_VIAGENS);
  const deslocSheet = ss.getSheetByName(SHEET_DESLOCACOES);
  const feriasSheet = ss.getSheetByName(SHEET_FERIAS);
  const matSheet = ss.getSheetByName(SHEET_MATERIAIS_MOV);
  const pessoalSheet = ss.getSheetByName(SHEET_PESSOAL);
  const legacyMaoObraSheet = ss.getSheetByName(SHEET_LEGACY_MAO_OBRA);
  const legacyMateriaisSheet = getLegacyMateriaisSheet_(ss);
  const faturasSheet = ss.getSheetByName(SHEET_FATURAS);
  const faturasItensSheet = ss.getSheetByName(SHEET_FATURAS_ITENS);
  const notasCreditoItensSheet = ss.getSheetByName(SHEET_NOTAS_CREDITO_ITENS);
  const stockAtualSheet = ss.getSheetByName(SHEET_STOCK_ATUAL);
  const afetacoesObraSheet = ss.getSheetByName(SHEET_AFETACOES_OBRA);
  const materiaisCadSheet = ss.getSheetByName(SHEET_MATERIAIS_CAD);

  if (!regSheet) throw new Error("Folha nao encontrada: " + SHEET_REGISTOS);

  const colabRateMap = buildColabRateMap_(colabSheet);
  const diagnostics = createDataQualityDiagnostics_();
  const registos = readRegistos_(regSheet, colabRateMap, diagnostics);

  if (diagnostics.total_issues > 0) {
    Logger.log("Data quality diagnostics: " + JSON.stringify({
      total_issues: diagnostics.total_issues,
      summary: diagnostics.summary,
      sample_count: diagnostics.samples.length
    }));
  }

  return createRawV2Payload_({
    payload_source: "sheets",
    generated_at: Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm"),
    diagnostics: diagnostics,
    registos: registos,
    obras_info: readObras_(obraSheet),
    colaboradores: readColabs_(colabSheet),
    viagens: readViagens_(viaSheet),
    deslocacoes: readDeslocacoes_(deslocSheet),
    ferias: readFerias_(feriasSheet),
    pessoal_efetivo: readPessoalEfetivo_(pessoalSheet),
    materiais_mov: readMateriaisMovDashboard_(matSheet),
    legacy_mao_obra: readLegacyMaoObra_(legacyMaoObraSheet),
    legacy_materiais: readLegacyMateriais_(legacyMateriaisSheet),
    faturas: readFaturas_(faturasSheet),
    faturas_itens: readFaturasItens_(faturasItensSheet),
    notas_credito_itens: readNotasCreditoItens_(notasCreditoItensSheet),
    stock_atual: readStockAtual_(stockAtualSheet),
    afetacoes_obra: readAfetacoesObra_(afetacoesObraSheet),
    materiais_cad: readMateriaisCad_(materiaisCadSheet)
  });
}
