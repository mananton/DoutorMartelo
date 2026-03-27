// ============================================================
// DASHBOARD RAW V2 - LEITURA SUPABASE
// ============================================================

const DASHBOARD_DATA_SOURCE_PROPERTY = "DASHBOARD_DATA_SOURCE";
const SUPABASE_URL_PROPERTY = "SUPABASE_URL";
const SUPABASE_SERVICE_ROLE_KEY_PROPERTY = "SUPABASE_SERVICE_ROLE_KEY";
const SUPABASE_SCHEMA_PROPERTY = "SUPABASE_SCHEMA";
const SUPABASE_DEFAULT_SCHEMA = "public";
const SUPABASE_PAGE_SIZE = 1000;

const DASHBOARD_SUPABASE_TABLES_ = {
  obras_info: {
    table: "obras_sync",
    orderBy: "obra_id",
    select: ["obra_id", "local_id", "ativa"]
  },
  colaboradores: {
    table: "colaboradores_sync",
    orderBy: "nome",
    select: ["nome", "funcao", "eur_h"]
  },
  registos: {
    table: "registos_sync",
    orderBy: "id_registo",
    select: [
      "id_registo",
      "data_registo",
      "nome",
      "funcao",
      "obra",
      "fase",
      "horas",
      "atraso_min",
      "falta",
      "motivo",
      "eur_h",
      "observacao",
      "dispensado"
    ]
  },
  viagens: {
    table: "viagens_sync",
    orderBy: "source_key",
    select: [
      "source_key",
      "data",
      "dia_sem",
      "v_padrao",
      "v_real",
      "v_efetivas",
      "viatura",
      "obra",
      "custo_via",
      "custo_dia"
    ]
  },
  deslocacoes: {
    table: "deslocacoes_sync",
    orderBy: "id_viagem",
    select: [
      "id_viagem",
      "data",
      "obra_destino",
      "destino",
      "veiculo",
      "motorista",
      "origem",
      "quantidade_viagens",
      "custo_total"
    ]
  },
  ferias: {
    table: "ferias_sync",
    orderBy: "source_key",
    select: [
      "source_key",
      "nome",
      "data_admissao",
      "dias_total",
      "ano_ref_inicio",
      "ano_ref_fim",
      "dias_usados",
      "dias_disponiveis"
    ]
  },
  pessoal_efetivo: {
    table: "pessoal_efetivo",
    orderBy: "nome",
    select: [
      "nome",
      "nacionalidade",
      "data_nascimento",
      "morada",
      "telefone",
      "email",
      "foto_url",
      "data_inicio_contrato",
      "data_termino_contrato",
      "carta_conducao",
      "categorias_carta",
      "cam",
      "numero_carta",
      "cartao_cidadao",
      "cartao_residencia",
      "passaporte",
      "visto",
      "certificacoes",
      "ocorrencias"
    ]
  },
  materiais_mov: {
    table: "materiais_mov",
    orderBy: "id_mov",
    select: [
      "id_mov",
      "data",
      "tipo",
      "id_item",
      "item_oficial",
      "material",
      "unidade",
      "quantidade",
      "custo_unit",
      "custo_total_sem_iva",
      "iva",
      "custo_total_com_iva",
      "custo_total",
      "obra",
      "fase",
      "fornecedor",
      "nif",
      "nr_documento",
      "observacoes"
    ]
  },
  legacy_mao_obra: {
    table: "legacy_mao_obra_sync",
    orderBy: "source_key",
    select: ["source_key", "data", "obra", "fase", "horas", "custo_dia", "origem", "nota"]
  },
  legacy_materiais: {
    table: "legacy_materiais_sync",
    orderBy: "source_key",
    select: [
      "source_key",
      "data",
      "obra",
      "fase",
      "material",
      "unidade",
      "quantidade",
      "custo_unit",
      "custo_total_sem_iva",
      "iva",
      "custo_total_com_iva",
      "custo_total"
    ]
  }
};

function getDashboardSourcePreference_(options) {
  const opts = options || {};
  const explicit = String(opts.source || "").trim().toLowerCase();
  if (explicit === "sheets" || explicit === "supabase" || explicit === "auto") return explicit;

  const stored = String(PropertiesService.getScriptProperties().getProperty(DASHBOARD_DATA_SOURCE_PROPERTY) || "")
    .trim()
    .toLowerCase();
  if (stored === "sheets" || stored === "supabase" || stored === "auto") return stored;

  return "sheets";
}

function buildRawDataForDashboard_(ss, options) {
  const sourcePreference = getDashboardSourcePreference_(options);
  if (sourcePreference === "supabase") {
    return assertRawV2PayloadContract_(buildRawDataFromSupabase_());
  }

  if (sourcePreference === "auto") {
    try {
      return assertRawV2PayloadContract_(buildRawDataFromSupabase_());
    } catch (err) {
      Logger.log("Dashboard Supabase fallback para Sheets: " + err.message);
    }
  }

  return assertRawV2PayloadContract_(buildRawData_(ss));
}

function getSupabaseDashboardConfig_() {
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty(SUPABASE_URL_PROPERTY) || "").trim();
  const serviceRoleKey = String(props.getProperty(SUPABASE_SERVICE_ROLE_KEY_PROPERTY) || "").trim();
  const schema = String(props.getProperty(SUPABASE_SCHEMA_PROPERTY) || SUPABASE_DEFAULT_SCHEMA).trim() || SUPABASE_DEFAULT_SCHEMA;

  if (!url || !serviceRoleKey) {
    throw new Error("Leitura da dashboard via Supabase nao configurada nas Script Properties.");
  }

  return {
    baseUrl: url.replace(/\/+$/, "") + "/rest/v1",
    serviceRoleKey: serviceRoleKey,
    schema: schema
  };
}

function buildRawDataFromSupabase_() {
  const config = getSupabaseDashboardConfig_();

  const colaboradoresRows = fetchSupabaseTableAll_(config, DASHBOARD_SUPABASE_TABLES_.colaboradores);
  const colaboradores = mapSupabaseColaboradores_(colaboradoresRows);
  const colabRateMap = buildSupabaseColabRateMap_(colaboradores);

  const payload = createRawV2Payload_({
    payload_source: "supabase",
    generated_at: Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm"),
    diagnostics: createDataQualityDiagnostics_(),
    obras_info: mapSupabaseObras_(fetchSupabaseTableAll_(config, DASHBOARD_SUPABASE_TABLES_.obras_info)),
    colaboradores: colaboradores,
    registos: mapSupabaseRegistos_(fetchSupabaseTableAll_(config, DASHBOARD_SUPABASE_TABLES_.registos), colabRateMap),
    viagens: mapSupabaseViagens_(fetchSupabaseTableAll_(config, DASHBOARD_SUPABASE_TABLES_.viagens)),
    deslocacoes: mapSupabaseDeslocacoes_(fetchSupabaseTableAll_(config, DASHBOARD_SUPABASE_TABLES_.deslocacoes)),
    ferias: mapSupabaseFerias_(fetchSupabaseTableAll_(config, DASHBOARD_SUPABASE_TABLES_.ferias)),
    pessoal_efetivo: mapSupabasePessoalEfetivo_(fetchSupabaseTableAll_(config, DASHBOARD_SUPABASE_TABLES_.pessoal_efetivo)),
    materiais_mov: mapSupabaseMateriaisMov_(fetchSupabaseTableAll_(config, DASHBOARD_SUPABASE_TABLES_.materiais_mov)),
    legacy_mao_obra: mapSupabaseLegacyMaoObra_(fetchSupabaseTableAll_(config, DASHBOARD_SUPABASE_TABLES_.legacy_mao_obra)),
    legacy_materiais: mapSupabaseLegacyMateriais_(fetchSupabaseTableAll_(config, DASHBOARD_SUPABASE_TABLES_.legacy_materiais))
  });

  return payload;
}

function fetchSupabaseTableAll_(config, tableConfig) {
  const out = [];
  let offset = 0;

  while (true) {
    const page = fetchSupabaseTablePage_(config, tableConfig, offset, SUPABASE_PAGE_SIZE);
    if (!page.length) break;
    Array.prototype.push.apply(out, page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
    offset += page.length;
  }

  return out;
}

function fetchSupabaseTablePage_(config, tableConfig, offset, limit) {
  const selectClause = encodeURIComponent(tableConfig.select.join(","));
  const query = [
    "select=" + selectClause,
    "limit=" + encodeURIComponent(String(limit)),
    "offset=" + encodeURIComponent(String(offset))
  ];
  if (tableConfig.orderBy) {
    query.push("order=" + encodeURIComponent(tableConfig.orderBy + ".asc"));
  }

  const response = UrlFetchApp.fetch(
    config.baseUrl + "/" + tableConfig.table + "?" + query.join("&"),
    {
      method: "get",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: "Bearer " + config.serviceRoleKey,
        "Accept-Profile": config.schema,
        "Content-Profile": config.schema
      },
      muteHttpExceptions: true
    }
  );

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status >= 300) {
    throw new Error("Supabase dashboard read falhou em " + tableConfig.table + ": HTTP " + status + " | " + body);
  }

  const parsed = JSON.parse(body || "[]");
  return Array.isArray(parsed) ? parsed : [];
}

function buildSupabaseColabRateMap_(rows) {
  const map = {};
  (rows || []).forEach(function(row) {
    const nome = String(row.Nome || "").trim();
    if (!nome) return;
    map[nome] = Number(row.Eur_h) || 0;
  });
  return map;
}

function mapSupabaseObras_(rows) {
  return (rows || [])
    .map(function(row) {
      return {
        Obra_ID: supabaseText_(row.obra_id),
        Local_ID: supabaseText_(row.local_id),
        Ativa: supabaseText_(row.ativa)
      };
    })
    .filter(function(row) { return !!row.Obra_ID; });
}

function mapSupabaseColaboradores_(rows) {
  return (rows || [])
    .map(function(row) {
      return {
        Nome: supabaseText_(row.nome),
        Funcao: supabaseText_(row.funcao),
        Eur_h: supabaseNumber_(row.eur_h)
      };
    })
    .filter(function(row) { return !!row.Nome; });
}

function mapSupabaseRegistos_(rows, colabRateMap) {
  return (rows || [])
    .map(function(row) {
      const nome = supabaseText_(row.nome);
      const obra = supabaseText_(row.obra);
      const horas = supabaseNumber_(row.horas);
      const atrasoMin = supabaseNumber_(row.atraso_min);
      const falta = supabaseBool_(row.falta);
      let rate = supabaseNumber_(row.eur_h);
      if (!rate && colabRateMap && Object.prototype.hasOwnProperty.call(colabRateMap, nome)) {
        rate = supabaseNumber_(colabRateMap[nome]);
      }
      const horasEfetivas = Math.max(0, horas - (atrasoMin / 60));
      const hasStoredCusto = row && Object.prototype.hasOwnProperty.call(row, "custo") && row.custo !== null && row.custo !== "";
      const custo = hasStoredCusto
        ? supabaseNumber_(row.custo)
        : (falta ? 0 : (horasEfetivas * rate));

      return {
        data: supabaseDate_(row.data_registo),
        nome: nome,
        funcao: supabaseText_(row.funcao) || "-",
        obra: obra,
        fase: supabaseText_(row.fase) || "Sem Fase",
        horas: horas,
        atraso_min: atrasoMin,
        falta: falta,
        motivo: supabaseText_(row.motivo),
        observacao: supabaseText_(row.observacao),
        dispensado: supabaseBool_(row.dispensado),
        eur_h: rate,
        custo: custo
      };
    })
    .filter(function(row) { return !!row.obra; });
}

function mapSupabaseViagens_(rows) {
  return (rows || [])
    .map(function(row) {
      const data = supabaseDate_(row.data);
      if (!data) return null;
      const vEfetivas = supabaseNumber_(row.v_efetivas);
      const vReal = row && Object.prototype.hasOwnProperty.call(row, "v_real") && row.v_real !== null && row.v_real !== ""
        ? supabaseNumber_(row.v_real)
        : null;

      return {
        Data_str: data,
        DiaSem: supabaseInt_(row.dia_sem),
        V_Padrao: supabaseNumber_(row.v_padrao),
        V_Real: vReal,
        V_Efetivas: vEfetivas,
        Viatura: supabaseText_(row.viatura),
        Obra: supabaseText_(row.obra) || null,
        Custo_Via: supabaseNumber_(row.custo_via),
        custo_dia: supabaseNumber_(row.custo_dia),
        v_efetivas: vEfetivas
      };
    })
    .filter(function(row) { return !!row; });
}

function mapSupabaseDeslocacoes_(rows) {
  return (rows || [])
    .map(function(row) {
      const obra = supabaseText_(row.destino) || supabaseText_(row.obra_destino);
      if (!obra) return null;
      return {
        data: supabaseDate_(row.data),
        obra: obra,
        veiculo: supabaseText_(row.veiculo),
        motorista: supabaseText_(row.motorista),
        origem: supabaseText_(row.origem),
        qtd: supabaseNumber_(row.quantidade_viagens) || 0,
        custo: supabaseNumber_(row.custo_total)
      };
    })
    .filter(function(row) { return !!row; });
}

function mapSupabaseFerias_(rows) {
  return (rows || [])
    .map(function(row) {
      const nome = supabaseText_(row.nome);
      if (!nome) return null;
      return {
        nome: nome,
        data_admissao: supabaseDate_(row.data_admissao),
        dias_total: supabaseInt_(row.dias_total),
        ano_ref_inicio: supabaseDate_(row.ano_ref_inicio),
        ano_ref_fim: supabaseDate_(row.ano_ref_fim),
        dias_usados: supabaseInt_(row.dias_usados),
        dias_disponiveis: supabaseInt_(row.dias_disponiveis)
      };
    })
    .filter(function(row) { return !!row; });
}

function mapSupabasePessoalEfetivo_(rows) {
  return (rows || [])
    .map(function(row) {
      const nome = supabaseText_(row.nome);
      if (!nome) return null;
      return {
        nome: nome,
        nacionalidade: supabaseText_(row.nacionalidade),
        data_nascimento: supabaseDate_(row.data_nascimento),
        morada: supabaseText_(row.morada),
        telefone: supabaseText_(row.telefone),
        email: supabaseText_(row.email),
        foto_url: supabaseText_(row.foto_url),
        data_inicio_contrato: supabaseDate_(row.data_inicio_contrato),
        data_termino_contrato: supabaseDate_(row.data_termino_contrato),
        carta_conducao: supabaseText_(row.carta_conducao),
        categorias_carta: supabaseText_(row.categorias_carta),
        cam: supabaseText_(row.cam),
        numero_carta: supabaseText_(row.numero_carta),
        cartao_cidadao: supabaseText_(row.cartao_cidadao),
        cartao_residencia: supabaseText_(row.cartao_residencia),
        passaporte: supabaseText_(row.passaporte),
        visto: supabaseText_(row.visto),
        certificacoes: supabaseText_(row.certificacoes),
        ocorrencias: supabaseText_(row.ocorrencias)
      };
    })
    .filter(function(row) { return !!row; });
}

function mapSupabaseMateriaisMov_(rows) {
  return (rows || [])
    .map(function(row) {
      const idMov = supabaseText_(row.id_mov);
      if (!idMov) return null;
      const tipo = supabaseText_(row.tipo).toUpperCase() || "CONSUMO";
      const obra = supabaseText_(row.obra);
      const normalizedObra = normalizeHeader_(obra);
      const qtd = supabaseNumber_(row.quantidade);
      const custoComIva = supabaseNumber_(row.custo_total_com_iva);
      const custoSemIva = supabaseNumber_(row.custo_total_sem_iva);
      let custoTotal = 0;
      if (supabaseHasField_(row, "custo_total_com_iva")) custoTotal = custoComIva;
      else if (supabaseHasField_(row, "custo_total")) custoTotal = supabaseNumber_(row.custo_total);
      else if (supabaseHasField_(row, "custo_total_sem_iva")) custoTotal = custoSemIva;
      else custoTotal = qtd * supabaseNumber_(row.custo_unit);
      const dashboardConsumo = tipo === "CONSUMO" && !!obra && obra !== "-" && normalizedObra !== "escritorio";
      const material = supabaseText_(row.material) || supabaseText_(row.item_oficial) || supabaseText_(row.id_item) || "\u2014";
      const observacao = supabaseText_(row.observacoes);

      return {
        id_mov: idMov,
        id: idMov,
        data: supabaseDate_(row.data),
        tipo: tipo,
        obra: obra,
        fase: supabaseText_(row.fase),
        id_item: supabaseText_(row.id_item),
        item_oficial: supabaseText_(row.item_oficial),
        material: material,
        unidade: supabaseText_(row.unidade),
        quantidade: qtd,
        qtd: qtd,
        custo_unit: supabaseNumber_(row.custo_unit),
        custo_total: custoTotal,
        custo_total_com_iva: supabaseHasField_(row, "custo_total_com_iva") ? custoComIva : custoTotal,
        custo_total_sem_iva: supabaseHasField_(row, "custo_total_sem_iva") ? custoSemIva : 0,
        custo: custoTotal,
        iva: supabaseNumber_(row.iva),
        desconto_1: 0,
        desconto_2: 0,
        fornecedor: supabaseText_(row.fornecedor),
        nif: supabaseText_(row.nif),
        entrega: "",
        doc_fatura: supabaseText_(row.nr_documento),
        lote: "",
        observacao: observacao,
        observacoes: observacao,
        dashboard_consumo: dashboardConsumo,
        source: "materiais_mov"
      };
    })
    .filter(function(row) { return !!row; });
}

function mapSupabaseLegacyMaoObra_(rows) {
  return (rows || [])
    .map(function(row) {
      const obra = supabaseText_(row.obra);
      if (!obra) return null;
      return {
        data: supabaseDate_(row.data),
        obra: obra,
        fase: supabaseText_(row.fase) || "Sem Fase",
        horas: supabaseNumber_(row.horas),
        custo: supabaseNumber_(row.custo_dia),
        origem: supabaseText_(row.origem) || "legacy",
        nota: supabaseText_(row.nota)
      };
    })
    .filter(function(row) { return !!row; });
}

function mapSupabaseLegacyMateriais_(rows) {
  return (rows || [])
    .map(function(row) {
      const obra = supabaseText_(row.obra);
      const material = supabaseText_(row.material);
      if (!obra || !material) return null;
      const quantidade = supabaseNumber_(row.quantidade);
      const custoComIva = supabaseNumber_(row.custo_total_com_iva);
      const custoSemIva = supabaseNumber_(row.custo_total_sem_iva);
      const custoTotal = custoComIva || supabaseNumber_(row.custo_total) || custoSemIva || 0;
      return {
        data: supabaseDate_(row.data),
        obra: obra,
        fase: supabaseText_(row.fase) || "Sem Fase",
        material: material,
        unidade: supabaseText_(row.unidade),
        quantidade: quantidade,
        custo_unit: supabaseNumber_(row.custo_unit),
        custo_total_sem_iva: custoSemIva,
        iva: supabaseNumber_(row.iva),
        custo_total_com_iva: custoComIva || custoTotal,
        custo_total: custoTotal,
        source: "legacy_materiais",
        qtd: quantidade,
        custo: custoTotal
      };
    })
    .filter(function(row) { return !!row; });
}

function supabaseText_(value) {
  return String(value || "").trim();
}

function supabaseNumber_(value) {
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  const text = String(value || "").trim();
  if (!text) return 0;
  const normalized = text
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

function supabaseInt_(value) {
  return parseInt(String(supabaseNumber_(value)), 10) || 0;
}

function supabaseBool_(value) {
  return value === true || String(value || "").trim().toLowerCase() === "true";
}

function supabaseHasField_(row, key) {
  return !!row && Object.prototype.hasOwnProperty.call(row, key);
}

function supabaseDate_(value) {
  if (!value) return "";
  if (value instanceof Date) return Utilities.formatDate(value, TZ, "yyyy-MM-dd");
  const text = String(value).trim();
  if (!text) return "";
  return text.slice(0, 10);
}
