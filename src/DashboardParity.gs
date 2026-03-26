// ============================================================
// DASHBOARD PARITY CHECK - SHEETS VS SUPABASE
// ============================================================

const DASHBOARD_PARITY_TOLERANCE = 0.01;
const DASHBOARD_PARITY_SAMPLE_LIMIT = 10;

function runDashboardParityCheck() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rawSheets = assertRawV2PayloadContract_(buildRawData_(ss));
  const rawSupabase = assertRawV2PayloadContract_(buildRawDataFromSupabase_());
  return buildDashboardParityReport_(rawSheets, rawSupabase);
}

function getDashboardParityReportJson() {
  return JSON.stringify(runDashboardParityCheck(), null, 2);
}

function logDashboardParityCheck() {
  const report = runDashboardParityCheck();
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function buildDashboardParityReport_(rawSheets, rawSupabase) {
  const sheetsSummary = buildDashboardParitySummaryFromRaw_(rawSheets);
  const supabaseSummary = buildDashboardParitySummaryFromRaw_(rawSupabase);
  const datasetReport = buildDashboardParityDatasetReport_(rawSheets, rawSupabase);
  const globalReport = buildDashboardParityMetricBlock_(
    sheetsSummary.global,
    supabaseSummary.global,
    [
      "custo_total",
      "custo_mao_obra",
      "custo_deslocacoes",
      "custo_materiais",
      "horas_total",
      "total_atrasos",
      "obras_ativas",
      "colaboradores",
      "faltas",
      "custo_viagens",
      "total_viagens"
    ]
  );
  const obraReport = buildDashboardParityObraReport_(sheetsSummary.obras, supabaseSummary.obras);

  return {
    generated_at: Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm:ss"),
    sheets_generated_at: rawSheets.generated_at || "",
    supabase_generated_at: rawSupabase.generated_at || "",
    overall_match: datasetReport.matches && globalReport.matches && obraReport.matches,
    datasets: datasetReport.items,
    global_metrics: globalReport.items,
    obra_metrics: obraReport.items,
    mismatch_summary: {
      dataset_mismatches: datasetReport.items.filter(function(item) { return !item.matches; }).length,
      global_mismatches: globalReport.items.filter(function(item) { return !item.matches; }).length,
      obra_mismatches: obraReport.items.filter(function(item) { return !item.matches; }).length
    }
  };
}

function buildDashboardParitySummaryFromRaw_(raw) {
  const registos = Array.isArray(raw.registos) ? raw.registos : [];
  const legacyMaoObra = Array.isArray(raw.legacy_mao_obra) ? raw.legacy_mao_obra : [];
  const legacyMateriais = Array.isArray(raw.legacy_materiais) ? raw.legacy_materiais : [];
  const deslocacoes = Array.isArray(raw.deslocacoes) ? raw.deslocacoes : [];
  const viagens = Array.isArray(raw.viagens) ? raw.viagens : [];
  const materiaisMov = Array.isArray(raw.materiais_mov) ? raw.materiais_mov : [];
  const obraMap = {};
  const trabalhadores = {};

  function ensureObra_(obra) {
    const key = String(obra || "").trim();
    if (!key) return null;
    if (!obraMap[key]) {
      obraMap[key] = {
        custo_mao_obra: 0,
        custo_deslocacoes: 0,
        qtd_deslocacoes: 0,
        custo_materiais: 0,
        horas_total: 0,
        atraso_total: 0,
        faltas: 0,
        dias: {}
      };
    }
    return obraMap[key];
  }

  registos.forEach(function(row) {
    const obra = ensureObra_(row && row.obra);
    if (!obra) return;
    const nome = String(row.nome || "").trim();
    const data = String(row.data || "").slice(0, 10);
    const custo = Number(row.custo) || 0;
    const horas = Number(row.horas) || 0;
    const atraso = Number(row.atraso_min) || 0;

    obra.custo_mao_obra += custo;
    obra.horas_total += horas;
    obra.atraso_total += atraso;
    if (row && row.falta) obra.faltas += 1;
    if (data) obra.dias[data] = true;
    if (nome) trabalhadores[nome] = true;
  });

  legacyMaoObra.forEach(function(row) {
    const obra = ensureObra_(row && row.obra);
    if (!obra) return;
    const data = String(row.data || "").slice(0, 10);
    obra.custo_mao_obra += Number(row.custo) || 0;
    obra.horas_total += Number(row.horas) || 0;
    if (data) obra.dias[data] = true;
  });

  deslocacoes.forEach(function(row) {
    const obra = ensureObra_(row && row.obra);
    if (!obra) return;
    obra.custo_deslocacoes += Number(row.custo) || 0;
    obra.qtd_deslocacoes += Number(row.qtd) || 0;
  });

  materiaisMov.forEach(function(row) {
    if (!isDashboardMaterialMovServer_(row)) return;
    const obra = ensureObra_(row && row.obra);
    if (!obra) return;
    obra.custo_materiais += Number(row.custo) || 0;
  });

  legacyMateriais.forEach(function(row) {
    const obra = ensureObra_(row && row.obra);
    if (!obra) return;
    obra.custo_materiais += Number(row.custo) || 0;
  });

  const obras = {};
  Object.keys(obraMap).sort().forEach(function(nome) {
    const current = obraMap[nome];
    obras[nome] = {
      custo_mao_obra: roundParityNumber_(current.custo_mao_obra),
      custo_deslocacoes: roundParityNumber_(current.custo_deslocacoes),
      qtd_deslocacoes: roundParityNumber_(current.qtd_deslocacoes),
      custo_materiais: roundParityNumber_(current.custo_materiais),
      custo_total: roundParityNumber_(current.custo_mao_obra + current.custo_deslocacoes + current.custo_materiais),
      horas_total: roundParityNumber_(current.horas_total),
      atraso_total: roundParityNumber_(current.atraso_total),
      faltas: current.faltas,
      dias: Object.keys(current.dias).length
    };
  });

  const global = {
    custo_mao_obra: 0,
    custo_deslocacoes: 0,
    custo_materiais: 0,
    custo_total: 0,
    horas_total: 0,
    total_atrasos: 0,
    obras_ativas: Object.keys(obras).length,
    colaboradores: Object.keys(trabalhadores).length,
    faltas: registos.filter(function(row) { return !!(row && row.falta); }).length,
    custo_viagens: viagens.reduce(function(sum, row) { return sum + (Number(row && row.custo_dia) || 0); }, 0),
    total_viagens: viagens.reduce(function(sum, row) { return sum + (Number(row && row.v_efetivas) || 0); }, 0)
  };

  Object.keys(obras).forEach(function(nome) {
    const obra = obras[nome];
    global.custo_mao_obra += obra.custo_mao_obra;
    global.custo_deslocacoes += obra.custo_deslocacoes;
    global.custo_materiais += obra.custo_materiais;
    global.custo_total += obra.custo_total;
    global.horas_total += obra.horas_total;
    global.total_atrasos += obra.atraso_total;
  });

  Object.keys(global).forEach(function(key) {
    if (typeof global[key] === "number") {
      global[key] = roundParityNumber_(global[key]);
    }
  });

  return {
    global: global,
    obras: obras
  };
}

function buildDashboardParityDatasetReport_(rawSheets, rawSupabase) {
  const configs = [
    {
      key: "obras_info",
      label: "obras_info",
      keyFn: function(row) { return String((row && row.Obra_ID) || "").trim(); },
      metrics: []
    },
    {
      key: "colaboradores",
      label: "colaboradores",
      keyFn: function(row) { return String((row && row.Nome) || "").trim(); },
      metrics: [
        { name: "eur_h_total", getter: function(row) { return Number(row && row.Eur_h) || 0; } }
      ]
    },
    {
      key: "registos",
      label: "registos",
      keyFn: function(row) {
        return [
          row && row.data,
          row && row.nome,
          row && row.obra,
          row && row.fase,
          Number(row && row.horas) || 0,
          Number(row && row.atraso_min) || 0,
          !!(row && row.falta),
          !!(row && row.dispensado)
        ].join("|");
      },
      metrics: [
        { name: "horas_total", getter: function(row) { return Number(row && row.horas) || 0; } },
        { name: "custo_total", getter: function(row) { return Number(row && row.custo) || 0; } },
        { name: "atraso_total", getter: function(row) { return Number(row && row.atraso_min) || 0; } }
      ]
    },
    {
      key: "viagens",
      label: "viagens",
      keyFn: function(row) {
        return [
          row && row.Data_str,
          row && row.Viatura,
          row && row.Obra,
          Number(row && row.V_Efetivas) || 0,
          Number(row && row.custo_dia) || 0
        ].join("|");
      },
      metrics: [
        { name: "total_viagens", getter: function(row) { return Number(row && row.V_Efetivas) || 0; } },
        { name: "custo_total", getter: function(row) { return Number(row && row.custo_dia) || 0; } }
      ]
    },
    {
      key: "deslocacoes",
      label: "deslocacoes",
      keyFn: function(row) {
        return [
          row && row.data,
          row && row.obra,
          row && row.veiculo,
          row && row.motorista,
          row && row.origem,
          Number(row && row.qtd) || 0,
          Number(row && row.custo) || 0
        ].join("|");
      },
      metrics: [
        { name: "qtd_total", getter: function(row) { return Number(row && row.qtd) || 0; } },
        { name: "custo_total", getter: function(row) { return Number(row && row.custo) || 0; } }
      ]
    },
    {
      key: "ferias",
      label: "ferias",
      keyFn: function(row) {
        return [
          row && row.nome,
          row && row.ano_ref_inicio,
          row && row.ano_ref_fim,
          Number(row && row.dias_total) || 0,
          Number(row && row.dias_usados) || 0,
          Number(row && row.dias_disponiveis) || 0
        ].join("|");
      },
      metrics: []
    },
    {
      key: "pessoal_efetivo",
      label: "pessoal_efetivo",
      keyFn: function(row) { return String((row && row.nome) || "").trim(); },
      metrics: []
    },
    {
      key: "materiais_mov",
      label: "materiais_mov",
      keyFn: function(row) { return String((row && row.id_mov) || (row && row.id) || "").trim(); },
      metrics: [
        { name: "qtd_total", getter: function(row) { return Number(row && row.qtd) || Number(row && row.quantidade) || 0; } },
        { name: "custo_total", getter: function(row) { return Number(row && row.custo) || 0; } }
      ]
    },
    {
      key: "legacy_mao_obra",
      label: "legacy_mao_obra",
      keyFn: function(row) {
        return [
          row && row.data,
          row && row.obra,
          row && row.fase,
          Number(row && row.horas) || 0,
          Number(row && row.custo) || 0,
          row && row.origem
        ].join("|");
      },
      metrics: [
        { name: "horas_total", getter: function(row) { return Number(row && row.horas) || 0; } },
        { name: "custo_total", getter: function(row) { return Number(row && row.custo) || 0; } }
      ]
    },
    {
      key: "legacy_materiais",
      label: "legacy_materiais",
      keyFn: function(row) {
        return [
          row && row.data,
          row && row.obra,
          row && row.fase,
          row && row.material,
          Number(row && row.qtd) || Number(row && row.quantidade) || 0,
          Number(row && row.custo) || 0
        ].join("|");
      },
      metrics: [
        { name: "qtd_total", getter: function(row) { return Number(row && row.qtd) || Number(row && row.quantidade) || 0; } },
        { name: "custo_total", getter: function(row) { return Number(row && row.custo) || 0; } }
      ]
    }
  ];

  const items = configs.map(function(config) {
    return buildDashboardParityDatasetItem_(
      config.label,
      rawSheets[config.key],
      rawSupabase[config.key],
      config.keyFn,
      config.metrics
    );
  });

  return {
    matches: items.every(function(item) { return item.matches; }),
    items: items
  };
}

function buildDashboardParityDatasetItem_(label, sheetsRows, supabaseRows, keyFn, metrics) {
  const leftRows = Array.isArray(sheetsRows) ? sheetsRows : [];
  const rightRows = Array.isArray(supabaseRows) ? supabaseRows : [];
  const leftKeyCounts = buildDashboardParityKeyCountMap_(leftRows, keyFn);
  const rightKeyCounts = buildDashboardParityKeyCountMap_(rightRows, keyFn);
  const missingInSupabase = buildDashboardParityMissingKeys_(leftKeyCounts, rightKeyCounts);
  const missingInSheets = buildDashboardParityMissingKeys_(rightKeyCounts, leftKeyCounts);
  const duplicateInSheets = buildDashboardParityDuplicateCountMap_(leftKeyCounts);
  const duplicateInSupabase = buildDashboardParityDuplicateCountMap_(rightKeyCounts);
  const duplicateMismatch = buildDashboardParityDuplicateMismatchKeys_(duplicateInSheets, duplicateInSupabase);
  const metricReport = buildDashboardParityMetricList_(leftRows, rightRows, metrics);
  const countMatches = leftRows.length === rightRows.length;
  const matches = countMatches &&
    missingInSupabase.length === 0 &&
    missingInSheets.length === 0 &&
    duplicateMismatch.length === 0 &&
    metricReport.every(function(item) { return item.matches; });

  return {
    dataset: label,
    matches: matches,
    sheets_rows: leftRows.length,
    supabase_rows: rightRows.length,
    row_diff: rightRows.length - leftRows.length,
    metrics: metricReport,
    missing_in_supabase_count: missingInSupabase.length,
    missing_in_sheets_count: missingInSheets.length,
    duplicate_in_sheets_count: Object.keys(duplicateInSheets).length,
    duplicate_in_supabase_count: Object.keys(duplicateInSupabase).length,
    duplicate_mismatch_count: duplicateMismatch.length,
    duplicate_warning: Object.keys(duplicateInSheets).length > 0 || Object.keys(duplicateInSupabase).length > 0,
    missing_in_supabase_sample: missingInSupabase.slice(0, DASHBOARD_PARITY_SAMPLE_LIMIT),
    missing_in_sheets_sample: missingInSheets.slice(0, DASHBOARD_PARITY_SAMPLE_LIMIT),
    duplicate_mismatch_sample: duplicateMismatch.slice(0, DASHBOARD_PARITY_SAMPLE_LIMIT)
  };
}

function buildDashboardParityObraReport_(sheetsObras, supabaseObras) {
  const allNames = {};
  Object.keys(sheetsObras || {}).forEach(function(nome) { allNames[nome] = true; });
  Object.keys(supabaseObras || {}).forEach(function(nome) { allNames[nome] = true; });

  const items = Object.keys(allNames).sort().map(function(nome) {
    const left = sheetsObras[nome] || {};
    const right = supabaseObras[nome] || {};
    const metrics = buildDashboardParityMetricBlock_(
      left,
      right,
      [
        "custo_mao_obra",
        "custo_deslocacoes",
        "qtd_deslocacoes",
        "custo_materiais",
        "custo_total",
        "horas_total",
        "atraso_total",
        "faltas",
        "dias"
      ]
    ).items;

    return {
      obra: nome,
      matches: metrics.every(function(metric) { return metric.matches; }),
      metrics: metrics
    };
  });

  return {
    matches: items.every(function(item) { return item.matches; }),
    items: items
  };
}

function buildDashboardParityMetricBlock_(leftMap, rightMap, keys) {
  const items = (keys || []).map(function(key) {
    return buildDashboardParityMetric_(key, leftMap ? leftMap[key] : 0, rightMap ? rightMap[key] : 0);
  });
  return {
    matches: items.every(function(item) { return item.matches; }),
    items: items
  };
}

function buildDashboardParityMetricList_(leftRows, rightRows, metrics) {
  return (metrics || []).map(function(metric) {
    const leftValue = leftRows.reduce(function(sum, row) {
      return sum + (Number(metric.getter(row)) || 0);
    }, 0);
    const rightValue = rightRows.reduce(function(sum, row) {
      return sum + (Number(metric.getter(row)) || 0);
    }, 0);
    return buildDashboardParityMetric_(metric.name, leftValue, rightValue);
  });
}

function buildDashboardParityMetric_(name, leftValue, rightValue) {
  const left = roundParityNumber_(leftValue);
  const right = roundParityNumber_(rightValue);
  const diff = roundParityNumber_(right - left);
  return {
    metric: name,
    sheets: left,
    supabase: right,
    diff: diff,
    matches: Math.abs(diff) <= DASHBOARD_PARITY_TOLERANCE
  };
}

function buildDashboardParityKeyCountMap_(rows, keyFn) {
  const map = {};
  (rows || []).forEach(function(row) {
    const key = String(keyFn(row) || "").trim();
    if (!key) return;
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

function buildDashboardParityMissingKeys_(leftMap, rightMap) {
  return Object.keys(leftMap || {}).filter(function(key) {
    return !Object.prototype.hasOwnProperty.call(rightMap || {}, key);
  }).sort();
}

function buildDashboardParityDuplicateCountMap_(map) {
  const duplicates = {};
  Object.keys(map || {}).forEach(function(key) {
    if (Number(map[key]) > 1) duplicates[key] = Number(map[key]);
  });
  return duplicates;
}

function buildDashboardParityDuplicateMismatchKeys_(leftMap, rightMap) {
  const allKeys = {};
  Object.keys(leftMap || {}).forEach(function(key) { allKeys[key] = true; });
  Object.keys(rightMap || {}).forEach(function(key) { allKeys[key] = true; });
  return Object.keys(allKeys).filter(function(key) {
    return Number((leftMap || {})[key] || 0) !== Number((rightMap || {})[key] || 0);
  }).sort();
}

function roundParityNumber_(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function isDashboardMaterialMovServer_(item) {
  const row = item || {};
  if (Object.prototype.hasOwnProperty.call(row, "dashboard_consumo")) {
    return !!row.dashboard_consumo;
  }
  const tipo = String(row.tipo || "").trim().toUpperCase();
  const obra = String(row.obra || "").trim();
  return tipo === "CONSUMO" && !!obra && obra !== "-" && normalizeHeader_(obra) !== "escritorio";
}
