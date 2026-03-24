import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { api } from "../lib/api";
import type { WorkOption } from "../lib/workOptions";

type NoteCreditItemFormState = {
  descricao_original: string;
  id_item: string;
  item_oficial: string;
  natureza: string;
  unidade: string;
  quantidade: string;
  custo_unit: string;
  iva: string;
  categoria_nota_credito: "NC_COM_OBRA" | "NC_SEM_OBRA";
  obra: string;
  fase: string;
  observacoes: string;
};

type CatalogItem = Record<string, unknown> & {
  id_item?: string;
  item_oficial?: string;
  natureza?: string;
  unidade?: string;
};

type NoteCreditItemRow = Record<string, unknown> & {
  id_item_nota_credito?: string;
  descricao_original?: string;
  id_item?: string;
  item_oficial?: string;
  natureza?: string;
  unidade?: string;
  quantidade?: number;
  custo_unit?: number;
  iva?: number;
  custo_total_sem_iva?: number;
  custo_total_com_iva?: number;
  categoria_nota_credito?: string;
  obra?: string;
  fase?: string;
  estado?: string;
  observacoes?: string;
};

type ImpactItem = {
  entity: string;
  source: string;
  summary: string;
};

const INITIAL_FORM: NoteCreditItemFormState = {
  descricao_original: "",
  id_item: "",
  item_oficial: "",
  natureza: "",
  unidade: "",
  quantidade: "",
  custo_unit: "",
  iva: "23",
  categoria_nota_credito: "NC_SEM_OBRA",
  obra: "",
  fase: "",
  observacoes: "",
};

const NATUREZA_OPTIONS = ["MATERIAL", "SERVICO", "ALUGUER", "TRANSPORTE", "GASOLEO", "GASOLINA"] as const;
const UNIT_OPTIONS = ["un", "Kg", "Lt", "Ton", "m", "m2", "m3"] as const;

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

function suggestItemOficialFromDescription(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toUpperCase();
}

function toFormState(item: NoteCreditItemRow): NoteCreditItemFormState {
  return {
    descricao_original: String(item.descricao_original ?? ""),
    id_item: String(item.id_item ?? ""),
    item_oficial: String(item.item_oficial ?? ""),
    natureza: String(item.natureza ?? ""),
    unidade: String(item.unidade ?? ""),
    quantidade: String(item.quantidade ?? ""),
    custo_unit: String(item.custo_unit ?? ""),
    iva: String(item.iva ?? 23),
    categoria_nota_credito: String(item.categoria_nota_credito ?? "NC_SEM_OBRA") === "NC_COM_OBRA" ? "NC_COM_OBRA" : "NC_SEM_OBRA",
    obra: String(item.obra ?? ""),
    fase: String(item.fase ?? ""),
    observacoes: String(item.observacoes ?? ""),
  };
}

export function NotaCreditoDetailPage() {
  const { idFatura = "" } = useParams();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<NoteCreditItemFormState>(INITIAL_FORM);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string>("");
  const [catalogMessage, setCatalogMessage] = useState<string>("");

  const detail = useQuery({
    queryKey: ["fatura", idFatura],
    queryFn: () => api.getFatura(idFatura),
    enabled: !!idFatura,
  });
  const catalogQuery = useQuery({ queryKey: ["catalogo"], queryFn: api.listCatalog });
  const workOptionsQuery = useQuery({ queryKey: ["work-options"], queryFn: api.getWorkOptions });

  const createCatalog = useMutation({
    mutationFn: api.createCatalog,
    onSuccess: (created) => {
      const itemId = String(created.id_item ?? "");
      setCatalogMessage(`Item ${itemId} criado no catalogo e associado a esta linha.`);
      setForm((current) => ({
        ...current,
        id_item: itemId,
        item_oficial: String(created.item_oficial ?? current.item_oficial),
        natureza: String(created.natureza ?? current.natureza),
        unidade: String(created.unidade ?? current.unidade),
      }));
      queryClient.invalidateQueries({ queryKey: ["catalogo"] });
    },
    onError: (error) => {
      setCatalogMessage(error instanceof Error ? error.message : "Falha ao criar item oficial.");
    },
  });

  const createItems = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.createNotaCreditoItems(idFatura, payload),
    onSuccess: () => {
      setFormMessage("Linha da nota de credito guardada com sucesso.");
      setCatalogMessage("");
      setForm(INITIAL_FORM);
      queryClient.invalidateQueries({ queryKey: ["fatura", idFatura] });
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      queryClient.invalidateQueries({ queryKey: ["movimentos"] });
      queryClient.invalidateQueries({ queryKey: ["stock-list"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao guardar linha da nota de credito.");
    },
  });

  const updateItem = useMutation({
    mutationFn: ({ itemId, payload }: { itemId: string; payload: Record<string, unknown> }) => api.updateNotaCreditoItem(idFatura, itemId, payload),
    onSuccess: (_, variables) => {
      setFormMessage(`Linha ${variables.itemId} atualizada com sucesso.`);
      setCatalogMessage("");
      setEditingItemId(null);
      setForm(INITIAL_FORM);
      queryClient.invalidateQueries({ queryKey: ["fatura", idFatura] });
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      queryClient.invalidateQueries({ queryKey: ["movimentos"] });
      queryClient.invalidateQueries({ queryKey: ["stock-list"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao atualizar linha da nota de credito.");
    },
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => api.deleteNotaCreditoItem(idFatura, itemId),
    onSuccess: (_, itemId) => {
      setFormMessage(`Linha ${itemId} apagada com sucesso.`);
      if (editingItemId === itemId) {
        setEditingItemId(null);
        setForm(INITIAL_FORM);
        setCatalogMessage("");
      }
      queryClient.invalidateQueries({ queryKey: ["fatura", idFatura] });
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      queryClient.invalidateQueries({ queryKey: ["movimentos"] });
      queryClient.invalidateQueries({ queryKey: ["stock-list"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao apagar linha da nota de credito.");
    },
  });

  const catalog = ((catalogQuery.data as CatalogItem[] | undefined) ?? []);
  const selectedCatalog = catalog.find((item) => String(item.id_item ?? "") === form.id_item);
  const workOptions = ((workOptionsQuery.data?.obras as WorkOption[] | undefined) ?? []);
  const allFases = useMemo(
    () =>
      Array.from(
        new Set(
          workOptions.flatMap((item) => item.fases ?? []),
        ),
      ).sort((left, right) => left.localeCompare(right, "pt-PT")),
    [workOptions],
  );

  useEffect(() => {
    if (!selectedCatalog || !form.id_item) return;
    setForm((current) => {
      if (
        current.item_oficial === String(selectedCatalog.item_oficial ?? "") &&
        current.natureza === String(selectedCatalog.natureza ?? "") &&
        current.unidade === String(selectedCatalog.unidade ?? "")
      ) {
        return current;
      }
      return {
        ...current,
        item_oficial: String(selectedCatalog.item_oficial ?? ""),
        natureza: String(selectedCatalog.natureza ?? ""),
        unidade: String(selectedCatalog.unidade ?? ""),
      };
    });
  }, [form.id_item, selectedCatalog]);

  function updateField(field: keyof NoteCreditItemFormState, value: string) {
    setFormMessage("");
    setCatalogMessage("");
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "descricao_original") {
        const previousSuggested = suggestItemOficialFromDescription(current.descricao_original);
        const nextSuggested = suggestItemOficialFromDescription(value);
        if (nextSuggested && (!current.item_oficial.trim() || normalize(current.item_oficial) === normalize(previousSuggested))) {
          next.item_oficial = nextSuggested;
        }
      }
      if (field === "id_item" && !value) {
        next.item_oficial = "";
        next.natureza = "";
        next.unidade = "";
      }
      if (field === "categoria_nota_credito" && value === "NC_SEM_OBRA") {
        next.obra = "";
        next.fase = "";
      }
      return next;
    });
  }

  function startEdit(item: NoteCreditItemRow) {
    setEditingItemId(String(item.id_item_nota_credito ?? ""));
    setForm(toFormState(item));
    setFormMessage("");
    setCatalogMessage(`A editar ${String(item.id_item_nota_credito ?? "")}.`);
  }

  function cancelEdit() {
    setEditingItemId(null);
    setForm(INITIAL_FORM);
    setFormMessage("");
    setCatalogMessage("");
  }

  function handleQuickCreate() {
    createCatalog.mutate({
      descricao_original: form.descricao_original,
      item_oficial: form.item_oficial,
      natureza: form.natureza,
      unidade: form.unidade,
      observacoes: form.observacoes || null,
    });
  }

  const existingItems = ((detail.data?.items as NoteCreditItemRow[] | undefined) ?? []);
  const existingItemsTotals = existingItems.reduce<{ semIva: number; comIva: number }>(
    (acc, item) => {
      acc.semIva += Number(item.custo_total_sem_iva ?? 0);
      acc.comIva += Number(item.custo_total_com_iva ?? 0);
      return acc;
    },
    { semIva: 0, comIva: 0 },
  );
  const fatura = (detail.data?.fatura as Record<string, unknown> | undefined) ?? {};
  const fornecedorAtual = String(fatura.fornecedor ?? "");
  const documentoAtual = String(fatura.nr_documento ?? "-");
  const documentoOrigem = String(fatura.doc_origem ?? "-");
  const dataAtual = String(fatura.data_fatura ?? "-");
  const valorSemIva = Number(fatura.valor_sem_iva ?? 0);
  const valorComIva = Number(fatura.valor_com_iva ?? 0);
  const quantidade = toNumber(form.quantidade);
  const custoUnit = toNumber(form.custo_unit);
  const iva = toNumber(form.iva);
  const totalSemIva = quantidade * custoUnit;
  const totalComIva = totalSemIva * (1 + iva / 100);
  const canQuickCreate = Boolean(form.descricao_original && form.item_oficial && form.natureza && form.unidade);
  const helperNotes = [
    form.categoria_nota_credito === "NC_COM_OBRA" ? "Nesta categoria, `Obra` e `Fase` sao obrigatorias para reduzir custo na obra." : "Nesta categoria, a linha fica apenas registada na nota sem afetacao a obra.",
    form.natureza === "MATERIAL" ? "Material gera sempre movimento tecnico de saida em stock nesta nota de credito." : "Naturezas nao materiais nao mexem no stock; ficam apenas no documento e, se aplicavel, na reducao de obra.",
  ];
  const localImpacts: ImpactItem[] = [];
  if (form.natureza === "MATERIAL") {
    localImpacts.push({ entity: "MATERIAIS_MOV", source: "NOTAS_CREDITO_ITENS", summary: "Vai gerar saida tecnica de stock." });
  }
  if (form.categoria_nota_credito === "NC_COM_OBRA") {
    localImpacts.push({ entity: "AFETACOES_OBRA", source: "NOTAS_CREDITO_ITENS", summary: "Vai gerar reducao de custo na obra/fase." });
    localImpacts.push({ entity: "MATERIAIS_MOV", source: "AFETACOES_OBRA", summary: "Vai gerar movimento tecnico de regularizacao da obra." });
  }
  const workspaceModeLabel = editingItemId ? `A editar ${editingItemId}` : "Nova linha";
  const formBusy = createItems.isPending || updateItem.isPending;

  return (
    <div className="detail-page">
      <section className="panel detail-hero">
        <div className="detail-hero-head">
          <div>
            <div className="mono muted">Nota de Credito {idFatura}</div>
            <h3>Workspace de Regularizacao</h3>
            <div className="muted">Cada linha decide se a nota reduz custo numa obra/fase e se gera saida tecnica de stock.</div>
          </div>
          <div className="inline-actions">
            <span className="tag">{workspaceModeLabel}</span>
            <span className="tag">Origem {documentoOrigem}</span>
            <span className="tag tag-success">{existingItems.length} linha(s)</span>
          </div>
        </div>
        <div className="detail-header-grid">
          <div className="summary-card accent">
            <div className="summary-title">Fornecedor</div>
            <div className="summary-main">{fornecedorAtual || "-"}</div>
            <div className="muted">Base de mapeamento e criacao rapida de item oficial.</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Documento</div>
            <div className="summary-main">{documentoAtual}</div>
            <div className="muted">{dataAtual} | origem {documentoOrigem}</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Totais do documento</div>
            <div className="summary-main">{formatAmount(valorSemIva)} sem IVA</div>
            <div className="muted">{formatAmount(valorComIva)} com IVA</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Linhas lancadas</div>
            <div className="summary-main">{existingItems.length}</div>
            <div className="muted">{editingItemId ? `Edicao ativa em ${editingItemId}` : "Pronto para nova linha."}</div>
          </div>
        </div>
      </section>

      <div className="detail-shell">
        <section className="panel detail-main-panel">
          <div className="row-head">
            <div>
              <div className="section-kicker">Linha em trabalho</div>
              <h3>{editingItemId ? `Editar Linha ${editingItemId}` : "Adicionar Linha"}</h3>
              <div className="muted">A linha fica sempre positiva na sheet; o motor transforma-a em credito quando gera os impactos tecnicos.</div>
            </div>
            {editingItemId ? (
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
                descricao_original: form.descricao_original,
                quantidade: toNumber(form.quantidade),
                custo_unit: toNumber(form.custo_unit),
                iva: toNumber(form.iva),
                categoria_nota_credito: form.categoria_nota_credito,
                obra: form.categoria_nota_credito === "NC_COM_OBRA" ? form.obra || null : null,
                fase: form.categoria_nota_credito === "NC_COM_OBRA" ? form.fase || null : null,
                observacoes: form.observacoes || null,
                id_item: form.id_item || null,
                item_oficial: form.item_oficial || null,
                natureza: form.natureza || null,
                unidade: form.unidade || null,
              };
              if (editingItemId) {
                updateItem.mutate({ itemId: editingItemId, payload });
                return;
              }
              createItems.mutate({ items: [payload] });
            }}
          >
            <div className="form-section">
              <div className="section-kicker">Item e mapeamento</div>
              <div className="section-copy">Mapeia a linha ao catalogo para garantir o item oficial, a natureza e a unidade usados nos impactos tecnicos.</div>
              <div className="form-grid">
                <label>
                  Descricao Original
                  <input name="descricao_original" required value={form.descricao_original} onChange={(event) => updateField("descricao_original", event.target.value)} />
                </label>
                <label>
                  Fornecedor da nota
                  <input value={fornecedorAtual} disabled readOnly />
                </label>
                <label>
                  ID_Item existente
                  <input list="nc-catalog-options" name="id_item" value={form.id_item} onChange={(event) => updateField("id_item", event.target.value)} />
                  <datalist id="nc-catalog-options">
                    {catalog.map((item) => {
                      const idItem = String(item.id_item ?? "");
                      if (!idItem) return null;
                      return <option key={idItem} value={idItem} label={String(item.item_oficial ?? "")} />;
                    })}
                  </datalist>
                </label>
                <label>
                  Item Oficial
                  <input name="item_oficial" value={form.item_oficial} onChange={(event) => updateField("item_oficial", event.target.value)} />
                </label>
                <label>
                  Natureza
                  <select name="natureza" value={form.natureza} onChange={(event) => updateField("natureza", event.target.value)}>
                    <option value="">Selecione</option>
                    {NATUREZA_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Unidade
                  <select name="unidade" value={form.unidade} onChange={(event) => updateField("unidade", event.target.value)}>
                    <option value="">Selecione</option>
                    {UNIT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="inline-actions">
                <button className="btn secondary" type="button" disabled={!canQuickCreate || createCatalog.isPending} onClick={handleQuickCreate}>
                  {createCatalog.isPending ? "A criar..." : "Criar item no catalogo"}
                </button>
              </div>
              {catalogMessage ? <div className="field-hint">{catalogMessage}</div> : null}
            </div>

            <div className="form-section">
              <div className="section-kicker">Valores do credito</div>
              <div className="section-copy">As quantidades e os valores ficam positivos na linha; a logica de credito e aplicada a jusante.</div>
              <div className="form-grid">
                <label>Quantidade<input name="quantidade" type="number" step="0.01" required value={form.quantidade} onChange={(event) => updateField("quantidade", event.target.value)} /></label>
                <label>Custo Unit<input name="custo_unit" type="number" step="0.01" required value={form.custo_unit} onChange={(event) => updateField("custo_unit", event.target.value)} /></label>
                <label>IVA %<input name="iva" type="number" step="0.01" value={form.iva} onChange={(event) => updateField("iva", event.target.value)} /></label>
                <label>Total Sem IVA<input value={quantidade > 0 ? formatAmount(totalSemIva, 2) : ""} disabled readOnly /></label>
                <label>Total Com IVA<input value={quantidade > 0 ? formatAmount(totalComIva, 2) : ""} disabled readOnly /></label>
              </div>
            </div>

            <div className="form-section">
              <div className="section-kicker">Categoria operacional</div>
              <div className="section-copy">Define se a linha reduz uma obra/fase especifica ou se fica apenas registada na nota sem atribuicao operacional.</div>
              <div className="form-grid">
                <label>
                  Categoria_Nota_Credito
                  <select name="categoria_nota_credito" value={form.categoria_nota_credito} onChange={(event) => updateField("categoria_nota_credito", event.target.value)}>
                    <option value="NC_SEM_OBRA">NC_SEM_OBRA</option>
                    <option value="NC_COM_OBRA">NC_COM_OBRA</option>
                  </select>
                </label>
                <label>
                  Obra
                  <input
                    list="nc-obra-options"
                    name="obra"
                    value={form.obra}
                    disabled={form.categoria_nota_credito !== "NC_COM_OBRA"}
                    onChange={(event) => updateField("obra", event.target.value)}
                  />
                  <datalist id="nc-obra-options">
                    {workOptions.map((option) => (
                      <option key={option.obra} value={option.obra} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Fase
                  <input
                    list="nc-fase-options"
                    name="fase"
                    value={form.fase}
                    disabled={form.categoria_nota_credito !== "NC_COM_OBRA"}
                    onChange={(event) => updateField("fase", event.target.value)}
                  />
                  <datalist id="nc-fase-options">
                    {allFases.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </label>
              </div>
            </div>

            <label>
              Observacoes
              <textarea name="observacoes" rows={3} value={form.observacoes} onChange={(event) => updateField("observacoes", event.target.value)} />
            </label>

            <div className="detail-header-grid">
              <div className="summary-card accent">
                <div className="summary-title">Resumo da linha</div>
                <div className="summary-main">{formatAmount(totalSemIva)} sem IVA</div>
                <div className="muted">{formatAmount(totalComIva)} com IVA</div>
              </div>
              <div className="summary-card">
                <div className="summary-title">Categoria</div>
                <div className="summary-main">{form.categoria_nota_credito}</div>
                <div className="muted">{form.categoria_nota_credito === "NC_COM_OBRA" ? `${form.obra || "-"} / ${form.fase || "-"}` : "Sem atribuicao a obra/fase"}</div>
              </div>
              <div className="summary-card">
                <div className="summary-title">Impactos previstos</div>
                <div className="summary-main">{localImpacts.length}</div>
                <div className="muted">{localImpacts.length ? "Gerados a partir desta linha." : "Sem impacto tecnico adicional."}</div>
              </div>
            </div>

            {helperNotes.map((note) => (
              <div key={note} className="field-hint">{note}</div>
            ))}

            <div className="form-actions detail-form-actions">
              <button className="btn primary" type="submit" disabled={formBusy}>
                {formBusy ? "A guardar..." : editingItemId ? "Guardar alteracoes" : "Guardar linha"}
              </button>
            </div>
          </form>
        </section>

        <aside className="panel detail-side-panel">
          <div className="row-head">
            <div>
              <div className="section-kicker">Impacto tecnico</div>
              <h3>Resumo da Linha</h3>
              <div className="muted">A nota de credito pode mexer em stock, em custo de obra, ou em ambos, conforme a linha.</div>
            </div>
          </div>
          <div className="stack-list">
            {localImpacts.map((impact) => (
              <div key={`${impact.entity}-${impact.source}-${impact.summary}`} className="list-row">
                <strong>{impact.entity}</strong>
                <div className="muted">{impact.source}</div>
                <div>{impact.summary}</div>
              </div>
            ))}
            {!localImpacts.length ? <div className="empty-note">Esta linha fica apenas registada no documento, sem impacto tecnico adicional.</div> : null}
          </div>
        </aside>
      </div>

      <section className="panel">
        <div className="row-head">
          <div>
            <div className="section-kicker">Linhas registadas</div>
            <h3>Historico da Nota</h3>
            <div className="muted">{formatAmount(existingItemsTotals.semIva)} sem IVA | {formatAmount(existingItemsTotals.comIva)} com IVA nas linhas ja lancadas.</div>
          </div>
        </div>
        <div className="queue-list">
          {existingItems.map((item) => {
            const id = String(item.id_item_nota_credito ?? "");
            return (
              <div key={id} className={`list-row queue-card ${editingItemId === id ? "list-row-active" : ""}`}>
                <div className="queue-card-head">
                  <div className="queue-card-main">
                    <div className="mono">{id}</div>
                    <strong>{String(item.item_oficial ?? item.descricao_original ?? "-")}</strong>
                    <div className="muted">
                      {String(item.descricao_original ?? "-")}
                      {String(item.obra ?? "") ? ` | ${String(item.obra ?? "")}${String(item.fase ?? "") ? ` / ${String(item.fase ?? "")}` : ""}` : ""}
                    </div>
                  </div>
                  <div className="queue-card-metrics">
                    <span className="tag">{String(item.categoria_nota_credito ?? "NC_SEM_OBRA")}</span>
                    {String(item.natureza ?? "") === "MATERIAL" ? <span className="tag">Stock</span> : null}
                    <span className="tag">{formatAmount(Number(item.quantidade ?? 0), 2)} {String(item.unidade ?? "")}</span>
                    <span className="tag">{formatAmount(Number(item.custo_total_com_iva ?? 0))} com IVA</span>
                  </div>
                </div>
                <div className="inline-actions">
                  <button className="btn secondary" type="button" onClick={() => startEdit(item)}>
                    Editar
                  </button>
                  <button
                    className="btn danger"
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`Apagar a linha ${id}? Os movimentos tecnicos e reducoes de custo gerados por esta linha tambem serao removidos.`)) {
                        return;
                      }
                      deleteItem.mutate(id);
                    }}
                    disabled={deleteItem.isPending}
                  >
                    Apagar
                  </button>
                </div>
              </div>
            );
          })}
          {!existingItems.length ? <div className="empty-note">Ainda nao existem linhas associadas a esta nota de credito.</div> : null}
        </div>
      </section>
    </div>
  );
}
