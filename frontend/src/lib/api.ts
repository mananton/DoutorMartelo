export type JsonRecord = Record<string, unknown>;

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

function translateBusinessDetail(detail: string) {
  const known: Record<string, string> = {
    CUSTO_STOCK_EM_FALTA: "Este item ainda nao tem custo medio disponivel em stock.",
    CATALOGO_DUPLICADO_ITEM_OFICIAL: "Ja existe um item oficial com esse nome no catalogo.",
    CATALOGO_REFERENCIA_DESCRICAO_DUPLICADA: "Esta descricao original ja esta ligada a outro item do catalogo.",
    CATALOGO_REFERENCIADO: "Este item do catalogo ja esta referenciado noutros registos e nao pode ser apagado.",
    AFETACAO_GERADA_SOMENTE_PELA_FATURA: "Esta afetacao foi gerada pela fatura e deve ser corrigida a partir da linha da fatura.",
    "Fuel items require uso_combustivel": "Combustiveis exigem que escolhas o tipo de uso.",
    "Fuel assigned to viatura requires destino VIATURA": "Combustivel para viatura exige o destino `VIATURA`.",
    "Fuel assigned to viatura requires matricula": "Combustivel para viatura exige a selecao de uma matricula.",
    "Fuel for maquina or gerador cannot use destino VIATURA": "Maquina e gerador nao podem usar o destino `VIATURA`.",
    "Fuel direct consumption requires obra and fase": "Combustivel para maquina ou gerador exige `Obra` e `Fase` quando o destino for consumo direto.",
    "Only fuel items can use destino VIATURA": "So combustiveis podem usar o destino `VIATURA`.",
    "Fuel stock consumption requires MAQUINA or GERADOR": "Consumos de stock de combustivel exigem `MAQUINA` ou `GERADOR`.",
  };
  return known[detail] ?? detail;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const rawText = response.status === 204 ? "" : await response.text();

  if (!response.ok) {
    if (rawText) {
      let parsedDetail: string | null = null;
      try {
        const parsed = JSON.parse(rawText) as { detail?: string };
        if (parsed.detail) {
          parsedDetail = translateBusinessDetail(String(parsed.detail));
        }
      } catch {
        parsedDetail = null;
      }
      throw new Error(parsedDetail ?? rawText ?? `HTTP ${response.status}`);
    }
    throw new Error(`HTTP ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return JSON.parse(rawText) as T;
}

export const api = {
  listFaturas: () => request<JsonRecord[]>("/api/faturas"),
  getFatura: (id: string) => request<JsonRecord>(`/api/faturas/${id}`),
  createFatura: (payload: JsonRecord) => request<JsonRecord>("/api/faturas", { method: "POST", body: JSON.stringify(payload) }),
  updateFatura: (id: string, payload: JsonRecord) => request<JsonRecord>(`/api/faturas/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteFatura: (id: string) => request<void>(`/api/faturas/${id}`, { method: "DELETE" }),
  previewItems: (id: string, payload: JsonRecord) => request<JsonRecord>(`/api/faturas/${id}/itens/preview`, { method: "POST", body: JSON.stringify(payload) }),
  createItems: (id: string, payload: JsonRecord) => request<JsonRecord>(`/api/faturas/${id}/itens`, { method: "POST", body: JSON.stringify(payload) }),
  updateFaturaItem: (id: string, itemId: string, payload: JsonRecord) => request<JsonRecord>(`/api/faturas/${id}/itens/${itemId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteFaturaItem: (id: string, itemId: string) => request<void>(`/api/faturas/${id}/itens/${itemId}`, { method: "DELETE" }),
  listCatalog: () => request<JsonRecord[]>("/api/materiais-cad"),
  createCatalog: (payload: JsonRecord) => request<JsonRecord>("/api/materiais-cad", { method: "POST", body: JSON.stringify(payload) }),
  updateCatalog: (id: string, payload: JsonRecord) => request<JsonRecord>(`/api/materiais-cad/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteCatalog: (id: string) => request<void>(`/api/materiais-cad/${id}`, { method: "DELETE" }),
  getWorkOptions: () => request<JsonRecord>("/api/options/obras-fases"),
  getSupplierOptions: () => request<JsonRecord>("/api/options/fornecedores"),
  getVehicleOptions: () => request<JsonRecord>("/api/options/veiculos"),
  listAfetacoes: () => request<JsonRecord[]>("/api/afetacoes"),
  createAfetacao: (payload: JsonRecord) => request<JsonRecord>("/api/afetacoes", { method: "POST", body: JSON.stringify(payload) }),
  updateAfetacao: (id: string, payload: JsonRecord) => request<JsonRecord>(`/api/afetacoes/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteAfetacao: (id: string) => request<void>(`/api/afetacoes/${id}`, { method: "DELETE" }),
  processAfetacao: (id: string) => request<JsonRecord>(`/api/afetacoes/${id}/processar`, { method: "POST" }),
  listStockSnapshots: () => request<JsonRecord[]>("/api/stock-atual"),
  getStockSnapshot: (id: string) => request<JsonRecord>(`/api/stock-atual/${id}`),
  listMovimentos: () => request<JsonRecord[]>("/api/materiais-mov"),
  getSyncStatus: () => request<JsonRecord>("/api/sync/status"),
  getSyncDiagnostics: () => request<JsonRecord>("/api/sync/diagnostics"),
  retrySync: () => request<JsonRecord>("/api/sync/retry", { method: "POST" }),
  reloadState: () => request<JsonRecord>("/api/sync/reload", { method: "POST" }),
};
