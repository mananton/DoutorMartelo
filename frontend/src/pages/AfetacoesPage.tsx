import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/api";

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
  fornecedor?: string;
  descricao_original?: string;
  item_oficial?: string;
  natureza?: string;
  unidade?: string;
};

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

function scoreCatalogItem(item: CatalogItem, search: string) {
  const normalizedSearch = normalize(search);
  const itemId = normalize(item.id_item);
  const itemOficial = normalize(item.item_oficial);
  const itemDescricao = normalize(item.descricao_original);
  const itemFornecedor = normalize(item.fornecedor);
  if (!normalizedSearch) return 0;

  let score = 0;
  if (itemId === normalizedSearch) score += 120;
  if (itemOficial === normalizedSearch) score += 90;
  if (itemDescricao === normalizedSearch) score += 70;
  if (itemId.includes(normalizedSearch)) score += 45;
  if (itemOficial.includes(normalizedSearch)) score += 40;
  if (itemDescricao.includes(normalizedSearch)) score += 30;
  if (itemFornecedor.includes(normalizedSearch)) score += 15;
  return score;
}

export function AfetacoesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AfetacaoFormState>(INITIAL_FORM);
  const [formMessage, setFormMessage] = useState<string>("");
  const [selectionMessage, setSelectionMessage] = useState<string>("");

  const afetacoesQuery = useQuery({ queryKey: ["afetacoes"], queryFn: api.listAfetacoes });
  const catalogQuery = useQuery({ queryKey: ["catalogo"], queryFn: api.listCatalog });

  const selectedCatalog = ((catalogQuery.data as CatalogItem[] | undefined) ?? []).find((item) => String(item.id_item ?? "") === form.id_item);
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
      setFormMessage("Afetacao guardada com sucesso.");
      setSelectionMessage("");
      setForm((current) => ({ ...INITIAL_FORM, data: current.data, iva: current.iva }));
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      if (selectedCatalog) {
        queryClient.invalidateQueries({ queryKey: ["stock", selectedCatalog.id_item] });
      }
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao guardar afetacao.");
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
  const recentAfetacoes = useMemo(() => (afetacoesQuery.data ?? []).slice().reverse(), [afetacoesQuery.data]);
  const canSubmit = Boolean(selectedCatalog && form.obra && form.fase && quantidade > 0);

  function updateField(field: keyof AfetacaoFormState, value: string) {
    setFormMessage("");
    if (field === "id_item") {
      setSelectionMessage("");
    }
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyCatalogItem(item: CatalogItem) {
    setFormMessage("");
    setSelectionMessage(`Item ${String(item.id_item)} aplicado a esta afetacao.`);
    setForm((current) => ({ ...current, id_item: String(item.id_item ?? "") }));
  }

  return (
    <div className="grid two">
      <section className="panel">
        <h3>Nova Afetacao de Stock</h3>
        <div className="form-summary-grid">
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
        </div>

        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            setFormMessage("");
            createMutation.mutate({
              origem: "STOCK",
              data: form.data,
              id_item: form.id_item,
              quantidade: quantidade,
              iva: iva,
              obra: form.obra,
              fase: form.fase,
              observacoes: form.observacoes || null,
              processar: true,
            });
          }}
        >
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
              <input name="obra" required value={form.obra} onChange={(event) => updateField("obra", event.target.value)} />
            </label>
            <label>
              Fase
              <input name="fase" required value={form.fase} onChange={(event) => updateField("fase", event.target.value)} />
            </label>
          </div>

          <label>
            Observacoes
            <textarea name="observacoes" rows={3} value={form.observacoes} onChange={(event) => updateField("observacoes", event.target.value)} />
          </label>

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
                    <div className="muted">{String(item.fornecedor ?? "-")} | {String(item.descricao_original ?? "-")}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-note">Ainda nao ha sugestoes. Escreve um ID, descricao ou item oficial.</div>
            )}
          </div>

          <div className="assistant-block">
            <div className="assistant-head">
              <strong>Contexto de stock</strong>
              <span className="muted">O custo medio atual sera usado quando guardares esta saida de stock.</span>
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
            {selectionMessage ? <div className="status-note">{selectionMessage}</div> : null}
            {stockQuery.isError ? <div className="status-note">{stockQuery.error instanceof Error ? stockQuery.error.message : "Falha ao carregar stock."}</div> : null}
            {lowStock ? <div className="status-note warning">A quantidade pedida e superior ao stock atual visivel. A app vai tentar guardar na mesma.</div> : null}
          </div>

          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={createMutation.isPending || !canSubmit}>
              {createMutation.isPending ? "A guardar..." : "Guardar"}
            </button>
          </div>
          {formMessage ? <div className="status-note">{formMessage}</div> : null}
        </form>
      </section>
      <section className="panel">
        <h3>Afetacoes</h3>
        <div className="list">
          {recentAfetacoes.map((item) => (
            <div className="list-row" key={String(item.id_afetacao)}>
              <div className="row-head">
                <div className="mono">{String(item.id_afetacao)}</div>
                <span className={`tag ${String(item.estado).includes("FALTA") ? "tag-danger" : "tag-success"}`}>{String(item.estado)}</span>
              </div>
              <div>{String(item.item_oficial ?? item.id_item)} | {String(item.obra)} / {String(item.fase)}</div>
              <div className="muted">{String(item.quantidade ?? 0)} {String(item.unidade ?? "")} | {String(item.origem ?? "-")}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
