export type JsonRecord = Record<string, unknown>;

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isLoopbackHost(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function resolveConfiguredApiBase(configured: string | undefined) {
  if (!configured) {
    return null;
  }
  if (typeof window === "undefined") {
    return stripTrailingSlash(configured);
  }
  try {
    const resolved = new URL(configured, window.location.origin);
    const currentIsLoopback = isLoopbackHost(window.location.hostname);
    const configuredIsLoopback = isLoopbackHost(resolved.hostname);
    if (!currentIsLoopback && configuredIsLoopback) {
      return stripTrailingSlash(window.location.origin);
    }
    return stripTrailingSlash(`${resolved.origin}${resolved.pathname}`);
  } catch {
    return stripTrailingSlash(configured);
  }
}

function defaultApiBase() {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8000";
  }
  const port = window.location.port;
  if (port === "5173" || port === "4173") {
    return "http://127.0.0.1:8000";
  }
  return stripTrailingSlash(window.location.origin);
}

const API_BASE = resolveConfiguredApiBase(import.meta.env.VITE_API_BASE_URL) ?? defaultApiBase();

function translateBusinessDetail(detail: string) {
  const known: Record<string, string> = {
    COMPROMISSO_INEXISTENTE: "O `ID_Compromisso` indicado nao existe nos compromissos registados.",
    COMPROMISSO_REFERENCIADO: "Este compromisso ja esta ligado a uma ou mais faturas e nao pode ser apagado.",
    FATURA_TIPO_DOC_COM_LINHAS: "Nao e seguro mudar o `Tipo_Doc` depois de ja existirem linhas registadas neste documento.",
    NOTA_CREDITO_REQUIRES_DOC_ORIGEM: "A `Nota de Credito` exige o preenchimento de `Doc_Origem` com o numero do documento original.",
    NC_COM_OBRA_REQUIRES_OBRA_AND_FASE: "Quando a categoria for `NC_COM_OBRA`, tens de indicar `Obra` e `Fase`.",
    NOTA_CREDITO_ITEM_ON_FATURA: "As linhas de nota de credito so podem ser usadas em documentos com `Tipo_Doc = NOTA_CREDITO`.",
    CUSTO_STOCK_EM_FALTA: "Este item ainda nao tem custo medio disponivel em stock.",
    CATALOGO_DUPLICADO_ITEM_OFICIAL: "Ja existe um item oficial com esse nome no catalogo.",
    CATALOGO_REFERENCIA_DESCRICAO_DUPLICADA: "Esta descricao original ja esta ligada a outro item do catalogo.",
    CATALOGO_REFERENCIADO: "Este item do catalogo ja esta referenciado noutros registos e nao pode ser apagado.",
    AFETACAO_GERADA_SOMENTE_PELA_FATURA: "Esta afetacao foi gerada pela fatura e deve ser corrigida a partir da linha da fatura.",
    "Fuel items require uso_combustivel": "Combustiveis exigem que escolhas o tipo de uso.",
    "Fuel assigned to viatura requires destino VIATURA": "Combustivel para viatura exige o destino `VIATURA`.",
    "Fuel assigned to viatura requires matricula": "Combustivel para viatura exige a selecao de uma matricula.",
    "Fuel for maquina or gerador cannot use destino VIATURA": "Maquina e gerador nao podem usar o destino `VIATURA`.",
    "Fuel for maquina or gerador cannot use destino ESCRITORIO": "Maquina e gerador nao podem usar o destino `ESCRITORIO`.",
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
  listCompromissos: () => request<JsonRecord[]>("/api/compromissos"),
  getFatura: (id: string) => request<JsonRecord>(`/api/faturas/${id}`),
  createCompromisso: (payload: JsonRecord) => request<JsonRecord>("/api/compromissos", { method: "POST", body: JSON.stringify(payload) }),
  updateCompromisso: (id: string, payload: JsonRecord) => request<JsonRecord>(`/api/compromissos/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteCompromisso: (id: string) => request<void>(`/api/compromissos/${id}`, { method: "DELETE" }),
  createFatura: (payload: JsonRecord) => request<JsonRecord>("/api/faturas", { method: "POST", body: JSON.stringify(payload) }),
  updateFatura: (id: string, payload: JsonRecord) => request<JsonRecord>(`/api/faturas/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteFatura: (id: string) => request<void>(`/api/faturas/${id}`, { method: "DELETE" }),
  previewItems: (id: string, payload: JsonRecord) => request<JsonRecord>(`/api/faturas/${id}/itens/preview`, { method: "POST", body: JSON.stringify(payload) }),
  createItems: (id: string, payload: JsonRecord) => request<JsonRecord>(`/api/faturas/${id}/itens`, { method: "POST", body: JSON.stringify(payload) }),
  updateFaturaItem: (id: string, itemId: string, payload: JsonRecord) => request<JsonRecord>(`/api/faturas/${id}/itens/${itemId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteFaturaItem: (id: string, itemId: string) => request<void>(`/api/faturas/${id}/itens/${itemId}`, { method: "DELETE" }),
  previewNotaCreditoItems: (id: string, payload: JsonRecord) => request<JsonRecord>(`/api/faturas/${id}/notas-credito-itens/preview`, { method: "POST", body: JSON.stringify(payload) }),
  createNotaCreditoItems: (id: string, payload: JsonRecord) => request<JsonRecord>(`/api/faturas/${id}/notas-credito-itens`, { method: "POST", body: JSON.stringify(payload) }),
  updateNotaCreditoItem: (id: string, itemId: string, payload: JsonRecord) => request<JsonRecord>(`/api/faturas/${id}/notas-credito-itens/${itemId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteNotaCreditoItem: (id: string, itemId: string) => request<void>(`/api/faturas/${id}/notas-credito-itens/${itemId}`, { method: "DELETE" }),
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
