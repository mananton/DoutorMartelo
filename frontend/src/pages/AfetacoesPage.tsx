import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/api";
import type { WorkOption } from "../lib/workOptions";

type AfetacaoFormState = {
  data: string;
  id_item: string;
  quantidade: string;
  iva: string;
  obra: string;
  fase: string;
  observacoes: string;
};

type CatalogItem = Record<string, unknown> & {
  id_item?: string;
  item_oficial?: string;
  natureza?: string;
  unidade?: string;
  referencias?: string[];
};

type AfetacaoRow = Record<string, unknown> & {
  id_afetacao?: string;
  origem?: string;
  id_item?: string;
  item_oficial?: string;
  natureza?: string;
  unidade?: string;
  quantidade?: number;
  iva?: number;
  obra?: string;
  fase?: string;
  data?: string;
  estado?: string;
  observacoes?: string;
};

type AssistantTab = "item" | "stock";

const INITIAL_FORM: AfetacaoFormState = {
  data: new Date().toISOString().slice(0, 10),
  id_item: "",
  quantidade: "",
  iva: "23",
  obra: "",
  fase: "",
  observacoes: "",
};

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function toNumber(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number, digits = 2) {
  return new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function catalogReferences(item: CatalogItem) {
  return ((item.referencias as string[] | undefined) ?? []).map((value) => String(value));
}

function scoreCatalogItem(item: CatalogItem, search: string) {
  const normalizedSearch = normalize(search);
  const itemId = normalize(item.id_item);
  const itemOficial = normalize(item.item_oficial);
  const itemReferencias = catalogReferences(item).map(normalize);
  if (!normalizedSearch) return 0;

  let score = 0;
  if (itemId === normalizedSearch) score += 120;
  if (itemOficial === normalizedSearch) score += 90;
  if (itemReferencias.includes(normalizedSearch)) score += 70;
  if (itemId.includes(normalizedSearch)) score += 45;
  if (itemOficial.includes(normalizedSearch)) score += 40;
  if (itemReferencias.some((value) => value.includes(normalizedSearch))) score += 30;
  return score;
}

function toFormState(item: AfetacaoRow): AfetacaoFormState {
  return {
    data: String(item.data ?? new Date().toISOString().slice(0, 10)),
    id_item: String(item.id_item ?? ""),
    quantidade: String(item.quantidade ?? ""),
    iva: String(item.iva ?? 23),
    obra: String(item.obra ?? ""),
    fase: String(item.fase ?? ""),
    observacoes: String(item.observacoes ?? ""),
  };
}

export function AfetacoesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AfetacaoFormState>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string>("");
  const [selectionMessage, setSelectionMessage] = useState<string>("");
  const [assistantTab, setAssistantTab] = useState<AssistantTab>("item");

  const afetacoesQuery = useQuery({ queryKey: ["afetacoes"], queryFn: api.listAfetacoes });
  const catalogQuery = useQuery({ queryKey: ["catalogo"], queryFn: api.listCatalog });
  const workOptionsQuery = useQuery({ queryKey: ["work-options"], queryFn: api.getWorkOptions });

  const selectedCatalog = ((catalogQuery.data as CatalogItem[] | undefined) ?? []).find((item) => String(item.id_item ?? "") === form.id_item);
  const workOptions = ((workOptionsQuery.data?.obras as WorkOption[] | undefined) ?? []);
  const availableFases = useMemo(
    () =>
      Array.from(
        new Set(
          workOptions.flatMap((item) => item.fases ?? []),
        ),
      ).sort((left, right) => left.localeCompare(right, "pt-PT")),
    [workOptions],
  );
  const deferredSearch = useDeferredValue(form.id_item);
  const suggestions = ((catalogQuery.data as CatalogItem[] | undefined) ?? [])
    .map((item) => ({ item, score: scoreCatalogItem(item, deferredSearch) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  const stockQuery = useQuery({
    queryKey: ["stock", form.id_item],
    queryFn: () => api.getStockSnapshot(form.id_item),
    enabled: Boolean(selectedCatalog && form.id_item),
  });

  const createMutation = useMutation({
    mutationFn: api.createAfetacao,
    onSuccess: () => {
      setAssistantTab("item");
      setFormMessage("Afetacao guardada com sucesso.");
      setSelectionMessage("");
      setForm((current) => ({ ...INITIAL_FORM, data: current.data, iva: current.iva }));
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      queryClient.invalidateQueries({ queryKey: ["movimentos"] });
      queryClient.invalidateQueries({ queryKey: ["stock-list"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao guardar afetacao.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.updateAfetacao(id, payload),
    onSuccess: (_, variables) => {
      setAssistantTab("item");
      setFormMessage(`Afetacao ${variables.id} atualizada com sucesso.`);
      setSelectionMessage("");
      setEditingId(null);
      setForm((current) => ({ ...INITIAL_FORM, data: current.data, iva: current.iva }));
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      queryClient.invalidateQueries({ queryKey: ["movimentos"] });
      queryClient.invalidateQueries({ queryKey: ["stock-list"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao atualizar afetacao.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteAfetacao,
    onSuccess: (_, id) => {
      setAssistantTab("item");
      setFormMessage(`Afetacao ${id} apagada com sucesso.`);
      if (editingId === id) {
        setEditingId(null);
        setForm(INITIAL_FORM);
        setSelectionMessage("");
      }
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      queryClient.invalidateQueries({ queryKey: ["movimentos"] });
      queryClient.invalidateQueries({ queryKey: ["stock-list"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao apagar afetacao.");
    },
  });

  useEffect(() => {
    if (!selectedCatalog || !form.id_item) return;
    setSelectionMessage(`Item ${String(selectedCatalog.id_item)} selecionado.`);
  }, [form.id_item, selectedCatalog]);

  const quantidade = toNumber(form.quantidade);
  const iva = toNumber(form.iva);
  const stockAtual = toNumber(String(stockQuery.data?.stock_atual ?? 0));
  const custoMedio = toNumber(String(stockQuery.data?.custo_medio_atual ?? 0));
  const custoSemIva = quantidade * custoMedio;
  const custoComIva = custoSemIva * (1 + iva / 100);
  const hasStockContext = Boolean(stockQuery.data && selectedCatalog);
  const lowStock = hasStockContext && quantidade > stockAtual;
  const recentAfetacoes = useMemo(() => (((afetacoesQuery.data as AfetacaoRow[] | undefined) ?? []).slice().reverse()), [afetacoesQuery.data]);
  const canSubmit = Boolean(selectedCatalog && form.obra && form.fase && quantidade > 0);
  const manualAfetacoesCount = useMemo(
    () => recentAfetacoes.filter((item) => String(item.origem ?? "") === "STOCK").length,
    [recentAfetacoes],
  );
  const workspaceModeLabel = editingId ? `A editar ${editingId}` : "Nova afetacao";
  const stockStateLabel = lowStock ? "Stock curto" : hasStockContext ? "Stock validado" : "Sem snapshot";
  const helperNotes = [
    workOptions.length ? "O campo `Obra` usa a lista carregada da Google Sheet." : null,
    availableFases.length ? "O campo `Fase` usa a lista global de fases carregada da Google Sheet." : null,
    "As afetacoes manuais usam sempre o custo medio atual do stock no momento da gravacao.",
  ].filter((note): note is string => Boolean(note));
  const formBusy = createMutation.isPending || updateMutation.isPending;

  function updateField(field: keyof AfetacaoFormState, value: string) {
    setFormMessage("");
    if (field === "id_item") {
      setSelectionMessage("");
    }
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyCatalogItem(item: CatalogItem) {
    setFormMessage("");
    setAssistantTab("stock");
    setSelectionMessage(`Item ${String(item.id_item)} aplicado a esta afetacao.`);
    setForm((current) => ({ ...current, id_item: String(item.id_item ?? "") }));
  }

  function startEdit(item: AfetacaoRow) {
    const id = String(item.id_afetacao ?? "");
    setFormMessage("");
    setAssistantTab("stock");
    setSelectionMessage(`A editar ${id}.`);
    setEditingId(id);
    setForm(toFormState(item));
  }

  function cancelEdit() {
    setEditingId(null);
    setAssistantTab("item");
    setForm(INITIAL_FORM);
    setFormMessage("");
    setSelectionMessage("");
  }

  return (
    <div className="detail-page">
      <section className="panel detail-hero">
        <div className="detail-hero-head">
          <div>
            <div className="mono muted">Afetacoes de Stock</div>
            <h3>Workspace de Consumo</h3>
            <div className="muted">A pagina passa a separar selecao do item, validacao de stock e historico tecnico para acelerar o registo no escritorio.</div>
          </div>
          <div className="inline-actions">
            <span className="tag">{workspaceModeLabel}</span>
            <span className={`tag ${lowStock ? "tag-danger" : "tag-success"}`}>{stockStateLabel}</span>
            <span className="tag tag-success">{manualAfetacoesCount} manual(is)</span>
          </div>
        </div>

        <div className="detail-header-grid">
          <div className="summary-card accent">
            <div className="summary-title">Item selecionado</div>
            {selectedCatalog ? (
              <>
                <div className="summary-main">{String(selectedCatalog.id_item)} | {String(selectedCatalog.item_oficial ?? "-")}</div>
                <div className="muted">{String(selectedCatalog.natureza ?? "-")} | {String(selectedCatalog.unidade ?? "-")}</div>
              </>
            ) : (
              <>
                <div className="summary-main">Sem item selecionado</div>
                <div className="muted">Pesquisa por ID, descricao ou item oficial antes de guardar.</div>
              </>
            )}
          </div>
          <div className="summary-card">
            <div className="summary-title">Stock atual</div>
            <div className="summary-main">{hasStockContext ? formatAmount(stockAtual, 2) : "-"}</div>
            <div className="muted">
              {hasStockContext ? `${formatAmount(custoMedio, 4)} custo medio atual` : "Sem snapshot de stock ainda."}
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Impacto estimado</div>
            <div className="summary-main">{formatAmount(custoSemIva)} sem IVA</div>
            <div className="muted">{formatAmount(custoComIva)} com IVA</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Historico manual</div>
            <div className="summary-main">{manualAfetacoesCount}</div>
            <div className="muted">{editingId ? `Correcao ativa em ${editingId}` : "Pronto para nova saida manual."}</div>
          </div>
        </div>
      </section>

      <div className="detail-shell">
        <section className="panel detail-main-panel">
          <div className="row-head">
            <div>
              <div className="section-kicker">Registo manual</div>
              <h3>{editingId ? `Editar ${editingId}` : "Nova Afetacao de Stock"}</h3>
              <div className="muted">
                {editingId ? "Corrige a saida manual de stock. As afetacoes geradas pela fatura continuam protegidas." : "Define o item, a quantidade e o destino operacional antes de gravar a saida."}
              </div>
            </div>
            {editingId ? (
              <button className="btn secondary" type="button" onClick={cancelEdit}>
                Cancelar edicao
              </button>
            ) : null}
          </div>

          {formMessage ? <div className="status-note">{formMessage}</div> : null}

          <form
            className="form detail-form"
            onSubmit={(event) => {
              event.preventDefault();
              setFormMessage("");
              const payload = {
                origem: "STOCK",
                data: form.data,
                id_item: form.id_item,
                quantidade,
                iva,
                obra: form.obra,
                fase: form.fase,
                observacoes: form.observacoes || null,
                processar: true,
              };
              if (editingId) {
                updateMutation.mutate({ id: editingId, payload });
                return;
              }
              createMutation.mutate(payload);
            }}
          >
          <div className="form-section">
            <div className="section-kicker">Passo 1: Item</div>
            <div className="section-copy">Seleciona o item a consumir e a data do registo. O rail lateral ajuda-te a confirmar item, stock e custo medio.</div>
            <div className="form-grid">
              <label>
                Data
                <input name="data" type="date" required value={form.data} onChange={(event) => updateField("data", event.target.value)} />
              </label>
              <label>
                ID_Item
                <input
                  name="id_item"
                  placeholder="Pesquisa por ID, descricao ou item oficial"
                  required
                  value={form.id_item}
                  onChange={(event) => updateField("id_item", event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="form-section">
            <div className="section-kicker">Passo 2: Consumo</div>
            <div className="section-copy">Define quantidade, IVA e destino operacional. A fase continua a ser guiada pelas listas do workbook.</div>
            <div className="form-grid">
              <label>
                Quantidade
                <input name="quantidade" type="number" step="0.01" required value={form.quantidade} onChange={(event) => updateField("quantidade", event.target.value)} />
              </label>
              <label>
                IVA %
                <input name="iva" type="number" step="0.01" value={form.iva} onChange={(event) => updateField("iva", event.target.value)} />
              </label>
              <label>
                Obra
                {workOptions.length ? (
                  <select name="obra" required value={form.obra} onChange={(event) => updateField("obra", event.target.value)}>
                    <option value="">Selecione</option>
                    {workOptions.map((item) => (
                      <option key={String(item.obra)} value={String(item.obra)}>
                        {String(item.obra)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input name="obra" required value={form.obra} onChange={(event) => updateField("obra", event.target.value)} />
                )}
              </label>
              <label>
                Fase
                {availableFases.length ? (
                  <select name="fase" required value={form.fase} onChange={(event) => updateField("fase", event.target.value)}>
                    <option value="">Selecione</option>
                    {availableFases.map((fase) => (
                      <option key={fase} value={fase}>
                        {fase}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input name="fase" required value={form.fase} onChange={(event) => updateField("fase", event.target.value)} />
                )}
              </label>
            </div>
          </div>

          <label>
            Observacoes
            <textarea name="observacoes" rows={3} value={form.observacoes} onChange={(event) => updateField("observacoes", event.target.value)} />
          </label>

          <div className="field-hint">O rail lateral mostra stock, custo medio e sugestoes do catalogo sem competir com o formulario principal.</div>

          <div className="form-actions detail-form-actions">
            <button className="btn primary" type="submit" disabled={formBusy || !canSubmit}>
              {formBusy ? "A guardar..." : editingId ? "Guardar alteracoes" : "Guardar"}
            </button>
          </div>
        </form>
      </section>
      
      <aside className="detail-side-column">
        <section className="panel detail-assistant-rail">
          <div className="assistant-rail-head">
            <div className="section-kicker">Assistente lateral</div>
            <h3>Validacao operacional</h3>
            <div className="muted">Confirma item, sugestoes e stock antes de gravar a saida manual.</div>
          </div>

          <div className="assistant-tabs" role="tablist" aria-label="Painel lateral de apoio">
            <button className={`assistant-tab ${assistantTab === "item" ? "active" : ""}`} onClick={() => setAssistantTab("item")} type="button">
              Item
            </button>
            <button className={`assistant-tab ${assistantTab === "stock" ? "active" : ""}`} onClick={() => setAssistantTab("stock")} type="button">
              Stock
            </button>
          </div>

          {assistantTab === "item" ? (
            <div className="assistant-tab-panel">
              <div className="summary-card accent compact">
                <div className="summary-title">Item em foco</div>
                {selectedCatalog ? (
                  <>
                    <div className="summary-main">{String(selectedCatalog.id_item)} | {String(selectedCatalog.item_oficial ?? "-")}</div>
                    <div className="muted">{String(selectedCatalog.natureza ?? "-")} | {String(selectedCatalog.unidade ?? "-")}</div>
                  </>
                ) : (
                  <>
                    <div className="summary-main">Sem item selecionado</div>
                    <div className="muted">Pesquisa por ID, descricao ou item oficial antes de guardar.</div>
                  </>
                )}
              </div>

              {selectionMessage ? <div className="status-note">{selectionMessage}</div> : null}

              <div className="assistant-block">
                <div className="assistant-head">
                  <strong>Sugestoes do catalogo</strong>
                  <span className="muted">Escolhe o item certo antes de consumir stock para evitar erros de custo.</span>
                </div>
                {suggestions.length ? (
                  <div className="suggestion-list">
                    {suggestions.map(({ item }) => (
                      <button
                        className={`suggestion-card ${String(item.id_item ?? "") === form.id_item ? "active" : ""}`}
                        key={String(item.id_item)}
                        onClick={(event) => {
                          event.preventDefault();
                          applyCatalogItem(item);
                        }}
                        type="button"
                        >
                          <div className="row-head">
                            <strong>{String(item.id_item)}</strong>
                            <span className="tag">{String(item.natureza ?? "-")}</span>
                          </div>
                          <div>{String(item.item_oficial ?? "-")}</div>
                          <div className="muted">
                            {catalogReferences(item).length
                              ? catalogReferences(item).slice(0, 3).join(" | ")
                              : "Sem referencias registadas."}
                          </div>
                        </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-note">Ainda nao ha sugestoes. Escreve um ID, descricao ou item oficial.</div>
                )}
              </div>
            </div>
          ) : null}

          {assistantTab === "stock" ? (
            <div className="assistant-tab-panel">
              <div className="summary-card compact">
                <div className="summary-title">Snapshot de stock</div>
                <div className="summary-main">{hasStockContext ? `${formatAmount(stockAtual, 2)} ${String(selectedCatalog?.unidade ?? "")}` : "-"}</div>
                <div className="muted">{hasStockContext ? `${formatAmount(custoMedio, 4)} custo medio atual` : "Sem snapshot carregado."}</div>
              </div>

              <div className="assistant-block">
                <div className="assistant-head">
                  <strong>Contexto de stock</strong>
                  <span className="muted">A app recalcula o movimento tecnico sempre que guardas ou corriges esta afetacao manual.</span>
                </div>
                <div className="impact-list">
                  <div className="impact-row">
                    <div className="impact-entity">STOCK</div>
                    <div>
                      <div>{hasStockContext ? `${formatAmount(stockAtual, 2)} ${String(selectedCatalog?.unidade ?? "")} disponiveis` : "Seleciona um item para ver stock."}</div>
                      <div className="muted">{hasStockContext ? `Custo medio atual: ${formatAmount(custoMedio, 4)}` : "Sem snapshot carregado."}</div>
                    </div>
                  </div>
                  <div className="impact-row">
                    <div className="impact-entity">SAIDA</div>
                    <div>
                      <div>{formatAmount(quantidade, 2)} {String(selectedCatalog?.unidade ?? "")} para {form.obra || "-"} / {form.fase || "-"}</div>
                      <div className="muted">{formatAmount(custoSemIva)} sem IVA | {formatAmount(custoComIva)} com IVA</div>
                    </div>
                  </div>
                </div>
                {stockQuery.isError ? <div className="status-note">{stockQuery.error instanceof Error ? stockQuery.error.message : "Falha ao carregar stock."}</div> : null}
                {lowStock ? <div className="status-note warning">A quantidade pedida e superior ao stock atual visivel. A app vai tentar guardar na mesma.</div> : null}
              </div>

              {helperNotes.length ? (
                <details className="assistant-collapsible">
                  <summary>Notas operacionais</summary>
                  <div className="assistant-note-list">
                    {helperNotes.map((note) => (
                      <div className="field-hint" key={note}>
                        {note}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
        </section>
      </aside>
      </div>

      <section className="panel detail-history-panel">
        <div className="row-head">
          <div>
            <div className="section-kicker">Historico recente</div>
            <h3>Afetacoes</h3>
            <div className="muted">Reve rapidamente saidas manuais e registos gerados pela fatura sem misturar isso com o workspace principal.</div>
          </div>
        </div>
        <div className="list detail-history-list">
          {recentAfetacoes.map((item) => {
            const id = String(item.id_afetacao ?? "");
            const manual = String(item.origem ?? "") === "STOCK";
            return (
              <div className={`list-row list-row-compact ${editingId === id ? "list-row-active" : ""}`} key={id}>
                <div className="list-row-body">
                  <div className="list-row-title">
                    <strong>{String(item.item_oficial ?? item.id_item)}</strong>
                    <div className="inline-actions">
                      <span className="tag">{String(item.origem ?? "-")}</span>
                      <span className="tag">{String(item.estado ?? "-")}</span>
                      {manual ? null : <span className="tag tag-success">Gerada</span>}
                    </div>
                  </div>
                  <div className="list-row-meta">
                    <span className="mono">{id}</span>
                    <span>{String(item.obra)} / {String(item.fase)}</span>
                  </div>
                  <details className="list-row-collapsible">
                    <summary>Ver detalhe operacional</summary>
                    <div className="list-row-facts">
                      <span>{formatAmount(Number(item.quantidade ?? 0), 2)} {String(item.unidade ?? "")}</span>
                      <span>{String(item.origem ?? "-")} | {String(item.estado ?? "-")}</span>
                      <span>{String(item.data ?? "-")}</span>
                    </div>
                  </details>
                </div>
                <div className="list-row-actions">
                  {manual ? (
                    <>
                      <button className="btn secondary" type="button" onClick={() => startEdit(item)}>
                        Editar
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (!window.confirm(`Apagar a afetacao ${id}? O movimento tecnico associado tambem sera removido.`)) {
                            return;
                          }
                          setFormMessage("");
                          deleteMutation.mutate(id);
                        }}
                      >
                        Apagar
                      </button>
                    </>
                  ) : (
                    <span className="tag">Gerada pela fatura</span>
                  )}
                </div>
              </div>
            );
          })}
          {!recentAfetacoes.length ? <div className="empty-note">Ainda nao existem afetacoes registadas.</div> : null}
        </div>
      </section>
    </div>
  );
}
