// ============================================================

// SYNC SUPABASE

// ============================================================



var SYNC_SHEET_CONFIG = {
    "COLABORADORES": {
        endpoint: "/api/sync/colaboradores",
        headerRow: 3,
        mapper: function (row) {
            return { nome: row["Nome"], funcao: row["Função"], ativo: true };
        }
    },
    "REGISTOS_POR_DIA": {
        endpoint: "/api/sync/registos",
        headerRow: 1,
        mapper: function (row) {
            return {
                id_registo: row["ID_Registo"],
                data_registo: syncFormatDate_(row["DATA_REGISTO"]),
                nome: row["Nome"],
                funcao: row["Função"],
                obra: row["Obra"],
                fase: row["Fase de Obra"],
                horas: Number(row["Horas"] || 0),
                atraso_min: Number(row["Atraso_Minutos"] || 0),
                falta: syncToBool_(row["Falta"]),
                motivo: row["Motivo Falta"] || null,
                eur_h: Number(row["€/h"] || 0),
                observacao: row["Observação"] || null,
                dispensado: syncToBool_(row["Dispensado"]),
            };
        }
    },
    "REGISTO_DESLOCACOES": {
        endpoint: "/api/sync/deslocacoes",
        headerRow: 1,
        mapper: function (row) {
            return {
                id_viagem: row["ID_Viagem"],
                data: syncFormatDate_(row["Data"]),
                obra_destino: row["Obra_Destino"],
                destino: row["Destino"],
                veiculo: row["Veiculo"],
                motorista: row["Motorista"],
                origem: row["Origem"],
                quantidade_viagens: Number(row["Quantidade_Viagens"] || 1),
                custo_total: Number(row["Custo_Total"] || 0),
            };
        }
    },
    "MATERIAIS_CAD": {
        endpoint: "/api/sync/materiais-cad",
        headerRow: 1,
        mapper: function (row) {
            return {
                material: row["Material"],
                categoria: row["Categoria"] || null,
                unidade: row["Unidade"],
                fornecedor: row["Fornecedor"] || null,
                nif: row["NIF"] ? String(row["NIF"]).replace(/\.0$/, "") : null,
            };
        }
    },
    "MATERIAIS_MOV": {
        endpoint: "/api/sync/materiais-mov",
        headerRow: 1,
        mapper: function (row) {
            return {
                id_mov: row["ID_Mov"],
                data: syncFormatDate_(row["Data"]),
                tipo: row["Tipo"],
                obra: row["Obra"] || null,
                fase: row["Fase"] || null,
                fornecedor: row["Fornecedor"] || null,
                nif: row["NIF"] ? String(row["NIF"]).replace(/\.0$/, "") : null,
                nr_documento: row["Nº Doc/Fatura"] || null,
                material: row["Material"],
                unidade: row["Unidade"],
                quantidade: Number(row["Quantidade"] || 0),
                custo_unit: Number(row["Custo_Unit"] || 0),
                desconto_1: Number(row["Desconto 1"] || 0),
                desconto_2: Number(row["Desconto 2"] || 0),
                custo_sem_iva: Number(row["Custo_Total Sem IVA"] || 0),
                iva: Number(row["IVA"] || 0),
                custo_com_iva: Number(row["Custo_Total Com IVA"] || 0),
                custo_total: Number(row["Custo_Total Com IVA"] || 0),
            };
        }
    },
    "BOM_FASE": {
        endpoint: "/api/sync/bom-fase",
        headerRow: 1,
        mapper: function (row) {
            return {
                fase: row["Fase"],
                material: row["Material"],
                unidade_material: row["Unidade_Material"],
                qtd_por_unidade_producao: Number(row["Qtd_por_Unidade_Producao"] || 0),
                unidade_producao: row["Unidade_Producao"],
                observacao: row["Observação"] || null,
            };
        }
    },
    "OBRAS_DIMENSOES": {
        endpoint: "/api/sync/obras-dimensoes",
        headerRow: 1,
        mapper: function (row) {
            return {
                obra: row["Obra"],
                fase: row["Fase"],
                unidade_producao: row["Unidade_Producao"],
                qtd_planeada: Number(row["Qtd_Planeada"] || 0),
                observacao: row["Observação"] || null,
            };
        }
    },
    "MEDICOES_FASE": {
        endpoint: "/api/sync/medicoes-fase",
        headerRow: 1,
        mapper: function (row) {
            return {
                data: syncFormatDate_(row["Data"]),
                obra: row["Obra"],
                fase: row["Fase"],
                unidade_producao: row["Unidade_Producao"],
                qtd_executada: Number(row["Qtd_Executada"] || 0),
                observacao: row["Observação"] || null,
            };
        }
    },
    "FORNECEDORES": {
        endpoint: "/api/sync/fornecedores",
        headerRow: 1,
        mapper: function (row) {
            return {
                fornecedor: row["Fornecedor"],
                nif: row["NIF"] ? String(row["NIF"]).replace(/\.0$/, "") : null,
            };
        }
    },
    "FATURAS": {
        endpoint: "/api/sync/faturas",
        headerRow: 1,
        mapper: function (row) {
            return {
                fornecedor: row["Fornecedor"],
                nif: row["NIF"] ? String(row["NIF"]).replace(/\.0$/, "") : null,
                nr_documento: row["Nº Doc/Fatura"] || null,
                data_fatura: syncFormatDate_(row["Data Fatura"]),
                valor: Number(row["Valor"] || 0),
                paga: syncToBool_(row["Paga?"]),
                data_pagamento: syncFormatDate_(row["Data Pagamento"]),
            };
        }
    },
    "STOCK_ATUAL": {
        endpoint: "/api/sync/stock-atual",
        headerRow: 1,
        mapper: function (row) {
            return {
                material: row["Material"],
                unidade: row["Unidade"],
                stock_atual: Number(row["Stock Atual"] || 0),
            };
        }
    },
    "MATRIZ_ROTAS": {
        endpoint: "/api/sync/matriz-rotas",
        headerRow: 1,
        mapper: function (row) {
            return {
                origem: row["Origem"],
                destino: row["Destino"],
                custo_euro: Number(row["Custo_Euro"] || 0),
            };
        }
    },
};

function getSyncConfig_() {
    var props = PropertiesService.getScriptProperties();
    return {
        BACKEND_URL: props.getProperty("BACKEND_URL"),
        API_KEY: props.getProperty("API_KEY"),
    };
}

function syncToSupabase(e) {
    var sheet = SpreadsheetApp.getActiveSheet();
    var name = sheet.getName();
    var config = SYNC_SHEET_CONFIG[name];
    if (!config || !config.endpoint) return;
    var rows = getSyncSheetRows_(sheet, config.headerRow);
    var mapped = [];
    for (var i = 0; i < rows.length; i++) {
        try {
            var item = config.mapper(rows[i]);
            if (item) mapped.push(item);
        } catch (err) {
            Logger.log("Erro a mapear row " + i + ": " + err);
        }
    }
    if (mapped.length === 0) return;
    var result = syncSendToBackend_(config.endpoint, mapped);
    Logger.log("Sync " + name + ": " + JSON.stringify(result));
}

function syncAll() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var results = [];
    for (var name in SYNC_SHEET_CONFIG) {
        var config = SYNC_SHEET_CONFIG[name];
        if (!config || !config.endpoint) continue;
        var sheet = ss.getSheetByName(name);
        if (!sheet) continue;
        var rows = getSyncSheetRows_(sheet, config.headerRow);
        var mapped = [];
        for (var i = 0; i < rows.length; i++) {
            try {
                var item = config.mapper(rows[i]);
                if (item) mapped.push(item);
            } catch (err) { }
        }
        if (mapped.length > 0) {
            var result = syncSendToBackend_(config.endpoint, mapped);
            results.push(name + ": " + (result.upserted || 0) + " upserted");
        } else {
            results.push(name + ": 0 rows");
        }
    }
    SpreadsheetApp.getUi().alert("Sync concluído:\n\n" + results.join("\n"));
}

function getSyncSheetRows_(sheet, headerRow) {
    var data = sheet.getDataRange().getValues();
    if (data.length <= headerRow) return [];
    var headers = data[headerRow - 1];
    var rows = [];
    for (var i = headerRow; i < data.length; i++) {
        var row = data[i];
        var hasData = false;
        for (var j = 0; j < row.length; j++) {
            if (row[j] !== "" && row[j] !== null && row[j] !== undefined) {
                hasData = true; break;
            }
        }
        if (!hasData) continue;
        var obj = {};
        for (var j = 0; j < headers.length; j++) {
            if (headers[j]) obj[headers[j]] = row[j];
        }
        rows.push(obj);
    }
    return rows;
}

function syncSendToBackend_(endpoint, rows) {
    var cfg = getSyncConfig_();
    if (!cfg.BACKEND_URL || !cfg.API_KEY) {
        Logger.log("ERRO: BACKEND_URL ou API_KEY não configurados");
        return { error: "config missing" };
    }
    var url = cfg.BACKEND_URL + endpoint;
    try {
        var response = UrlFetchApp.fetch(url, {
            method: "post",
            contentType: "application/json",
            headers: { "X-API-KEY": cfg.API_KEY },
            payload: JSON.stringify({ rows: rows }),
            muteHttpExceptions: true,
        });
        var code = response.getResponseCode();
        var body = response.getContentText();
        if (code >= 200 && code < 300) {
            return JSON.parse(body);
        } else {
            Logger.log("ERRO sync " + endpoint + ": HTTP " + code + " — " + body);
            return { error: "HTTP " + code, body: body };
        }
    } catch (e) {
        Logger.log("ERRO sync " + endpoint + ": " + e.message);
        return { error: e.message };
    }
}

function syncFormatDate_(val) {
    if (!val) return null;
    if (val instanceof Date) {
        var y = val.getFullYear();
        var m = ("0" + (val.getMonth() + 1)).slice(-2);
        var d = ("0" + val.getDate()).slice(-2);
        return y + "-" + m + "-" + d;
    }
    return String(val);
}

function syncToBool_(val) {
    if (typeof val === "boolean") return val;
    if (typeof val === "string") return val.toLowerCase() === "true" || val === "1" || val.toLowerCase() === "sim";
    if (typeof val === "number") return val !== 0;
    return false;
}
