import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { api } from "../lib/api";
import type { WorkOption } from "../lib/workOptions";

type ItemFormState = {
  descricao_original: string;
  id_item: string;
  item_oficial: string;
  natureza: string;
  unidade: string;
  quantidade: string;
  custo_unit: string;
  iva: string;
  destino: string;
  obra: string;
  fase: string;
};

type CatalogItem = Record<string, unknown> & {
  id_item?: string;
  fornecedor?: string;
  descricao_original?: string;
  item_oficial?: string;
  natureza?: string;
  unidade?: string;
};

type ImpactItem = {
  entity?: string;
  summary?: string;
  source?: string;
  type?: string;
};

const INITIAL_FORM: ItemFormState = {
  descricao_original: "",
  id_item: "",
  item_oficial: "",
  natureza: "",
  unidade: "",
  quantidade: "",
  custo_unit: "",
  iva: "23",
  destino: "STOCK",
  obra: "",
  fase: "",
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

function buildItemPayload(form: ItemFormState, resolvedItemId: string | null) {
  return {
    descricao_original: form.descricao_original,
    quantidade: toNumber(form.quantidade),
    custo_unit: toNumber(form.custo_unit),
    iva: toNumber(form.iva),
    destino: form.destino,
    obra: form.obra || null,
    fase: form.fase || null,
    id_item: resolvedItemId,
    item_oficial: form.item_oficial || null,
    natureza: form.natureza || null,
    unidade: form.unidade || null,
  };
}

function resetFormForNextLine(previous: ItemFormState): ItemFormState {
  return {
    ...INITIAL_FORM,
    destino: previous.destino,
    iva: previous.iva,
    obra: previous.destino === "CONSUMO" ? previous.obra : "",
    fase: previous.destino === "CONSUMO" ? previous.fase : "",
  };
}

function scoreCatalogItem(item: CatalogItem, search: string, fornecedor: string, descricaoOriginal: string) {
  const normalizedSearch = normalize(search);
  const normalizedFornecedor = normalize(fornecedor);
  const normalizedDescricao = normalize(descricaoOriginal);
  const itemId = normalize(item.id_item);
  const itemFornecedor = normalize(item.fornecedor);
  const itemDescricao = normalize(item.descricao_original);
  const itemOficial = normalize(item.item_oficial);

  let score = 0;

  if (normalizedFornecedor && itemFornecedor === normalizedFornecedor) score += 30;
  if (normalizedDescricao && itemDescricao === normalizedDescricao) score += 45;
  if (normalizedFornecedor && normalizedDescricao && itemFornecedor === normalizedFornecedor && itemDescricao === normalizedDescricao) score += 80;

  if (normalizedSearch) {
    if (itemId === normalizedSearch) score += 140;
    if (itemOficial === normalizedSearch) score += 90;
    if (itemDescricao === normalizedSearch) score += 75;
    if (itemId.includes(normalizedSearch)) score += 50;
    if (itemOficial.includes(normalizedSearch)) score += 40;
    if (itemDescricao.includes(normalizedSearch)) score += 35;
    if (itemFornecedor.includes(normalizedSearch)) score += 15;
  }

  return score;
}

export function FaturaDetailPage() {
  const { idFatura = "" } = useParams();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ItemFormState>(INITIAL_FORM);
  const [formMessage, setFormMessage] = useState<string>("");
  const [catalogMessage, setCatalogMessage] = useState<string>("");
  const detail = useQuery({
    queryKey: ["fatura", idFatura],
    queryFn: () => api.getFatura(idFatura),
    enabled: !!idFatura,
  });
  const catalogQuery = useQuery({ queryKey: ["catalogo"], queryFn: api.listCatalog });
  const workOptionsQuery = useQuery({ queryKey: ["work-options"], queryFn: api.getWorkOptions });
  const preview = useMutation({ mutationFn: (payload: Record<string, unknown>) => api.previewItems(idFatura, payload) });
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
    mutationFn: (payload: Record<string, unknown>) => api.createItems(idFatura, payload),
    onSuccess: () => {
      setFormMessage("Item da fatura guardado com sucesso.");
      setCatalogMessage("");
      setForm((current) => resetFormForNextLine(current));
      preview.reset();
      queryClient.invalidateQueries({ queryKey: ["fatura", idFatura] });
      queryClient.invalidateQueries({ queryKey: ["catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao guardar item da fatura.");
    },
  });

  const fornecedorAtual = String((detail.data?.fatura as Record<string, unknown> | undefined)?.fornecedor ?? "");
  const workOptions = ((workOptionsQuery.data?.obras as WorkOption[] | undefined) ?? []);
  const searchTerm = useDeferredValue(form.id_item || form.item_oficial || form.descricao_original);
  const selectedCatalog = (catalogQuery.data ?? []).find((item) => String(item.id_item ?? "") === form.id_item);
  const availableFases = useMemo(
    () =>
      Array.from(
        new Set(
          workOptions.flatMap((item) => item.fases ?? []),
        ),
      ).sort((left, right) => left.localeCompare(right, "pt-PT")),
    [workOptions],
  );
  const suggestions = ((catalogQuery.data as CatalogItem[] | undefined) ?? [])
    .map((item) => ({
      item,
      score: scoreCatalogItem(item, searchTerm, fornecedorAtual, form.descricao_original),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const quantidade = toNumber(form.quantidade);
  const custoUnit = toNumber(form.custo_unit);
  const iva = toNumber(form.iva);
  const totalSemIva = quantidade * custoUnit;
  const totalComIva = totalSemIva * (1 + iva / 100);
  const localImpacts: ImpactItem[] =
    form.destino === "STOCK"
      ? [{ entity: "MATERIAIS_MOV", source: "FATURAS_ITENS", type: "generated", summary: "Vai gerar entrada de stock." }]
      : [
          { entity: "AFETACOES_OBRA", source: "FATURAS_ITENS", type: "generated", summary: "Vai gerar afetacao direta para a obra." },
          { entity: "MATERIAIS_MOV", source: "AFETACOES_OBRA", type: "generated", summary: "Vai gerar movimento tecnico de consumo." },
        ];
  const previewImpacts = ((preview.data?.impacts as ImpactItem[] | undefined) ?? localImpacts);
  const canQuickCreate = Boolean(fornecedorAtual && form.descricao_original && form.item_oficial && form.natureza && form.unidade);
  const needsCatalogCreation = !form.id_item && Boolean(form.item_oficial && form.natureza && form.unidade);
  useEffect(() => {
    if (!selectedCatalog || !form.id_item) return;
    if (
      form.item_oficial === String(selectedCatalog.item_oficial ?? "") &&
      form.natureza === String(selectedCatalog.natureza ?? "") &&
      form.unidade === String(selectedCatalog.unidade ?? "")
    ) {
      return;
    }
    setForm((current) => ({
      ...current,
      item_oficial: String(selectedCatalog.item_oficial ?? ""),
      natureza: String(selectedCatalog.natureza ?? ""),
      unidade: String(selectedCatalog.unidade ?? ""),
    }));
  }, [form.id_item, form.item_oficial, form.natureza, form.unidade, selectedCatalog]);

  function updateField(field: keyof ItemFormState, value: string) {
    setFormMessage("");
    setCatalogMessage("");
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "id_item" && value !== current.id_item && !value) {
        next.item_oficial = "";
        next.natureza = "";
        next.unidade = "";
      }
      if ((field === "descricao_original" || field === "item_oficial") && current.id_item) {
        next.id_item = "";
      }
      if (field === "destino" && value === "STOCK") {
        next.obra = "";
        next.fase = "";
      }
      return next;
    });
  }

  function applyCatalogItem(item: CatalogItem) {
    setCatalogMessage(`Item ${String(item.id_item)} selecionado a partir do catalogo.`);
    setForm((current) => ({
      ...current,
      id_item: String(item.id_item ?? ""),
      item_oficial: String(item.item_oficial ?? ""),
      natureza: String(item.natureza ?? ""),
      unidade: String(item.unidade ?? ""),
    }));
  }

  function handleObraChange(value: string) {
    setFormMessage("");
    setCatalogMessage("");
    setForm((current) => {
      return {
        ...current,
        obra: value,
        fase: current.fase,
      };
    });
  }

  function runPreview() {
    setFormMessage("");
    preview.mutate({ items: [buildItemPayload(form, selectedCatalog ? form.id_item : null)] });
  }

  function handleQuickCreate() {
    setCatalogMessage("");
    createCatalog.mutate({
      fornecedor: fornecedorAtual,
      descricao_original: form.descricao_original,
      item_oficial: form.item_oficial,
      natureza: form.natureza,
      unidade: form.unidade,
    });
  }

  return (
    <div className="grid two">
      <section className="panel">
        <h3>Detalhe da Fatura</h3>
        <div className="detail-stack">
          <div className="detail-card">
            <div className="detail-label">Fornecedor</div>
            <div>{fornecedorAtual || "-"}</div>
          </div>
          <div className="detail-card">
            <div className="detail-label">Documento</div>
            <div>{String((detail.data?.fatura as Record<string, unknown> | undefined)?.nr_documento ?? "-")}</div>
          </div>
          <div className="detail-card">
            <div className="detail-label">Data</div>
            <div>{String((detail.data?.fatura as Record<string, unknown> | undefined)?.data_fatura ?? "-")}</div>
          </div>
        </div>
        <h4>Itens ja lancados</h4>
        <div className="list">
          {((detail.data?.items as Record<string, unknown>[] | undefined) ?? []).map((item) => (
            <div className="list-row" key={String(item.id_item_fatura)}>
              <div className="row-head">
                <strong>{String(item.descricao_original)}</strong>
                <span className="tag">{String(item.destino)}</span>
              </div>
              <div className="muted">
                {String(item.id_item ?? "-")} | {String(item.item_oficial ?? "-")} | {String(item.quantidade ?? 0)} {String(item.unidade ?? "")}
              </div>
              <div className="muted">
                {String(item.natureza ?? "-")} | {String(item.custo_unit ?? 0)} un | {String(item.custo_total_sem_iva ?? 0)} sem IVA | {String(item.custo_total_com_iva ?? 0)} com IVA
              </div>
              <div className="muted">
                {String(item.obra ?? "-")} | {String(item.fase ?? "-")} | {String(item.estado_mapeamento ?? "-")}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Adicionar Linha</h3>
        <div className="form-summary-grid">
          <div className="summary-card accent">
            <div className="summary-title">Mapeamento</div>
            {selectedCatalog ? (
              <>
                <div className="summary-main">{String(selectedCatalog.id_item)} | {String(selectedCatalog.item_oficial ?? "-")}</div>
                <div className="muted">{String(selectedCatalog.natureza ?? "-")} | {String(selectedCatalog.unidade ?? "-")}</div>
              </>
            ) : needsCatalogCreation ? (
              <>
                <div className="summary-main">Item novo pronto para catalogo</div>
                <div className="muted">Podes criar agora ou deixar o backend cria-lo ao guardar.</div>
              </>
            ) : (
              <>
                <div className="summary-main">Sem item associado</div>
                <div className="muted">Escolhe um item existente ou preenche os dados para criar um novo.</div>
              </>
            )}
          </div>
          <div className="summary-card">
            <div className="summary-title">Totais da linha</div>
            <div className="summary-main">{formatAmount(totalSemIva)} sem IVA</div>
            <div className="muted">{formatAmount(totalComIva)} com IVA | {formatAmount(quantidade, 2)} unidades</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Impacto previsto</div>
            <div className="summary-main">{form.destino === "STOCK" ? "Entrada em stock" : "Consumo direto"}</div>
            <div className="muted">{previewImpacts.length} efeitos operacionais previstos</div>
          </div>
        </div>

        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            setFormMessage("");
            createItems.mutate({ items: [buildItemPayload(form, selectedCatalog ? form.id_item : null)] });
          }}
        >
          <div className="form-grid">
            <label>
              Descricao Original
              <input name="descricao_original" required value={form.descricao_original} onChange={(event) => updateField("descricao_original", event.target.value)} />
            </label>
            <label>
              Fornecedor da fatura
              <input value={fornecedorAtual} disabled readOnly />
            </label>
            <label>
              ID_Item existente
              <input
                name="id_item"
                placeholder="Pesquisa por ID, descricao ou item oficial"
                value={form.id_item}
                onChange={(event) => updateField("id_item", event.target.value)}
              />
            </label>
            <label>
              Item Oficial
              <input
                name="item_oficial"
                placeholder="Preenche so se for item novo"
                value={form.item_oficial}
                onChange={(event) => updateField("item_oficial", event.target.value)}
              />
            </label>
            <label>
              Natureza
              <select name="natureza" value={form.natureza} onChange={(event) => updateField("natureza", event.target.value)}>
                <option value="">Selecione</option>
                <option value="MATERIAL">MATERIAL</option>
                <option value="SERVICO">SERVICO</option>
                <option value="ALUGUER">ALUGUER</option>
                <option value="TRANSPORTE">TRANSPORTE</option>
              </select>
            </label>
            <label>
              Unidade
              <input name="unidade" placeholder="UN, M2, H..." value={form.unidade} onChange={(event) => updateField("unidade", event.target.value)} />
            </label>
            <label>
              Quantidade
              <input name="quantidade" type="number" step="0.01" required value={form.quantidade} onChange={(event) => updateField("quantidade", event.target.value)} />
            </label>
            <label>
              Custo Unit
              <input name="custo_unit" type="number" step="0.0001" required value={form.custo_unit} onChange={(event) => updateField("custo_unit", event.target.value)} />
            </label>
            <label>
              IVA %
              <input name="iva" type="number" step="0.01" value={form.iva} onChange={(event) => updateField("iva", event.target.value)} />
            </label>
            <label>
              Destino
              <select name="destino" value={form.destino} onChange={(event) => updateField("destino", event.target.value)}>
                <option value="STOCK">STOCK</option>
                <option value="CONSUMO">CONSUMO</option>
              </select>
            </label>
            <label>
              Obra
              {workOptions.length ? (
                <select
                  name="obra"
                  value={form.obra}
                  onChange={(event) => handleObraChange(event.target.value)}
                  disabled={form.destino === "STOCK"}
                >
                  <option value="">Selecione</option>
                  {workOptions.map((item) => (
                    <option key={String(item.obra)} value={String(item.obra)}>
                      {String(item.obra)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name="obra"
                  value={form.obra}
                  onChange={(event) => updateField("obra", event.target.value)}
                  disabled={form.destino === "STOCK"}
                />
              )}
            </label>
            <label>
              Fase
              {availableFases.length ? (
                <select
                  name="fase"
                  value={form.fase}
                  onChange={(event) => updateField("fase", event.target.value)}
                  disabled={form.destino === "STOCK"}
                >
                  <option value="">Selecione</option>
                  {availableFases.map((fase) => (
                    <option key={fase} value={fase}>
                      {fase}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name="fase"
                  value={form.fase}
                  onChange={(event) => updateField("fase", event.target.value)}
                  disabled={form.destino === "STOCK"}
                />
              )}
            </label>
          </div>
          {form.destino === "STOCK" ? <div className="field-hint">Para selecionar `Obra` e `Fase`, muda primeiro o `Destino` para `CONSUMO`.</div> : null}
          {form.destino !== "STOCK" && workOptions.length ? <div className="field-hint">O campo `Obra` mostra todas as obras carregadas da Google Sheet.</div> : null}
          {form.destino !== "STOCK" && availableFases.length ? <div className="field-hint">O campo `Fase` mostra todas as fases carregadas da Google Sheet.</div> : null}

          <div className="assistant-block">
            <div className="assistant-head">
              <strong>Sugestoes do catalogo</strong>
              <span className="muted">Pesquisa assistida com base no fornecedor e na descricao desta linha.</span>
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
              <div className="empty-note">Ainda nao apareceu nenhuma sugestao relevante. Continua a escrever ou cria um item novo abaixo.</div>
            )}
          </div>

          <div className="assistant-block">
            <div className="assistant-head">
              <strong>Criacao rapida de item oficial</strong>
              <span className="muted">Se esta linha ainda nao existir no catalogo, podes cria-la sem sair da fatura.</span>
            </div>
            <div className="quick-create-row">
              <div className="quick-create-copy">
                <div><strong>Fornecedor:</strong> {fornecedorAtual || "-"}</div>
                <div><strong>Descricao:</strong> {form.descricao_original || "-"}</div>
                <div><strong>Item Oficial:</strong> {form.item_oficial || "-"}</div>
              </div>
              <button className="btn secondary" disabled={!canQuickCreate || createCatalog.isPending} onClick={handleQuickCreate} type="button">
                {createCatalog.isPending ? "A criar..." : "Criar item no catalogo"}
              </button>
            </div>
            <div className="field-hint">
              Para criar ja o item, preenche `Descricao Original`, `Item Oficial`, `Natureza` e `Unidade`. Se preferires, tambem podes guardar a linha diretamente e deixar o backend criar o catalogo automaticamente.
            </div>
            {catalogMessage ? <div className="status-note">{catalogMessage}</div> : null}
          </div>

          <div className="assistant-block">
            <div className="assistant-head">
              <strong>Preview do impacto</strong>
              <span className="muted">Resumo operacional antes de gravar a linha.</span>
            </div>
            <div className="impact-list">
              {previewImpacts.map((impact, index) => (
                <div className="impact-row" key={`${impact.entity}-${impact.summary}-${index}`}>
                  <div className="impact-entity">{impact.entity ?? impact.type ?? "IMPACTO"}</div>
                  <div>
                    <div>{impact.summary ?? "Sem resumo"}</div>
                    <div className="muted">{impact.source ?? "-"}</div>
                  </div>
                </div>
              ))}
            </div>
            {preview.isError ? <div className="status-note">{preview.error instanceof Error ? preview.error.message : "Falha ao gerar preview."}</div> : null}
          </div>

          <div className="form-actions">
            <button className="btn secondary" disabled={preview.isPending} onClick={runPreview} type="button">
              {preview.isPending ? "A analisar..." : "Preview impacto"}
            </button>
            <button className="btn primary" disabled={createItems.isPending} type="submit">
              {createItems.isPending ? "A guardar..." : "Adicionar linha"}
            </button>
          </div>
          {formMessage ? <div className="status-note">{formMessage}</div> : null}
        </form>
      </section>
    </div>
  );
}
