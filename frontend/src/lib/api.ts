export type JsonRecord = Record<string, unknown>;

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  listFaturas: () => request<JsonRecord[]>("/api/faturas"),
  getFatura: (id: string) => request<JsonRecord>(`/api/faturas/${id}`),
  createFatura: (payload: JsonRecord) => request<JsonRecord>("/api/faturas", { method: "POST", body: JSON.stringify(payload) }),
  previewItems: (id: string, payload: JsonRecord) => request<JsonRecord>(`/api/faturas/${id}/itens/preview`, { method: "POST", body: JSON.stringify(payload) }),
  createItems: (id: string, payload: JsonRecord) => request<JsonRecord>(`/api/faturas/${id}/itens`, { method: "POST", body: JSON.stringify(payload) }),
  listCatalog: () => request<JsonRecord[]>("/api/materiais-cad"),
  createCatalog: (payload: JsonRecord) => request<JsonRecord>("/api/materiais-cad", { method: "POST", body: JSON.stringify(payload) }),
  listAfetacoes: () => request<JsonRecord[]>("/api/afetacoes"),
  createAfetacao: (payload: JsonRecord) => request<JsonRecord>("/api/afetacoes", { method: "POST", body: JSON.stringify(payload) }),
  processAfetacao: (id: string) => request<JsonRecord>(`/api/afetacoes/${id}/processar`, { method: "POST" }),
  getSyncStatus: () => request<JsonRecord>("/api/sync/status"),
  retrySync: () => request<JsonRecord>("/api/sync/retry", { method: "POST" })
};

