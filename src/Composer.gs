// ============================================================
// COMPOSER (PAYLOAD RAW V2)
// ============================================================

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

  return {
    payload_mode: "raw_v2",
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
    legacy_materiais: readLegacyMateriais_(legacyMateriaisSheet)
  };
}
