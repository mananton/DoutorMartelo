import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../lib/api";

type FaturaFormState = {
  fornecedor: string;
  nif: string;
  nr_documento: string;
  data_fatura: string;
  valor_sem_iva: string;
  iva: string;
  valor_com_iva: string;
  paga: boolean;
  data_pagamento: string;
  observacoes: string;
};

type FaturaRow = Record<string, unknown> & {
  id_fatura?: string;
  fornecedor?: string;
  nif?: string;
  nr_documento?: string;
  data_fatura?: string;
  valor_sem_iva?: number;
  iva?: number;
  valor_com_iva?: number;
  paga?: boolean;
  data_pagamento?: string;
  observacoes?: string;
};

type SupplierOption = Record<string, unknown> & {
  id_fornecedor?: string;
  fornecedor?: string;
  nif?: string;
};

const INITIAL_FORM: FaturaFormState = {
  fornecedor: "",
  nif: "",
  nr_documento: "",
  data_fatura: "",
  valor_sem_iva: "",
  iva: "23",
  valor_com_iva: "",
  paga: false,
  data_pagamento: "",
  observacoes: "",
};

function toNumber(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateGrossValue(valorSemIva: string, iva: string) {
  if (!String(valorSemIva ?? "").trim()) return "";
  const netValue = toNumber(valorSemIva);
  const ivaValue = String(iva ?? "").trim() ? toNumber(iva) : 0;
  return (netValue * (1 + ivaValue / 100)).toFixed(2);
}

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function formatAmount(value: number, digits = 2) {
  return new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function toFormState(item: FaturaRow): FaturaFormState {
  return {
    fornecedor: String(item.fornecedor ?? ""),
    nif: String(item.nif ?? ""),
    nr_documento: String(item.nr_documento ?? ""),
    data_fatura: String(item.data_fatura ?? ""),
    valor_sem_iva: String(item.valor_sem_iva ?? ""),
    iva: String(item.iva ?? 23),
    valor_com_iva: String(item.valor_com_iva ?? ""),
    paga: Boolean(item.paga ?? false),
    data_pagamento: String(item.data_pagamento ?? ""),
    observacoes: String(item.observacoes ?? ""),
  };
}

export function FaturasPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FaturaFormState>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const { data } = useQuery({ queryKey: ["faturas"], queryFn: api.listFaturas });
  const supplierOptionsQuery = useQuery({ queryKey: ["supplier-options"], queryFn: api.getSupplierOptions });
  const faturas = useMemo(() => ((data as FaturaRow[] | undefined) ?? []), [data]);
  const supplierOptions = useMemo(
    () => ((supplierOptionsQuery.data?.fornecedores as SupplierOption[] | undefined) ?? []),
    [supplierOptionsQuery.data],
  );
  const supplierByName = useMemo(() => {
    const entries = new Map<string, SupplierOption>();
    for (const option of supplierOptions) {
      const fornecedor = String(option.fornecedor ?? "");
      const key = normalize(fornecedor);
      if (!key) continue;
      const current = entries.get(key);
      if (!current || (!current.nif && option.nif)) {
        entries.set(key, option);
      }
    }
    return entries;
  }, [supplierOptions]);
  const filteredFaturas = useMemo(() => {
    const search = normalize(searchTerm);
    if (!search) return faturas;
    return faturas.filter((item) => {
      const haystack = [
        String(item.id_fatura ?? ""),
        String(item.fornecedor ?? ""),
        String(item.nr_documento ?? ""),
        String(item.nif ?? ""),
      ].map(normalize);
      return haystack.some((value) => value.includes(search));
    });
  }, [faturas, searchTerm]);

  const createMutation = useMutation({
    mutationFn: api.createFatura,
    onSuccess: (created) => {
      const id = String(created.id_fatura ?? "");
      setFormMessage("Fatura guardada com sucesso.");
      setForm(INITIAL_FORM);
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      navigate(`/faturas/${id}`);
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao guardar fatura.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.updateFatura(id, payload),
    onSuccess: (_, variables) => {
      setFormMessage(`Fatura ${variables.id} atualizada com sucesso.`);
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["fatura", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      setEditingId(null);
      setForm(INITIAL_FORM);
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao atualizar fatura.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteFatura,
    onSuccess: (_, id) => {
      setFormMessage(`Fatura ${id} apagada com sucesso.`);
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      queryClient.invalidateQueries({ queryKey: ["movimentos"] });
      queryClient.invalidateQueries({ queryKey: ["stock-list"] });
      if (editingId === id) {
        setEditingId(null);
        setForm(INITIAL_FORM);
      }
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao apagar fatura.");
    },
  });

  function updateField(field: keyof FaturaFormState, value: string) {
    setFormMessage("");
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "valor_sem_iva" || field === "iva") {
        next.valor_com_iva = calculateGrossValue(
          field === "valor_sem_iva" ? value : current.valor_sem_iva,
          field === "iva" ? value : current.iva,
        );
      }
      return next;
    });
  }

  function updatePagaField(checked: boolean) {
    setFormMessage("");
    setForm((current) => ({
      ...current,
      paga: checked,
      data_pagamento: checked ? current.data_pagamento : "",
    }));
  }

  function updateFornecedorField(value: string) {
    setFormMessage("");
    setForm((current) => {
      const next = { ...current, fornecedor: value };
      if (!value.trim()) {
        next.nif = "";
        return next;
      }
      const matchedSupplier = supplierByName.get(normalize(value));
      if (matchedSupplier?.nif) {
        next.nif = String(matchedSupplier.nif);
      }
      return next;
    });
  }

  function startEdit(item: FaturaRow) {
    setFormMessage("");
    setEditingId(String(item.id_fatura ?? ""));
    setForm(toFormState(item));
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setFormMessage("");
  }

  function startNew() {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setFormMessage("");
  }

  const valorSemIva = toNumber(form.valor_sem_iva);
  const valorComIva = toNumber(form.valor_com_iva);
  const volumeTotal = useMemo(
    () => filteredFaturas.reduce((total, item) => total + Number(item.valor_com_iva ?? 0), 0),
    [filteredFaturas],
  );
  const latestInvoiceDate = useMemo(() => {
    const dates = faturas.map((item) => String(item.data_fatura ?? "")).filter(Boolean);
    return dates.sort().at(-1) ?? "";
  }, [faturas]);
  const workspaceModeLabel = editingId ? `A editar ${editingId}` : "Nova fatura";
  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="workspace-page">
      <section className="panel workspace-hero">
        <div className="detail-hero-head">
          <div>
            <div className="mono muted">Faturas</div>
            <h3>Queue de Compras</h3>
            <div className="muted">A lista passa a funcionar como fila de trabalho e o editor fica como workspace principal para escritorio.</div>
          </div>
          <div className="inline-actions">
            <span className="tag">{workspaceModeLabel}</span>
            <span className="tag tag-success">{filteredFaturas.length} visivel(is)</span>
            <button className="btn secondary" type="button" onClick={startNew}>
              Nova fatura
            </button>
          </div>
        </div>
        <div className="detail-header-grid workspace-overview-grid">
          <div className="summary-card accent">
            <div className="summary-title">Total de faturas</div>
            <div className="summary-main">{faturas.length}</div>
            <div className="muted">Base atual da fila de compras.</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Resultado visivel</div>
            <div className="summary-main">{filteredFaturas.length}</div>
            <div className="muted">{searchTerm ? "Com o filtro atual aplicado." : "Sem filtro de pesquisa."}</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Volume visivel</div>
            <div className="summary-main">{formatAmount(volumeTotal)} com IVA</div>
            <div className="muted">Soma das faturas atualmente visiveis na fila.</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Ultima data</div>
            <div className="summary-main">{latestInvoiceDate || "-"}</div>
            <div className="muted">{editingId ? `Documento em edicao: ${editingId}` : "Pronto para criar nova fatura."}</div>
          </div>
        </div>
      </section>

      <div className="workspace-shell">
        <section className="panel queue-panel">
          <div className="row-head">
            <div>
              <div className="section-kicker">Fila operacional</div>
              <h3>Lista de Faturas</h3>
              <div className="muted">Usa a fila para localizar uma fatura, abrir o detalhe das linhas ou puxar uma ficha para correcao rapida.</div>
            </div>
          </div>

          <div className="queue-toolbar">
            <label className="queue-search">
              Pesquisar faturas
              <input
                name="search_faturas"
                placeholder="ID, fornecedor, documento ou NIF"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
          </div>

          <div className="queue-list">
            {filteredFaturas.map((item) => {
              const id = String(item.id_fatura ?? "");
              return (
                <div key={id} className={`list-row queue-card ${editingId === id ? "list-row-active" : ""}`}>
                  <div className="queue-card-head">
                    <div className="queue-card-main">
                      <div className="mono">{id}</div>
                      <strong>{String(item.fornecedor ?? "-")}</strong>
                      <div className="muted">{String(item.nr_documento ?? "-")} | {String(item.data_fatura ?? "-")}</div>
                    </div>
                    <div className="queue-card-metrics">
                      <span className="tag">{formatAmount(Number(item.valor_com_iva ?? 0))} com IVA</span>
                      <span className={`tag ${Boolean(item.paga) ? "tag-success" : ""}`}>
                        {Boolean(item.paga) ? "Paga" : "Por pagar"}
                      </span>
                      {item.data_pagamento ? <span className="tag">{String(item.data_pagamento)}</span> : null}
                      {editingId === id ? <span className="tag tag-success">Em edicao</span> : null}
                    </div>
                  </div>
                  <div className="inline-actions">
                    <button className="btn secondary" type="button" onClick={() => navigate(`/faturas/${id}`)}>
                      Abrir
                    </button>
                    <button className="btn secondary" type="button" onClick={() => startEdit(item)}>
                      Editar
                    </button>
                    <button
                      className="btn danger"
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Apagar a fatura ${id}? Isto tambem remove linhas, afetacoes e movimentos gerados.`)) {
                          return;
                        }
                        setFormMessage("");
                        deleteMutation.mutate(id);
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      Apagar
                    </button>
                  </div>
                </div>
              );
            })}
            {!filteredFaturas.length ? (
              <div className="empty-note">
                {searchTerm ? "Nenhuma fatura corresponde ao filtro atual." : "Ainda nao existem faturas carregadas."}
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel editor-panel">
          <div className="row-head">
            <div>
              <div className="section-kicker">Workspace principal</div>
              <h3>{editingId ? `Editar ${editingId}` : "Nova Fatura"}</h3>
              <div className="muted">
                {editingId ? "Corrige os campos principais da fatura. As linhas dependentes acompanham fornecedor, documento e data." : "Cria a ficha base da fatura e segue depois para o detalhe das linhas."}
              </div>
            </div>
            <div className="inline-actions">
              {editingId ? (
                <button className="btn secondary" type="button" onClick={() => navigate(`/faturas/${editingId}`)}>
                  Abrir detalhe
                </button>
              ) : null}
              {editingId ? (
                <button className="btn secondary" type="button" onClick={cancelEdit}>
                  Cancelar edicao
                </button>
              ) : null}
            </div>
          </div>

          {formMessage ? <div className="status-note">{formMessage}</div> : null}

          <div className="form-summary-grid">
            <div className="summary-card accent">
              <div className="summary-title">Fornecedor</div>
              <div className="summary-main">{form.fornecedor || "-"}</div>
              <div className="muted">{form.nr_documento || "Documento ainda por definir."}</div>
            </div>
            <div className="summary-card">
              <div className="summary-title">Totais em edicao</div>
              <div className="summary-main">{formatAmount(valorSemIva)} sem IVA</div>
              <div className="muted">{formatAmount(valorComIva)} com IVA | IVA {form.iva || "0"}%</div>
            </div>
            <div className="summary-card">
              <div className="summary-title">Pagamento</div>
              <div className="summary-main">{form.paga ? "Paga" : "Por pagar"}</div>
              <div className="muted">{form.data_pagamento || "Sem data de pagamento registada."}</div>
            </div>
          </div>

          <form
            className="form detail-form"
            onSubmit={(event) => {
              event.preventDefault();
              setFormMessage("");
              const payload = {
                fornecedor: form.fornecedor,
                nif: form.nif,
                nr_documento: form.nr_documento,
                data_fatura: form.data_fatura,
                valor_sem_iva: toNumber(form.valor_sem_iva),
                iva: toNumber(form.iva),
                valor_com_iva: toNumber(form.valor_com_iva),
                paga: form.paga,
                data_pagamento: form.paga && form.data_pagamento ? form.data_pagamento : null,
                observacoes: form.observacoes || null,
              };
              if (editingId) {
                updateMutation.mutate({ id: editingId, payload });
                return;
              }
              createMutation.mutate(payload);
            }}
          >
            <div className="form-section">
              <div className="section-kicker">Fornecedor e documento</div>
              <div className="section-copy">Define a identidade da fatura e os campos que depois hidratam automaticamente as linhas dependentes.</div>
              <div className="form-grid">
                <label>
                  Fornecedor
                  <input
                    list="fatura-fornecedor-options"
                    name="fornecedor"
                    required
                    value={form.fornecedor}
                    onChange={(event) => updateFornecedorField(event.target.value)}
                  />
                  <datalist id="fatura-fornecedor-options">
                    {supplierOptions.map((option) => {
                      const fornecedor = String(option.fornecedor ?? "");
                      if (!fornecedor) return null;
                      return <option key={String(option.id_fornecedor ?? fornecedor)} value={fornecedor} label={String(option.nif ?? "")} />;
                    })}
                  </datalist>
                </label>
                <label>NIF<input name="nif" required value={form.nif} onChange={(event) => updateField("nif", event.target.value)} /></label>
                <label>Numero Doc/Fatura<input name="nr_documento" required value={form.nr_documento} onChange={(event) => updateField("nr_documento", event.target.value)} /></label>
                <label>Data Fatura<input name="data_fatura" type="date" required value={form.data_fatura} onChange={(event) => updateField("data_fatura", event.target.value)} /></label>
              </div>
              <div className="field-hint">
                {supplierOptions.length
                  ? "A lista de fornecedores vem da aba `FORNECEDORES`. Ao escolher um fornecedor conhecido, o `NIF` e preenchido automaticamente."
                  : "Quando existirem fornecedores carregados da Google Sheet, este campo passa a sugeri-los automaticamente."}
              </div>
            </div>

            <div className="form-section">
              <div className="section-kicker">Valores</div>
              <div className="section-copy">Mantem os totais principais da fatura na mesma ficha antes de entrares no detalhe das linhas.</div>
              <div className="form-grid">
                <label>Valor Sem IVA<input name="valor_sem_iva" type="number" step="0.01" value={form.valor_sem_iva} onChange={(event) => updateField("valor_sem_iva", event.target.value)} /></label>
                <label>IVA %<input name="iva" type="number" step="0.01" value={form.iva} onChange={(event) => updateField("iva", event.target.value)} /></label>
                <label>Valor Com IVA<input name="valor_com_iva" type="number" step="0.01" value={form.valor_com_iva} onChange={(event) => updateField("valor_com_iva", event.target.value)} /></label>
              </div>
            </div>

            <div className="form-section">
              <div className="section-kicker">Pagamento</div>
              <div className="section-copy">Regista se a fatura ja foi paga e, quando aplicavel, a respetiva data de pagamento.</div>
              <div className="form-grid">
                <label className="checkbox-field">
                  <span>Paga?</span>
                  <input
                    name="paga"
                    type="checkbox"
                    checked={form.paga}
                    onChange={(event) => updatePagaField(event.target.checked)}
                  />
                </label>
                <label>
                  Data Pagamento
                  <input
                    name="data_pagamento"
                    type="date"
                    value={form.data_pagamento}
                    disabled={!form.paga}
                    onChange={(event) => updateField("data_pagamento", event.target.value)}
                  />
                </label>
              </div>
            </div>

            <label>
              Observacoes
              <textarea name="observacoes" rows={3} value={form.observacoes} onChange={(event) => updateField("observacoes", event.target.value)} />
            </label>

            <div className="field-hint">Depois de guardar, usa o detalhe da fatura para lancar linhas, mapear itens e validar impacto operacional.</div>

            <div className="form-actions detail-form-actions">
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? "A guardar..." : editingId ? "Guardar alteracoes" : "Guardar e abrir detalhe"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
