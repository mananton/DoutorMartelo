// ============================================================

// AGREGADORES SERVER-SIDE

// ============================================================



function buildData_(ss) {
  const regSheet = ss.getSheetByName(SHEET_REGISTOS);
  const obraSheet = ss.getSheetByName(SHEET_OBRAS);
  const colabSheet = ss.getSheetByName(SHEET_COLAB);
  const viaSheet = ss.getSheetByName(SHEET_VIAGENS);
  const deslocSheet = ss.getSheetByName(SHEET_DESLOCACOES);
  const feriasSheet = ss.getSheetByName(SHEET_FERIAS);
  const matSheet = ss.getSheetByName(SHEET_MATERIAIS_MOV);
  const legacyMaoObraSheet = ss.getSheetByName(SHEET_LEGACY_MAO_OBRA);

  if (!regSheet) throw new Error("Folha não encontrada: " + SHEET_REGISTOS);

  const obrasInfo = readObras_(obraSheet);
  const colabs = readColabs_(colabSheet);
  const colabRateMap = buildColabRateMap_(colabSheet);

  const registos = readRegistos_(regSheet, colabRateMap);
  const viagens = readViagens_(viaSheet);
  const deslocacoes = readDeslocacoes_(deslocSheet);
  const ferias = readFerias_(feriasSheet);
  const materiaisMov = readMateriaisMov_(matSheet);
  const legacyMaoObra = readLegacyMaoObra_(legacyMaoObraSheet);

  const obraMap = {};
  function ensureObra_(obra) {
    if (!obraMap[obra]) {
      obraMap[obra] = {
        custo_total: 0, horas_total: 0, atraso_total: 0,
        trabalhadores: new Set(), faltas: 0, datas: new Set(),
        daily: {}, weekly: {}, monthly: {},
        workerMap: {}, assidMap: {}, faseMap: {}
      };
    }
    return obraMap[obra];
  }

  for (let i = 0; i < registos.length; i++) {
    const r = registos[i] || {};
    const obra = String(r.obra || "").trim();
    if (!obra) continue;
    const o = ensureObra_(obra);
    const dataStr = String(r.data || "").slice(0, 10);
    const nome = String(r.nome || "").trim();
    const fase = String(r.fase || "").trim();
    const custo = parseFloat(r.custo) || 0;
    const horas = parseFloat(r.horas) || 0;
    const atraso = parseFloat(r.atraso_min) || 0;
    const falta = !!r.falta;
    const dispensado = !!r.dispensado;

    o.custo_total += custo;
    o.horas_total += horas;
    o.atraso_total += atraso;
    if (nome) o.trabalhadores.add(nome);
    if (falta) o.faltas++;
    if (dataStr) o.datas.add(dataStr);

    if (dataStr) {
      if (!o.daily[dataStr]) o.daily[dataStr] = { Custo: 0, Horas: 0, Atraso: 0, Trabalhadores: new Set(), Faltas: 0 };
      o.daily[dataStr].Custo += custo;
      o.daily[dataStr].Horas += horas;
      o.daily[dataStr].Atraso += atraso;
      if (nome) o.daily[dataStr].Trabalhadores.add(nome);
      if (falta) o.daily[dataStr].Faltas++;

      const wk = isoWeek_(dataStr);
      if (!o.weekly[wk]) o.weekly[wk] = { Custo: 0, Horas: 0 };
      o.weekly[wk].Custo += custo;
      o.weekly[wk].Horas += horas;

      const mo = dataStr.slice(0, 7);
      if (!o.monthly[mo]) o.monthly[mo] = { Custo: 0, Horas: 0 };
      o.monthly[mo].Custo += custo;
      o.monthly[mo].Horas += horas;
    }

    if (!o.workerMap[nome]) {
      o.workerMap[nome] = {
        funcao: r.funcao,
        fase: fase,
        Custo: 0,
        Horas: 0,
        Atraso: 0,
        Dias: new Set(),
        Faltas: 0
      };
    }
    o.workerMap[nome].Custo += custo;
    o.workerMap[nome].Horas += horas;
    o.workerMap[nome].Atraso += atraso;
    if (dataStr) o.workerMap[nome].Dias.add(dataStr);
    if (falta) o.workerMap[nome].Faltas++;

    if (!o.assidMap[nome]) o.assidMap[nome] = { funcao: r.funcao, dias: {} };
    if (dataStr && !o.assidMap[nome].dias[dataStr]) {
      o.assidMap[nome].dias[dataStr] = {
        horas: 0,
        falta: false,
        dispensado: false,
        custo: 0,
        atraso_min: 0,
        motivo: "",
        observacao: "",
        fases: []
      };
    }
    if (dataStr) {
      const day = o.assidMap[nome].dias[dataStr];
      day.horas += horas;
      day.custo += custo;
      day.atraso_min += atraso;
      if (falta) day.falta = true;
      if (dispensado) day.dispensado = true;
      if (r.motivo) day.motivo = r.motivo;
      if (r.observacao) day.observacao = r.observacao;
      if (fase && day.fases.indexOf(fase) === -1) day.fases.push(fase);
    }

    if (fase) {
      if (!o.faseMap[fase]) o.faseMap[fase] = { Custo: 0, Horas: 0, Workers: new Set(), Dias: new Set(), Faltas: 0 };
      o.faseMap[fase].Custo += custo;
      o.faseMap[fase].Horas += horas;
      if (nome) o.faseMap[fase].Workers.add(nome);
      if (dataStr) o.faseMap[fase].Dias.add(dataStr);
      if (falta) o.faseMap[fase].Faltas++;
    }
  }

  for (let i = 0; i < legacyMaoObra.length; i++) {
    const r = legacyMaoObra[i] || {};
    const obra = String(r.obra || "").trim();
    if (!obra) continue;

    const o = ensureObra_(obra);
    const dataStr = String(r.data || "").slice(0, 10);
    const fase = String(r.fase || "").trim() || "Sem Fase";
    const custo = parseFloat(r.custo) || 0;
    const horas = parseFloat(r.horas) || 0;

    o.custo_total += custo;
    o.horas_total += horas;
    if (dataStr) o.datas.add(dataStr);

    if (dataStr) {
      if (!o.daily[dataStr]) o.daily[dataStr] = { Custo: 0, Horas: 0, Atraso: 0, Trabalhadores: new Set(), Faltas: 0 };
      o.daily[dataStr].Custo += custo;
      o.daily[dataStr].Horas += horas;

      const wk = isoWeek_(dataStr);
      if (!o.weekly[wk]) o.weekly[wk] = { Custo: 0, Horas: 0 };
      o.weekly[wk].Custo += custo;
      o.weekly[wk].Horas += horas;

      const mo = dataStr.slice(0, 7);
      if (!o.monthly[mo]) o.monthly[mo] = { Custo: 0, Horas: 0 };
      o.monthly[mo].Custo += custo;
      o.monthly[mo].Horas += horas;
    }

    if (fase) {
      if (!o.faseMap[fase]) o.faseMap[fase] = { Custo: 0, Horas: 0, Workers: new Set(), Dias: new Set(), Faltas: 0 };
      o.faseMap[fase].Custo += custo;
      o.faseMap[fase].Horas += horas;
      if (dataStr) o.faseMap[fase].Dias.add(dataStr);
    }
  }

  const deslocMap = {};
  for (let i = 0; i < deslocacoes.length; i++) {
    const d = deslocacoes[i] || {};
    const obra = String(d.obra || "").trim();
    if (!obra) continue;
    if (!deslocMap[obra]) deslocMap[obra] = { custo: 0, qtd: 0 };
    deslocMap[obra].custo += parseFloat(d.custo) || 0;
    deslocMap[obra].qtd += parseFloat(d.qtd) || 0;
  }

  const matPorObra = {};
  const matPorObraFase = {};
  let custoMateriais = 0;
  for (let i = 0; i < (materiaisMov || []).length; i++) {
    const m = materiaisMov[i] || {};
    if (String(m.tipo || "").trim().toUpperCase() !== "CONSUMO") continue;

    const obra = String(m.obra || "").trim();
    if (!obra) continue;

    const fase = String(m.fase || "\u2014").trim() || "\u2014";
    const custo = parseFloat(m.custo) || 0;
    const qtd = parseFloat(m.qtd) || 0;

    custoMateriais += custo;

    if (!matPorObra[obra]) matPorObra[obra] = { custo: 0, qtd: 0 };
    matPorObra[obra].custo += custo;
    matPorObra[obra].qtd += qtd;

    if (!matPorObraFase[obra]) matPorObraFase[obra] = {};
    if (!matPorObraFase[obra][fase]) matPorObraFase[obra][fase] = { custo: 0, qtd: 0 };
    matPorObraFase[obra][fase].custo += custo;
    matPorObraFase[obra][fase].qtd += qtd;
  }

  const obras = {};
  Object.keys(obraMap).sort().forEach(function(nome) {
    const o = obraMap[nome];
    const allDates = Array.from(o.datas).sort();
    obras[nome] = {
      custo_mao_obra: o.custo_total,
      custo_deslocacoes: (deslocMap[nome] || {}).custo || 0,
      qtd_deslocacoes: (deslocMap[nome] || {}).qtd || 0,
      custo_materiais: (matPorObra[nome] || {}).custo || 0,
      custo_total: o.custo_total + ((deslocMap[nome] || {}).custo || 0) + ((matPorObra[nome] || {}).custo || 0),
      horas_total: o.horas_total,
      atraso_total: o.atraso_total,
      trabalhadores: o.trabalhadores.size,
      faltas: o.faltas,
      dias: o.datas.size,
      all_dates: allDates,
      daily: Object.keys(o.daily).sort().map(function(d) {
        return {
          DATA_str: d,
          Custo: o.daily[d].Custo,
          Horas: o.daily[d].Horas,
          Atraso: o.daily[d].Atraso,
          Trabalhadores: o.daily[d].Trabalhadores.size,
          Faltas: o.daily[d].Faltas
        };
      }),
      weekly: Object.keys(o.weekly).sort().map(function(w) {
        return { Semana: w, Custo: o.weekly[w].Custo, Horas: o.weekly[w].Horas };
      }),
      monthly: Object.keys(o.monthly).sort().map(function(m) {
        return { Mes: m, Custo: o.monthly[m].Custo, Horas: o.monthly[m].Horas };
      }),
      workers: Object.keys(o.workerMap).map(function(n) {
        return {
          "Nome (auto)": n,
          "Função (auto)": o.workerMap[n].funcao,
          "Fase": o.workerMap[n].fase,
          Custo: o.workerMap[n].Custo,
          Horas: o.workerMap[n].Horas,
          Atraso: o.workerMap[n].Atraso,
          Dias: o.workerMap[n].Dias.size,
          Faltas: o.workerMap[n].Faltas
        };
      }).sort(function(a, b) { return b.Custo - a.Custo; }),
      assiduidade: Object.keys(o.assidMap).map(function(n) {
        return { nome: n, funcao: o.assidMap[n].funcao, dias: o.assidMap[n].dias };
      }),
      fases: Object.keys(o.faseMap).map(function(f) {
        return {
          Fase: f,
          Custo: o.faseMap[f].Custo,
          Horas: o.faseMap[f].Horas,
          Workers: o.faseMap[f].Workers.size,
          Dias: o.faseMap[f].Dias.size,
          Faltas: o.faseMap[f].Faltas
        };
      }).sort(function(a, b) { return b.Custo - a.Custo; }),
      materiais_fases: matPorObraFase[nome]
        ? Object.keys(matPorObraFase[nome]).map(function(f) {
            return { Fase: f, Custo: matPorObraFase[nome][f].custo, Qtd: matPorObraFase[nome][f].qtd };
          }).sort(function(a, b) { return b.Custo - a.Custo; })
        : []
    };
  });

  const custoMaoObra = registos.reduce(function(s, r) { return s + (parseFloat(r.custo) || 0); }, 0);
  const custoMaoObraLegacy = legacyMaoObra.reduce(function(s, r) { return s + (parseFloat(r.custo) || 0); }, 0);
  const custoDeslocacoes = deslocacoes.reduce(function(s, d) { return s + (parseFloat(d.custo) || 0); }, 0);
  const custoTotal = custoMaoObra + custoMaoObraLegacy + custoDeslocacoes + custoMateriais;
  const horasTotal = registos.reduce(function(s, r) { return s + (parseFloat(r.horas) || 0); }, 0) +
    legacyMaoObra.reduce(function(s, r) { return s + (parseFloat(r.horas) || 0); }, 0);
  const totalAtrasos = registos.reduce(function(s, r) { return s + (parseFloat(r.atraso_min) || 0); }, 0);
  const totalFaltas = registos.filter(function(r) { return !!r.falta; }).length;
  const trabUnicos = new Set(registos.map(function(r) { return r.nome; })).size;
  const custoViagens = viagens.reduce(function(s, v) { return s + (parseFloat(v.custo_dia) || 0); }, 0);
  const totalViagens = viagens.reduce(function(s, v) { return s + (parseFloat(v.v_efetivas) || 0); }, 0);
  const lastUpdate = Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm");

  return {
    global: {
      custo_total: custoTotal,
      custo_mao_obra: custoMaoObra + custoMaoObraLegacy,
      custo_deslocacoes: custoDeslocacoes,
      custo_materiais: custoMateriais,
      horas_total: horasTotal,
      total_atrasos: totalAtrasos,
      obras_ativas: Object.keys(obras).length,
      colaboradores: trabUnicos,
      faltas: totalFaltas,
      custo_viagens: custoViagens,
      total_viagens: totalViagens,
      last_update: lastUpdate
    },
    obras: obras,
    obras_info: obrasInfo,
    colaboradores: colabs,
    viagens: viagens,
    deslocacoes: deslocacoes,
    ferias: ferias,
    materiais_mov: materiaisMov,
    legacy_mao_obra: legacyMaoObra
  };
}

function isoWeek_(dateStr) {
  const d           = new Date(dateStr + "T12:00:00");
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const dayOfYear   = Math.floor((d - startOfYear) / 86400000);
  const weekNum     = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
  return d.getFullYear() + "-S" + String(weekNum).padStart(2, "0");
}
