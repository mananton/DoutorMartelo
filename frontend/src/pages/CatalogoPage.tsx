import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { api } from "../lib/api";

type CatalogFormState = {
  descricao_original: string;
  item_oficial: string;
  natureza: string;
  unidade: string;
  observacoes: string;
};

type CatalogRow = Record<string, unknown> & {
  id_item?: string;
  item_oficial?: string;
  natureza?: string;
  unidade?: string;
  observacoes?: string;
  estado_cadastro?: string;
  referencias?: string[];
  reference_count?: number;
};

const INITIAL_FORM: CatalogFormState = {
  descricao_original: "",
  item_oficial: "",
  natureza: "MATERIAL",
  unidade: "",
  observacoes: "",
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toFormState(item: CatalogRow): CatalogFormState {
  return {
    descricao_original: "",
    item_oficial: String(item.item_oficial ?? ""),
    natureza: String(item.natureza ?? "MATERIAL"),
    unidade: String(item.unidade ?? ""),
    observacoes: String(item.observacoes ?? ""),
  };
}

export function CatalogoPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CatalogFormState>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const { data } = useQuery({ queryKey: ["catalogo"], queryFn: api.listCatalog });
  const catalogo = useMemo(() => ((data as CatalogRow[] | undefined) ?? []), [data]);
  const filteredCatalogo = useMemo(() => {
    const search = normalize(searchTerm);
    if (!search) return catalogo;
    return catalogo.filter((item) =>
      [
        String(item.id_item ?? ""),
        String(item.item_oficial ?? ""),
        ...(((item.referencias as string[] | undefined) ?? []).map((value) => String(value))),
      ]
        .map(normalize)
        .some((value) => value.includes(search)),
    );
  }, [catalogo, searchTerm]);

  const duplicateMatch = useMemo(() => {
    const itemOficial = normalize(form.item_oficial);
    if (!itemOficial) return null;
    return catalogo.find((item) => {
      if (editingId && String(item.id_item ?? "") === editingId) {
        return false;
      }
      return normalize(String(item.item_oficial ?? "")) === itemOficial;
    }) ?? null;
  }, [catalogo, editingId, form.item_oficial]);

  const createMutation = useMutation({
    mutationFn: api.createCatalog,
    onSuccess: () => {
      setFormMessage("Item oficial guardado com sucesso.");
      setForm(INITIAL_FORM);
      queryClient.invalidateQueries({ queryKey: ["catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao guardar item oficial.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.updateCatalog(id, payload),
    onSuccess: (_, variables) => {
      setFormMessage(`Item ${variables.id} atualizado com sucesso.`);
      setEditingId(null);
      setForm(INITIAL_FORM);
      queryClient.invalidateQueries({ queryKey: ["catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["fatura"] });
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      queryClient.invalidateQueries({ queryKey: ["movimentos"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao atualizar item oficial.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteCatalog,
    onSuccess: (_, id) => {
      setFormMessage(`Item ${id} apagado com sucesso.`);
      if (editingId === id) {
        setEditingId(null);
        setForm(INITIAL_FORM);
      }
      queryClient.invalidateQueries({ queryKey: ["catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao apagar item oficial.");
    },
  });

  function updateField(field: keyof CatalogFormState, value: string) {
    setFormMessage("");
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEdit(item: CatalogRow) {
    setFormMessage("");
    setEditingId(String(item.id_item ?? ""));
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

  const canSubmit = Boolean(form.item_oficial && form.natureza && form.unidade) && !duplicateMatch;
  const activeCount = useMemo(
    () => catalogo.filter((item) => String(item.estado_cadastro ?? "ATIVO") === "ATIVO").length,
    [catalogo],
  );
  const withReferencesCount = useMemo(
    () => catalogo.filter((item) => Number(item.reference_count ?? ((item.referencias as string[] | undefined) ?? []).length) > 0).length,
    [catalogo],
  );
  const workspaceModeLabel = editingId ? `A editar ${editingId}` : "Novo item";
  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="workspace-page catalogo-page">
      <section className="panel workspace-hero">
        <div className="detail-hero-head">
          <div>
            <div className="mono muted">Catalogo</div>
            <h3>Lista Principal + Editor</h3>
            <div className="muted">O catalogo passa a guardar apenas o item canonico. As descricoes originais passam a viver como referencias associadas a cada `ID_Item`.</div>
          </div>
          <div className="inline-actions">
            <span className="tag">{workspaceModeLabel}</span>
            <span className="tag tag-success">{filteredCatalogo.length} visivel(is)</span>
            <button className="btn secondary" type="button" onClick={startNew}>
              Novo item
            </button>
          </div>
        </div>
        <div className="detail-header-grid workspace-overview-grid">
          <div className="summary-card accent">
            <div className="summary-title">Itens totais</div>
            <div className="summary-main">{catalogo.length}</div>
            <div className="muted">Base atual do catalogo oficial.</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Ativos</div>
            <div className="summary-main">{activeCount}</div>
            <div className="muted">Itens prontos para utilizacao operacional.</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Com referencias</div>
            <div className="summary-main">{withReferencesCount}</div>
            <div className="muted">Itens ja ligados a descricoes originais conhecidas.</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Filtro atual</div>
            <div className="summary-main">{filteredCatalogo.length}</div>
            <div className="muted">{searchTerm ? "Com pesquisa aplicada." : "Sem pesquisa ativa."}</div>
          </div>
        </div>
      </section>

      <div className="workspace-shell catalogo-workspace-shell">
        <section className="panel queue-panel catalogo-queue-panel">
          <div className="row-head">
            <div>
              <div className="section-kicker">Lista principal</div>
              <h3>Catalogo</h3>
              <div className="muted">Usa a lista para validar rapidamente `ID_Item`, `Item_Oficial`, estado e numero de referencias conhecidas.</div>
            </div>
          </div>

          <div className="queue-toolbar">
            <label className="queue-search">
              Pesquisar itens
              <input
                name="search_catalogo"
                placeholder="ID, item oficial ou referencia conhecida"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
          </div>

          <div className="queue-list">
            {filteredCatalogo.map((item) => {
              const id = String(item.id_item ?? "");
              const estado = String(item.estado_cadastro ?? "ATIVO");
              const referencias = ((item.referencias as string[] | undefined) ?? []).slice(0, 3);
              const referenceCount = Number(item.reference_count ?? ((item.referencias as string[] | undefined) ?? []).length);
              return (
                <div className={`list-row queue-card ${editingId === id ? "list-row-active" : ""}`} key={id}>
                  <div className="queue-card-head">
                    <div className="queue-card-main">
                      <div className="mono">{id}</div>
                      <strong>{String(item.item_oficial ?? "-")}</strong>
                      <div className="muted">
                        {referenceCount ? `${referenceCount} referencia(s): ${referencias.join(" | ")}` : "Sem referencias registadas ainda."}
                      </div>
                    </div>
                    <div className="queue-card-metrics">
                      <span className="tag">{String(item.natureza ?? "-")}</span>
                      <span className="tag">{String(item.unidade ?? "-")}</span>
                      <span className={`tag ${estado === "ATIVO" ? "tag-success" : "tag-danger"}`}>{estado}</span>
                      {editingId === id ? <span className="tag tag-success">Em edicao</span> : null}
                    </div>
                  </div>
                  <div className="inline-actions">
                    <button className="btn secondary" type="button" onClick={() => startEdit(item)}>
                      Editar
                    </button>
                    <button
                      className="btn danger"
                      type="button"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (!window.confirm(`Apagar ${id}? Isto so e seguro quando o item ainda nao foi usado.`)) {
                          return;
                        }
                        setFormMessage("");
                        deleteMutation.mutate(id);
                      }}
                    >
                      Apagar
                    </button>
                  </div>
                </div>
              );
            })}
            {!filteredCatalogo.length ? (
              <div className="empty-note">
                {searchTerm ? "Nenhum item corresponde ao filtro atual." : "Ainda nao existem itens oficiais carregados."}
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel editor-panel catalogo-editor-panel">
          <div className="row-head">
            <div>
              <div className="section-kicker">Editor de detalhe</div>
              <h3>{editingId ? `Editar ${editingId}` : "Novo Item Oficial"}</h3>
              <div className="muted">Aqui editas apenas a ficha canonica do item. A primeira descricao original e opcional e so serve para criar a referencia inicial.</div>
            </div>
            {editingId ? (
              <button className="btn secondary" type="button" onClick={cancelEdit}>
                Cancelar edicao
              </button>
            ) : null}
          </div>

          {formMessage ? <div className="status-note">{formMessage}</div> : null}

          <div className="form-summary-grid">
            <div className="summary-card accent">
              <div className="summary-title">Item canonico</div>
              <div className="summary-main">{form.item_oficial || "-"}</div>
              <div className="muted">{editingId ? "Ficha principal do item selecionado." : "Define o nome canonico usado em stock, consumo e movimentos."}</div>
            </div>
            <div className="summary-card">
              <div className="summary-title">Classificacao</div>
              <div className="summary-main">{form.natureza || "-"}</div>
              <div className="muted">Unidade: {form.unidade || "-"}</div>
            </div>
            <div className="summary-card">
              <div className="summary-title">Validacao</div>
              <div className="summary-main">{duplicateMatch ? "Duplicado detetado" : "Pronto para guardar"}</div>
              <div className="muted">{duplicateMatch ? `Conflito com ${String(duplicateMatch.id_item ?? "-")}` : editingId ? "A edicao atualiza o item canonico e propaga nome/unidade." : "A criacao pode incluir a primeira referencia de descricao original."}</div>
            </div>
          </div>

          <form
            className="form detail-form"
            onSubmit={(event) => {
              event.preventDefault();
              setFormMessage("");
              const payload = {
                item_oficial: form.item_oficial,
                natureza: form.natureza,
                unidade: form.unidade,
                observacoes: form.observacoes || null,
                ...(editingId ? {} : { descricao_original: form.descricao_original || null }),
              };
              if (editingId) {
                updateMutation.mutate({ id: editingId, payload });
                return;
              }
              createMutation.mutate(payload);
            }}
          >
            <div className="form-section">
              <div className="section-kicker">Identidade do item</div>
              <div className="section-copy">Define apenas o item canonico. As descricoes originais vivem em referencias separadas e sao usadas para reconhecimento futuro nas faturas.</div>
              <div className="form-grid">
                <label>Item Oficial<input name="item_oficial" required value={form.item_oficial} onChange={(event) => updateField("item_oficial", event.target.value)} /></label>
                <label>Natureza
                  <select name="natureza" value={form.natureza} onChange={(event) => updateField("natureza", event.target.value)}>
                    <option value="MATERIAL">MATERIAL</option>
                    <option value="GASOLEO">GASOLEO</option>
                    <option value="GASOLINA">GASOLINA</option>
                    <option value="SERVICO">SERVICO</option>
                    <option value="ALUGUER">ALUGUER</option>
                    <option value="TRANSPORTE">TRANSPORTE</option>
                  </select>
                </label>
                <label>Unidade<input name="unidade" required value={form.unidade} onChange={(event) => updateField("unidade", event.target.value)} /></label>
              </div>
            </div>

            {!editingId ? (
              <div className="form-section">
                <div className="section-kicker">Primeira referencia</div>
                <div className="section-copy">Opcional. Se preencheres este campo, a descricao original fica logo registada em `MATERIAIS_REFERENCIAS` para futuras sugestoes de match.</div>
                <label>
                  Descricao Original Inicial
                  <input name="descricao_original" value={form.descricao_original} onChange={(event) => updateField("descricao_original", event.target.value)} />
                </label>
              </div>
            ) : null}

            <label>
              Observacoes
              <textarea name="observacoes" rows={3} value={form.observacoes} onChange={(event) => updateField("observacoes", event.target.value)} />
            </label>

            {duplicateMatch ? (
              <div className="status-note warning">
                Ja existe um item oficial com este nome: {String(duplicateMatch.id_item)} | {String(duplicateMatch.item_oficial ?? "-")}
              </div>
            ) : null}
            <div className="field-hint">O backend valida `Item_Oficial` duplicado e tambem impede que a mesma `Descricao_Original` fique ligada a dois itens diferentes.</div>

            <div className="form-actions detail-form-actions">
              <button className="btn primary" type="submit" disabled={!canSubmit || busy}>
                {busy ? "A guardar..." : editingId ? "Guardar alteracoes" : "Guardar"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
