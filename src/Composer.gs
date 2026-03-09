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

  if (!regSheet) throw new Error("Folha não encontrada: " + SHEET_REGISTOS);

  const colabRateMap = buildColabRateMap_(colabSheet);

  return {
    payload_mode: "raw_v2",
    generated_at: Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm"),
    registos: readRegistos_(regSheet, colabRateMap),
    obras_info: readObras_(obraSheet),
    colaboradores: readColabs_(colabSheet),
    viagens: readViagens_(viaSheet),
    deslocacoes: readDeslocacoes_(deslocSheet),
    ferias: readFerias_(feriasSheet),
    materiais_mov: readMateriaisMov_(matSheet)
  };
}
