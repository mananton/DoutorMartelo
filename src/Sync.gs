// ============================================================
// SYNC SUPABASE
// ============================================================

var SYNC_PENDING_JOBS_KEY = "SYNC_PENDING_JOBS";
var SYNC_FAILED_JOBS_KEY = "SYNC_FAILED_JOBS";
var SYNC_SPREADSHEET_ID_KEY = "SYNC_SPREADSHEET_ID";
var SYNC_RETRY_TRIGGER_HANDLER = "retryPendingSupabaseSync_";
var SYNC_RETRY_INTERVAL_MINUTES = 10;
var SYNC_MAX_AUTO_RETRIES = 6;

var SYNC_SHEET_CONFIG = {
    "PESSOAL_EFETIVO": {
        endpoint: "/api/sync/pessoal-efetivo",
        headerRow: 1,
        dedupeKey: function(item) {
            return item.nome;
        },
        mapper: function(row) {
            var nome = syncReadString_(row, ["Nome"]);
            if (!nome) return null;
            return {
                nome: nome,
                nacionalidade: syncReadString_(row, ["Nacionalidade"]) || null,
                data_nascimento: syncFormatDate_(syncReadCell_(row, ["Data Nascimento"])) || null,
                morada: syncReadString_(row, ["Morada"]) || null,
                telefone: syncReadString_(row, ["Telefone"]) || null,
                email: syncReadString_(row, ["email", "Email"]) || null,
                data_inicio_contrato: syncFormatDate_(syncReadCell_(row, ["Dta Inicio Contrato", "Data Inicio Contrato"])) || null,
                data_termino_contrato: syncFormatDate_(syncReadCell_(row, ["Data Termino Contrato"])) || null,
                carta_conducao: syncReadString_(row, ["Carta Condução", "Carta Conducao"]) || null,
                categorias_carta: syncReadString_(row, ["Categorias"]) || null,
                cam: syncReadString_(row, ["CAM"]) || null,
                numero_carta: syncReadString_(row, ["Nº Carta", "N Carta", "Numero Carta"]) || null,
                cartao_cidadao: syncReadString_(row, ["Cartão de Cidadão", "Cartao de Cidadao"]) || null,
                cartao_residencia: syncReadString_(row, ["Cartão Residencia", "Cartao Residencia"]) || null,
                passaporte: syncReadString_(row, ["Passaporte"]) || null,
                visto: syncReadString_(row, ["Visto"]) || null,
                certificacoes: syncReadString_(row, ["Certificações", "Certificacoes"]) || null,
                ocorrencias: syncReadString_(row, ["Ocorrências", "Ocorrencias"]) || null
            };
        }
    },
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
            var sourceId = String(row["ID_Registo"] || "").trim();
            var item = {
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
                dispensado: syncToBool_(row["Dispensado"])
            };
            if (sourceId) item.id_registo = sourceId;
            return item;
        }
    },
    "REGISTO_DESLOCACOES": {
        endpoint: "/api/sync/deslocacoes",
        headerRow: 1,
        mapper: function (row) {
            var sourceId = String(row["ID_Viagem"] || "").trim();
            var item = {
                data: syncFormatDate_(row["Data"]),
                obra_destino: row["Obra_Destino"],
                destino: row["Destino"],
                veiculo: row["Veiculo"],
                motorista: row["Motorista"],
                origem: row["Origem"],
                quantidade_viagens: Number(row["Quantidade_Viagens"] || 1),
                custo_total: Number(row["Custo_Total"] || 0)
            };
            if (sourceId) item.id_viagem = sourceId;
            return item;
        }
    },
    "LEGACY_MAO_OBRA": {
        endpoint: "/api/sync/legacy-mao-obra",
        headerRow: 1,
        dedupeKey: function (item) {
            return item.source_key;
        },
        mapper: function (row) {
            var sourceKey = syncBuildLegacyMaoObraKey_(row);
            return {
                source_key: sourceKey,
                data: syncFormatDate_(row["Data"]),
                obra: row["Obra"],
                fase: row["Fase de Obra"] || row["Fase"] || null,
                horas: Number(row["Horas"] || 0),
                custo_dia: Number(row["Custo Dia"] || row["Custo_Dia"] || 0),
                origem: row["Origem"] || "legacy",
                nota: row["Nota"] || row["Observacao"] || row["Observação"] || null
            };
        }
    },
    "MATERIAIS_CAD": {
        endpoint: "/api/sync/materiais-cad",
        headerRow: 1,
        dedupeKey: function (item) {
            return item.source_key;
        },
        mapper: function (row) {
            return {
                source_key: syncBuildCompositeKey_([
                    "cad",
                    syncReadString_(row, ["ID_Item", "ID Item"]),
                    syncReadString_(row, ["Fornecedor"]),
                    syncReadString_(row, ["Descricao_Original", "Descrição_Original", "Descricao Original"]),
                    String(row.__sheet_row_num || "")
                ]),
                id_item: syncReadString_(row, ["ID_Item", "ID Item"]) || null,
                fornecedor: syncReadString_(row, ["Fornecedor"]) || null,
                descricao_original: syncReadString_(row, ["Descricao_Original", "Descrição_Original", "Descricao Original"]) || null,
                item_oficial: syncReadString_(row, ["Item_Oficial", "Item Oficial"]) || null,
                natureza: syncReadString_(row, ["Natureza"]) || null,
                unidade: syncReadString_(row, ["Unidade"]) || null,
                observacoes: syncReadString_(row, ["Observacoes", "Observação", "Observacao"]) || null,
                estado_cadastro: syncReadString_(row, ["Estado_Cadastro", "Estado Cadastro"]) || null,
                sheet_row_num: Number(row.__sheet_row_num || 0)
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
                custo_total: Number(row["Custo_Total Com IVA"] || 0)
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
                observacao: row["Observação"] || null
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
                observacao: row["Observação"] || null
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
                observacao: row["Observação"] || null
            };
        }
    },
    "FORNECEDORES": {
        endpoint: "/api/sync/fornecedores",
        headerRow: 1,
        mapper: function (row) {
            return {
                fornecedor: row["Fornecedor"],
                nif: row["NIF"] ? String(row["NIF"]).replace(/\.0$/, "") : null
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
                data_pagamento: syncFormatDate_(row["Data Pagamento"])
            };
        }
    },
    "FATURAS_ITENS": {
        endpoint: "/api/sync/faturas-itens",
        headerRow: 1,
        dedupeKey: function (item) {
            return item.id_item_fatura || item.source_key;
        },
        mapper: function (row) {
            return {
                source_key: syncBuildCompositeKey_([
                    "fit",
                    syncReadString_(row, ["ID_Item_Fatura", "ID Item Fatura"]),
                    String(row.__sheet_row_num || "")
                ]),
                id_item_fatura: syncReadString_(row, ["ID_Item_Fatura", "ID Item Fatura"]) || null,
                id_fatura: syncReadString_(row, ["ID_Fatura", "ID Fatura"]) || null,
                fornecedor: syncReadString_(row, ["Fornecedor"]) || null,
                nif: syncReadNormalizedNif_(syncReadCell_(row, ["NIF"])),
                nr_documento: syncReadString_(row, ["Nº Doc/Fatura", "NÂº Doc/Fatura", "N Doc/Fatura", "Doc Fatura"]) || null,
                data_fatura: syncFormatDate_(syncReadCell_(row, ["Data Fatura", "Data"])),
                descricao_original: syncReadString_(row, ["Descricao_Original", "Descrição_Original", "Descricao Original"]) || null,
                id_item: syncReadString_(row, ["ID_Item", "ID Item"]) || null,
                item_oficial: syncReadString_(row, ["Item_Oficial", "Item Oficial"]) || null,
                unidade: syncReadString_(row, ["Unidade"]) || null,
                quantidade: syncReadNumber_(row, ["Quantidade"]),
                custo_unit: syncReadNumber_(row, ["Custo_Unit", "Custo Unit"]),
                desconto_1: syncReadNumber_(row, ["Desconto 1", "Desconto_1"]),
                desconto_2: syncReadNumber_(row, ["Desconto 2", "Desconto_2"]),
                custo_total_sem_iva: syncReadNumber_(row, ["Custo_Total Sem IVA", "Custo Total Sem IVA"]),
                iva: syncReadNumber_(row, ["IVA"]),
                custo_total_com_iva: syncReadNumber_(row, ["Custo_Total Com IVA", "Custo Total Com IVA"]),
                destino: syncReadString_(row, ["Destino"]) || null,
                obra: syncReadString_(row, ["Obra"]) || null,
                fase: syncReadString_(row, ["Fase"]) || null,
                observacoes: syncReadString_(row, ["Observacoes", "Observação", "Observacao"]) || null,
                estado_mapeamento: syncReadString_(row, ["Estado_Mapeamento", "Estado Mapeamento"]) || null,
                sugestao_alias: syncReadString_(row, ["Sugestao_Alias", "Sugestão_Alias", "Sugestao Alias"]) || null,
                sheet_row_num: Number(row.__sheet_row_num || 0)
            };
        }
    },
    "AFETACOES_OBRA": {
        endpoint: "/api/sync/afetacoes-obra",
        headerRow: 1,
        dedupeKey: function (item) {
            return item.id_afetacao || item.source_key;
        },
        mapper: function (row) {
            return {
                source_key: syncBuildCompositeKey_([
                    "afo",
                    syncReadString_(row, ["ID_Afetacao", "ID Afetacao"]),
                    String(row.__sheet_row_num || "")
                ]),
                id_afetacao: syncReadString_(row, ["ID_Afetacao", "ID Afetacao"]) || null,
                origem: syncReadString_(row, ["Origem"]) || null,
                source_id: syncReadString_(row, ["Source_ID", "Source ID", "ID_Source", "ID Source"]) || null,
                data: syncFormatDate_(syncReadCell_(row, ["Data"])),
                id_item: syncReadString_(row, ["ID_Item", "ID Item"]) || null,
                item_oficial: syncReadString_(row, ["Item_Oficial", "Item Oficial"]) || null,
                natureza: syncReadString_(row, ["Natureza"]) || null,
                quantidade: syncReadNumber_(row, ["Quantidade"]),
                unidade: syncReadString_(row, ["Unidade"]) || null,
                custo_unit: syncReadNumber_(row, ["Custo_Unit", "Custo Unit"]),
                custo_total: syncReadNumber_(row, ["Custo_Total", "Custo Total"]),
                custo_total_sem_iva: syncReadNumber_(row, ["Custo_Total Sem IVA", "Custo Total Sem IVA"]),
                iva: syncReadNumber_(row, ["IVA"]),
                custo_total_com_iva: syncReadNumber_(row, ["Custo_Total Com IVA", "Custo Total Com IVA"]),
                obra: syncReadString_(row, ["Obra"]) || null,
                fase: syncReadString_(row, ["Fase"]) || null,
                fornecedor: syncReadString_(row, ["Fornecedor"]) || null,
                nif: syncReadNormalizedNif_(syncReadCell_(row, ["NIF"])),
                nr_documento: syncReadString_(row, ["Nº Doc/Fatura", "NÂº Doc/Fatura", "N Doc/Fatura", "Doc Fatura"]) || null,
                processar: syncToBool_(syncReadCell_(row, ["Processar", "Confirmar", "Gerar_Movimento", "Gerar Movimento"])),
                estado: syncReadString_(row, ["Estado"]) || null,
                observacoes: syncReadString_(row, ["Observacoes", "Observação", "Observacao", "Obs"]) || null,
                sheet_row_num: Number(row.__sheet_row_num || 0)
            };
        }
    },
    "STOCK_ATUAL": {
        endpoint: "/api/sync/stock-atual",
        headerRow: 1,
        dedupeKey: function (item) {
            return item.id_item || syncNormalizeKeyPart_(item.item_oficial || item.material);
        },
        mapper: function (row) {
            return {
                id_item: syncReadString_(row, ["ID_Item", "ID Item"]) || null,
                item_oficial: syncReadString_(row, ["Item_Oficial", "Item Oficial", "Material"]) || null,
                material: syncReadString_(row, ["Material", "Item_Oficial", "Item Oficial"]) || null,
                unidade: syncReadString_(row, ["Unidade"]) || null,
                stock_atual: syncReadNumber_(row, ["Stock Atual", "Stock_Atual"]),
                custo_medio_atual: syncReadNumber_(row, ["Custo_Medio_Atual", "Custo Medio Atual"])
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
                custo_euro: Number(row["Custo_Euro"] || 0)
            };
        }
    }
};

function syncReadCell_(row, aliases) {
    aliases = aliases || [];
    for (var i = 0; i < aliases.length; i++) {
        var key = aliases[i];
        if (!key) continue;
        if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    }
    return null;
}

function syncReadString_(row, aliases) {
    var value = syncReadCell_(row, aliases);
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function syncReadNumber_(row, aliases) {
    var value = syncReadCell_(row, aliases);
    if (typeof value === "number") return value;
    var text = String(value || "").trim();
    if (!text) return 0;
    var normalized = text
        .replace(/\s/g, "")
        .replace(/\.(?=\d{3}(?:\D|$))/g, "")
        .replace(",", ".");
    var parsed = Number(normalized);
    return isNaN(parsed) ? 0 : parsed;
}

function syncReadNormalizedNif_(value) {
    if (value === null || value === undefined || value === "") return null;
    return String(value).replace(/\.0$/, "").trim() || null;
}

function syncBuildCompositeKey_(parts) {
    return (parts || []).map(function (part) {
        return syncNormalizeKeyPart_(part);
    }).join("|");
}

function getSyncConfig_() {
    var props = PropertiesService.getScriptProperties();
    return {
        BACKEND_URL: props.getProperty("BACKEND_URL"),
        API_KEY: props.getProperty("API_KEY")
    };
}

function syncToSupabase(e) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    rememberSyncSpreadsheetId_(ss);

    var sheet = SpreadsheetApp.getActiveSheet();
    if (!sheet) return;

    var result = syncSheetToSupabase_(sheet, {
        queueOnFailure: true,
        source: "change"
    });
    if (!result) return;
    Logger.log("Sync " + sheet.getName() + ": " + JSON.stringify(result));
}

function syncAll() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    rememberSyncSpreadsheetId_(ss);
    var results = [];

    for (var name in SYNC_SHEET_CONFIG) {
        var sheet = ss.getSheetByName(name);
        if (!sheet) continue;

        var result = syncSheetToSupabase_(sheet, {
            queueOnFailure: true,
            source: "manual"
        });
        if (!result) continue;

        if (result.status === "ok") {
            results.push(name + ": " + (result.upserted || 0) + " synced");
        } else if (result.status === "queued") {
            results.push(name + ": queued for retry");
        } else {
            results.push(name + ": " + (result.error || "no data"));
        }
    }

    syncNotify_("Sync finished\n\n" + results.join("\n"));
}

function retryPendingSupabaseSync_() {
    var pending = getSyncJobs_(SYNC_PENDING_JOBS_KEY);
    var failed = getSyncJobs_(SYNC_FAILED_JOBS_KEY);
    var ss = getSyncSpreadsheet_();
    if (!ss) return;

    var changed = false;
    for (var name in pending) {
        var sheet = ss.getSheetByName(name);
        if (!sheet) {
            failed[name] = buildFailedSyncJob_(pending[name], "Sheet not found");
            delete pending[name];
            changed = true;
            continue;
        }

        var result = syncSheetToSupabase_(sheet, {
            queueOnFailure: false,
            source: "retry"
        });

        if (result && result.status === "ok") {
            delete pending[name];
            delete failed[name];
            changed = true;
            continue;
        }

        var job = pending[name] || {};
        job.retry_count = Number(job.retry_count || 0) + 1;
        job.last_error = getSyncErrorMessage_(result) || "Unknown retry error";
        job.last_attempt_at = new Date().toISOString();

        if (job.retry_count >= SYNC_MAX_AUTO_RETRIES) {
            failed[name] = buildFailedSyncJob_(job, job.last_error);
            delete pending[name];
        } else {
            pending[name] = job;
        }
        changed = true;
    }

    if (changed) {
        saveSyncJobs_(SYNC_PENDING_JOBS_KEY, pending);
        saveSyncJobs_(SYNC_FAILED_JOBS_KEY, failed);
    }

    if (Object.keys(pending).length === 0) {
        deleteSyncRetryTrigger_();
    }
}

function syncRetryPendingNow() {
    retryPendingSupabaseSync_();
    syncShowStatus();
}

function syncShowStatus() {
    var pending = getSyncJobs_(SYNC_PENDING_JOBS_KEY);
    var failed = getSyncJobs_(SYNC_FAILED_JOBS_KEY);
    var parts = [];

    var pendingNames = Object.keys(pending);
    var failedNames = Object.keys(failed);

    parts.push("Pending retries: " + pendingNames.length);
    pendingNames.forEach(function (name) {
        var job = pending[name];
        parts.push("- " + name + " | retries used: " + Number(job.retry_count || 0) + "/" + SYNC_MAX_AUTO_RETRIES);
        parts.push("  last error: " + String(job.last_error || "-"));
    });

    parts.push("");
    parts.push("Failed after retries: " + failedNames.length);
    failedNames.forEach(function (name) {
        var job = failed[name];
        parts.push("- " + name + " | last error: " + String(job.last_error || "-"));
    });

    syncNotify_(parts.join("\n"));
}

function syncClearFailures() {
    saveSyncJobs_(SYNC_FAILED_JOBS_KEY, {});
    syncNotify_("Sync failures cleared.");
}

function syncSheetToSupabase_(sheet, options) {
    options = options || {};
    var name = sheet.getName();
    var config = SYNC_SHEET_CONFIG[name];
    if (!config || !config.endpoint) return null;

    var mapped = buildSyncRowsForSheet_(sheet, config);
    if (mapped.length === 0) {
        clearPendingSyncJob_(name);
        clearFailedSyncJob_(name);
        return { status: "empty", rows: 0 };
    }

    var result = syncSendToBackend_(config.endpoint, mapped);
    if (!result || result.error) {
        var errorMessage = getSyncErrorMessage_(result);
        if (options.queueOnFailure) {
            queuePendingSyncJob_(name, config, mapped.length, errorMessage);
            return {
                status: "queued",
                rows: mapped.length,
                error: errorMessage || "Sync failed"
            };
        }
        return {
            status: "error",
            rows: mapped.length,
            error: errorMessage || "Sync failed"
        };
    }

    clearPendingSyncJob_(name);
    clearFailedSyncJob_(name);
    return {
        status: "ok",
        rows: mapped.length,
        upserted: result.upserted || 0
    };
}

function buildSyncRowsForSheet_(sheet, config) {
    var rows = getSyncSheetRows_(sheet, config.headerRow);
    var mapped = [];

    for (var i = 0; i < rows.length; i++) {
        try {
            var item = config.mapper(rows[i]);
            if (item) mapped.push(item);
        } catch (err) {
            Logger.log("Sync map error " + sheet.getName() + " row " + (i + config.headerRow + 1) + ": " + err);
        }
    }
    return dedupeSyncRows_(mapped, config);
}

function dedupeSyncRows_(rows, config) {
    if (!config || typeof config.dedupeKey !== "function") return rows;

    var out = [];
    var indexByKey = {};
    for (var i = 0; i < rows.length; i++) {
        var item = rows[i];
        var key = String(config.dedupeKey(item) || "").trim();
        if (!key) {
            out.push(item);
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(indexByKey, key)) {
            out[indexByKey[key]] = item;
        } else {
            indexByKey[key] = out.length;
            out.push(item);
        }
    }
    return out;
}

function queuePendingSyncJob_(name, config, rowCount, errorMessage) {
    var pending = getSyncJobs_(SYNC_PENDING_JOBS_KEY);
    pending[name] = {
        sheet_name: name,
        endpoint: config.endpoint,
        header_row: config.headerRow,
        row_count: rowCount,
        retry_count: 0,
        last_error: errorMessage || "Initial sync failed",
        queued_at: new Date().toISOString(),
        last_attempt_at: ""
    };
    saveSyncJobs_(SYNC_PENDING_JOBS_KEY, pending);
    ensureSyncRetryTrigger_();
}

function getSyncErrorMessage_(result) {
    if (!result) return "Sync failed";

    var parts = [];
    if (result.error) parts.push(String(result.error));
    if (result.body) {
        var bodyText = String(result.body).replace(/\s+/g, " ").trim();
        if (bodyText.length > 180) bodyText = bodyText.slice(0, 177) + "...";
        parts.push(bodyText);
    }
    return parts.join(" | ") || "Sync failed";
}

function clearPendingSyncJob_(name) {
    var pending = getSyncJobs_(SYNC_PENDING_JOBS_KEY);
    if (!pending[name]) return;
    delete pending[name];
    saveSyncJobs_(SYNC_PENDING_JOBS_KEY, pending);
}

function clearFailedSyncJob_(name) {
    var failed = getSyncJobs_(SYNC_FAILED_JOBS_KEY);
    if (!failed[name]) return;
    delete failed[name];
    saveSyncJobs_(SYNC_FAILED_JOBS_KEY, failed);
}

function buildFailedSyncJob_(job, errorMessage) {
    var out = {};
    for (var key in job) out[key] = job[key];
    out.failed_at = new Date().toISOString();
    out.last_error = errorMessage || out.last_error || "Sync failed";
    return out;
}

function getSyncJobs_(key) {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty(key);
    if (!raw) return {};

    try {
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
        Logger.log("Invalid sync jobs payload for " + key + ": " + err);
        return {};
    }
}

function saveSyncJobs_(key, jobs) {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(key, JSON.stringify(jobs || {}));
}

function ensureSyncRetryTrigger_() {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === SYNC_RETRY_TRIGGER_HANDLER) return;
    }

    ScriptApp.newTrigger(SYNC_RETRY_TRIGGER_HANDLER)
        .timeBased()
        .everyMinutes(SYNC_RETRY_INTERVAL_MINUTES)
        .create();
}

function deleteSyncRetryTrigger_() {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === SYNC_RETRY_TRIGGER_HANDLER) {
            ScriptApp.deleteTrigger(triggers[i]);
        }
    }
}

function rememberSyncSpreadsheetId_(ss) {
    if (!ss) return;
    PropertiesService.getScriptProperties().setProperty(SYNC_SPREADSHEET_ID_KEY, ss.getId());
}

function getSyncSpreadsheet_() {
    try {
        var active = SpreadsheetApp.getActiveSpreadsheet();
        if (active) return active;
    } catch (err) {}

    var spreadsheetId = PropertiesService.getScriptProperties().getProperty(SYNC_SPREADSHEET_ID_KEY);
    if (!spreadsheetId) return null;
    return SpreadsheetApp.openById(spreadsheetId);
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
                hasData = true;
                break;
            }
        }
        if (!hasData) continue;

        var obj = {};
        for (var k = 0; k < headers.length; k++) {
            if (headers[k]) obj[headers[k]] = row[k];
        }
        obj.__sheet_row_num = i + 1;
        rows.push(obj);
    }
    return rows;
}

function syncSendToBackend_(endpoint, rows) {
    var cfg = getSyncConfig_();
    if (!cfg.BACKEND_URL || !cfg.API_KEY) {
        Logger.log("SYNC ERROR: BACKEND_URL or API_KEY missing");
        return { error: "config missing" };
    }

    var url = cfg.BACKEND_URL + endpoint;
    try {
        var response = UrlFetchApp.fetch(url, {
            method: "post",
            contentType: "application/json",
            headers: { "X-API-KEY": cfg.API_KEY },
            payload: JSON.stringify({ rows: rows }),
            muteHttpExceptions: true
        });
        var code = response.getResponseCode();
        var body = response.getContentText();
        if (code >= 200 && code < 300) {
            return JSON.parse(body);
        }

        Logger.log("SYNC ERROR " + endpoint + ": HTTP " + code + " - " + body);
        return { error: "HTTP " + code, body: body };
    } catch (e) {
        Logger.log("SYNC ERROR " + endpoint + ": " + e.message);
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
    if (typeof val === "string") {
        return val.toLowerCase() === "true" || val === "1" || val.toLowerCase() === "sim";
    }
    if (typeof val === "number") return val !== 0;
    return false;
}

function syncNotify_(message) {
    try {
        SpreadsheetApp.getUi().alert(message);
    } catch (err) {
        Logger.log(String(message || ""));
    }
}

function syncNormalizeKeyPart_(val) {
    return String(val || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function syncBuildLegacyMaoObraKey_(row) {
    var manualId = String((row && (row["ID_Legacy"] || row["ID LEGACY"])) || "").trim();
    if (manualId) return "legacy-id|" + manualId;

    return [
        "legacy-row",
        syncFormatDate_(row && row["Data"]),
        syncNormalizeKeyPart_(row && row["Obra"]),
        syncNormalizeKeyPart_(row && (row["Fase de Obra"] || row["Fase"])),
        String(Number((row && row["Horas"]) || 0)),
        String(Number((row && (row["Custo Dia"] || row["Custo_Dia"])) || 0)),
        String((row && row.__sheet_row_num) || "")
    ].join("|");
}
