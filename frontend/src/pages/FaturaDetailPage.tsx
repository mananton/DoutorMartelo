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
  uso_combustivel: string;
  matricula: string;
  unidade: string;
  quantidade: string;
  custo_unit: string;
  iva: string;
  destino: string;
  obra: string;
  fase: string;
  desconto_1: string;
  desconto_2: string;
  observacoes: string;
};

type CatalogItem = Record<string, unknown> & {
  id_item?: string;
  item_oficial?: string;
  natureza?: string;
  unidade?: string;
  referencias?: string[];
  reference_count?: number;
};

type ImpactItem = {
  entity?: string;
  summary?: string;
  source?: string;
  type?: string;
};

type FaturaItemRow = Record<string, unknown> & {
  id_item_fatura?: string;
  descricao_original?: string;
  id_item?: string;
  item_oficial?: string;
  natureza?: string;
  uso_combustivel?: string;
  matricula?: string;
  unidade?: string;
  quantidade?: number;
  custo_unit?: number;
  desconto_1?: number;
  desconto_2?: number;
  iva?: number;
  destino?: string;
  obra?: string;
  fase?: string;
  observacoes?: string;
  custo_total_sem_iva?: number;
  custo_total_com_iva?: number;
  estado_mapeamento?: string;
};

type AssistantTab = "catalogo" | "impacto";

type VehicleOption = Record<string, unknown> & {
  veiculo?: string;
  matricula?: string;
};

const NATUREZA_OPTIONS = ["MATERIAL", "GASOLEO", "GASOLINA", "SERVICO", "ALUGUER", "TRANSPORTE"] as const;
const COMBUSTIVEL_USE_OPTIONS = ["N/A", "VIATURA", "MAQUINA", "GERADOR"] as const;
const UNIT_OPTIONS = ["un", "Kg", "Lt", "Ton", "m", "m2", "m3"] as const;

const INITIAL_FORM: ItemFormState = {
  descricao_original: "",
  id_item: "",
  item_oficial: "",
  natureza: "",
  uso_combustivel: "N/A",
  matricula: "",
  unidade: "",
  quantidade: "",
  custo_unit: "",
  iva: "23",
  destino: "STOCK",
  obra: "",
  fase: "",
  desconto_1: "0",
  desconto_2: "0",
  observacoes: "",
};

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function toNumber(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInputNumber(value: number, digits = 4) {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toFixed(digits)));
}

function toFixedInputNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(digits);
}

function parseDecimalInput(value: string) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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

function isFuelNature(value: string | undefined) {
  return ["GASOLEO", "GASOLINA"].includes(String(value ?? "").trim().toUpperCase());
}

function buildItemPayload(form: ItemFormState, resolvedItemId: string | null) {
  const fuelNature = isFuelNature(form.natureza);
  return {
    descricao_original: form.descricao_original,
    quantidade: toNumber(form.quantidade),
    custo_unit: toNumber(form.custo_unit),
    iva: toNumber(form.iva),
    destino: form.destino,
    obra: form.destino === "CONSUMO" ? form.obra || null : null,
    fase: form.destino === "CONSUMO" ? form.fase || null : null,
    uso_combustivel: fuelNature ? form.uso_combustivel || "N/A" : "N/A",
    matricula: form.destino === "VIATURA" ? form.matricula || null : null,
    desconto_1: toNumber(form.desconto_1),
    desconto_2: toNumber(form.desconto_2),
    observacoes: form.observacoes || null,
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

function catalogReferences(item: CatalogItem) {
  return ((item.referencias as string[] | undefined) ?? []).map((value) => String(value));
}

function scoreCatalogItem(item: CatalogItem, search: string, descricaoOriginal: string) {
  const normalizedSearch = normalize(search);
  const normalizedDescricao = normalize(descricaoOriginal);
  const itemId = normalize(item.id_item);
  const itemOficial = normalize(item.item_oficial);
  const itemReferencias = catalogReferences(item).map(normalize);

  let score = 0;

  if (normalizedDescricao && itemReferencias.includes(normalizedDescricao)) score += 95;

  if (normalizedSearch) {
    if (itemId === normalizedSearch) score += 140;
    if (itemOficial === normalizedSearch) score += 90;
    if (itemReferencias.includes(normalizedSearch)) score += 75;
    if (itemId.includes(normalizedSearch)) score += 50;
    if (itemOficial.includes(normalizedSearch)) score += 40;
    if (itemReferencias.some((value) => value.includes(normalizedSearch))) score += 35;
  }

  return score;
}

function toFormState(item: FaturaItemRow): ItemFormState {
  return {
    descricao_original: String(item.descricao_original ?? ""),
    id_item: String(item.id_item ?? ""),
    item_oficial: String(item.item_oficial ?? ""),
    natureza: String(item.natureza ?? ""),
    uso_combustivel: String(item.uso_combustivel ?? "N/A"),
    matricula: String(item.matricula ?? ""),
    unidade: String(item.unidade ?? ""),
    quantidade: String(item.quantidade ?? ""),
    custo_unit: String(item.custo_unit ?? ""),
    iva: String(item.iva ?? 23),
    destino: String(item.destino ?? "STOCK"),
    obra: String(item.obra ?? ""),
    fase: String(item.fase ?? ""),
    desconto_1: String(item.desconto_1 ?? 0),
    desconto_2: String(item.desconto_2 ?? 0),
    observacoes: String(item.observacoes ?? ""),
  };
}

export function FaturaDetailPage() {
  const { idFatura = "" } = useParams();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ItemFormState>(INITIAL_FORM);
  const [grossTotalDraft, setGrossTotalDraft] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string>("");
  const [catalogMessage, setCatalogMessage] = useState<string>("");
  const [assistantTab, setAssistantTab] = useState<AssistantTab>("catalogo");

  const detail = useQuery({
    queryKey: ["fatura", idFatura],
    queryFn: () => api.getFatura(idFatura),
    enabled: !!idFatura,
  });
  const catalogQuery = useQuery({ queryKey: ["catalogo"], queryFn: api.listCatalog });
  const workOptionsQuery = useQuery({ queryKey: ["work-options"], queryFn: api.getWorkOptions });
  const vehicleOptionsQuery = useQuery({
    queryKey: ["vehicle-options"],
    queryFn: api.getVehicleOptions,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const preview = useMutation({ mutationFn: (payload: Record<string, unknown>) => api.previewItems(idFatura, payload) });
  const createCatalog = useMutation({
    mutationFn: api.createCatalog,
    onSuccess: (created) => {
      const itemId = String(created.id_item ?? "");
      setAssistantTab("catalogo");
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
      setAssistantTab("catalogo");
      setFormMessage("Item da fatura guardado com sucesso.");
      setCatalogMessage("");
      setGrossTotalDraft(null);
      setForm((current) => resetFormForNextLine(current));
      preview.reset();
      queryClient.invalidateQueries({ queryKey: ["fatura", idFatura] });
      queryClient.invalidateQueries({ queryKey: ["catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      queryClient.invalidateQueries({ queryKey: ["movimentos"] });
      queryClient.invalidateQueries({ queryKey: ["stock-list"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao guardar item da fatura.");
    },
  });
  const updateItem = useMutation({
    mutationFn: ({ itemId, payload }: { itemId: string; payload: Record<string, unknown> }) => api.updateFaturaItem(idFatura, itemId, payload),
    onSuccess: (_, variables) => {
      setAssistantTab("catalogo");
      setFormMessage(`Linha ${variables.itemId} atualizada com sucesso.`);
      setCatalogMessage("");
      setGrossTotalDraft(null);
      setEditingItemId(null);
      setForm(INITIAL_FORM);
      preview.reset();
      queryClient.invalidateQueries({ queryKey: ["fatura", idFatura] });
      queryClient.invalidateQueries({ queryKey: ["catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      queryClient.invalidateQueries({ queryKey: ["movimentos"] });
      queryClient.invalidateQueries({ queryKey: ["stock-list"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao atualizar linha da fatura.");
    },
  });
  const deleteItem = useMutation({
    mutationFn: (itemId: string) => api.deleteFaturaItem(idFatura, itemId),
    onSuccess: (_, itemId) => {
      setAssistantTab("catalogo");
      setFormMessage(`Linha ${itemId} apagada com sucesso.`);
      if (editingItemId === itemId) {
        setEditingItemId(null);
        setGrossTotalDraft(null);
        setForm(INITIAL_FORM);
        setCatalogMessage("");
      }
      preview.reset();
      queryClient.invalidateQueries({ queryKey: ["fatura", idFatura] });
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      queryClient.invalidateQueries({ queryKey: ["movimentos"] });
      queryClient.invalidateQueries({ queryKey: ["stock-list"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao apagar linha da fatura.");
    },
  });

  const fornecedorAtual = String((detail.data?.fatura as Record<string, unknown> | undefined)?.fornecedor ?? "");
  const workOptions = ((workOptionsQuery.data?.obras as WorkOption[] | undefined) ?? []);
  const vehicleOptions = ((vehicleOptionsQuery.data?.veiculos as VehicleOption[] | undefined) ?? []);
  const searchTerm = useDeferredValue(form.id_item || form.item_oficial || form.descricao_original);
  const selectedCatalog = ((catalogQuery.data as CatalogItem[] | undefined) ?? []).find((item) => String(item.id_item ?? "") === form.id_item);
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
      score: scoreCatalogItem(item, searchTerm, form.descricao_original),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
  const suggestedItemOficial = useMemo(
    () => suggestItemOficialFromDescription(form.descricao_original),
    [form.descricao_original],
  );
  const fuelNature = isFuelNature(form.natureza);
  const requiresVehicleDestination = fuelNature && form.uso_combustivel === "VIATURA";
  const strongestSuggestionScore = suggestions[0]?.score ?? 0;
  const hasRelevantCatalogSuggestions = strongestSuggestionScore >= 60;
  const shouldSuggestNewItemOficial = !form.id_item && Boolean(form.descricao_original.trim()) && Boolean(suggestedItemOficial) && !hasRelevantCatalogSuggestions;
  const isSuggestedItemOficial =
    Boolean(form.item_oficial.trim()) &&
    normalize(form.item_oficial) === normalize(suggestedItemOficial);

  const quantidade = toNumber(form.quantidade);
  const custoUnit = toNumber(form.custo_unit);
  const iva = toNumber(form.iva);
  const desconto1 = toNumber(form.desconto_1);
  const desconto2 = toNumber(form.desconto_2);
  const localTotalSemIva = quantidade * custoUnit * (1 - desconto1 / 100) * (1 - desconto2 / 100);
  const localTotalComIva = localTotalSemIva * (1 + iva / 100);
  const localImpacts: ImpactItem[] =
    form.destino === "STOCK"
      ? [{ entity: "MATERIAIS_MOV", source: "FATURAS_ITENS", type: "generated", summary: "Vai gerar entrada de stock." }]
      : form.destino === "VIATURA"
        ? [{ entity: "MATERIAIS_MOV", source: "FATURAS_ITENS", type: "generated", summary: "Vai gerar movimento tecnico associado a viatura." }]
        : form.destino === "ESCRITORIO"
          ? [{ entity: "MATERIAIS_MOV", source: "FATURAS_ITENS", type: "generated", summary: "Vai gerar movimento tecnico de consumo para ESCRITORIO." }]
          : form.destino === "EMPRESA"
            ? [{ entity: "MATERIAIS_MOV", source: "FATURAS_ITENS", type: "generated", summary: "Vai gerar movimento tecnico de consumo para EMPRESA." }]
      : [
          { entity: "AFETACOES_OBRA", source: "FATURAS_ITENS", type: "generated", summary: "Vai gerar afetacao direta para a obra." },
          { entity: "MATERIAIS_MOV", source: "AFETACOES_OBRA", type: "generated", summary: "Vai gerar movimento tecnico de consumo." },
        ];
  const previewImpacts = ((preview.data?.impacts as ImpactItem[] | undefined) ?? localImpacts);
  const canQuickCreate = Boolean(form.descricao_original && form.item_oficial && form.natureza && form.unidade);
  const unitOptions = useMemo(() => {
    const currentUnit = String(form.unidade ?? "").trim();
    const hasCurrentUnit = currentUnit && !UNIT_OPTIONS.some((option) => normalize(option) === normalize(currentUnit));
    return hasCurrentUnit ? [currentUnit, ...UNIT_OPTIONS] : [...UNIT_OPTIONS];
  }, [form.unidade]);
  const vehicleSelectOptions = useMemo(() => {
    const currentMatricula = String(form.matricula ?? "").trim();
    const baseOptions = vehicleOptions
      .map((item) => ({
        matricula: String(item.matricula ?? "").trim(),
        veiculo: String(item.veiculo ?? "").trim(),
      }))
      .filter((item) => item.matricula);
    const hasCurrentMatricula =
      currentMatricula &&
      !baseOptions.some((item) => normalize(item.matricula) === normalize(currentMatricula));

    return hasCurrentMatricula
      ? [{ matricula: currentMatricula, veiculo: "Matricula atual" }, ...baseOptions]
      : baseOptions;
  }, [form.matricula, vehicleOptions]);

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
        uso_combustivel: isFuelNature(String(selectedCatalog.natureza ?? "")) ? current.uso_combustivel || "N/A" : "N/A",
        matricula: isFuelNature(String(selectedCatalog.natureza ?? "")) ? current.matricula : "",
        destino:
          !isFuelNature(String(selectedCatalog.natureza ?? ""))
            ? current.destino === "VIATURA"
              ? "CONSUMO"
              : current.destino
          : current.destino === "ESCRITORIO" || current.destino === "EMPRESA"
            ? "CONSUMO"
            : current.destino,
        unidade: String(selectedCatalog.unidade ?? ""),
      }));
  }, [form.id_item, form.item_oficial, form.natureza, form.unidade, selectedCatalog]);

  function updateField(field: keyof ItemFormState, value: string) {
    setFormMessage("");
    setCatalogMessage("");
    setGrossTotalDraft(null);
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "descricao_original") {
        const previousSuggestedItemOficial = suggestItemOficialFromDescription(current.descricao_original);
        const nextSuggestedItemOficial = suggestItemOficialFromDescription(value);
        const itemWasAutoSuggested = normalize(current.item_oficial) === normalize(previousSuggestedItemOficial);
        if (nextSuggestedItemOficial && (!current.item_oficial.trim() || itemWasAutoSuggested || Boolean(current.id_item))) {
          next.item_oficial = nextSuggestedItemOficial;
        }
        if (!value.trim() && itemWasAutoSuggested) {
          next.item_oficial = "";
        }
      }
      if (field === "id_item" && value !== current.id_item && !value) {
        next.item_oficial = "";
        next.natureza = "";
        next.unidade = "";
      }
      if ((field === "descricao_original" || field === "item_oficial") && current.id_item) {
        next.id_item = "";
      }
      if (field === "natureza") {
        if (!isFuelNature(value)) {
          next.uso_combustivel = "N/A";
          next.matricula = "";
          if (current.destino === "VIATURA") {
            next.destino = "CONSUMO";
          }
        } else if (!current.uso_combustivel) {
          next.uso_combustivel = "N/A";
          if (current.destino === "ESCRITORIO" || current.destino === "EMPRESA") {
            next.destino = "CONSUMO";
          }
        } else if (current.destino === "ESCRITORIO" || current.destino === "EMPRESA") {
          next.destino = "CONSUMO";
        }
      }
      if (field === "uso_combustivel") {
        if (value === "VIATURA") {
          next.destino = "VIATURA";
          next.obra = "";
          next.fase = "";
        } else {
          next.matricula = "";
          if (current.destino === "VIATURA") {
            next.destino = "CONSUMO";
          }
        }
      }
      if (field === "destino" && (value === "STOCK" || value === "VIATURA" || value === "ESCRITORIO" || value === "EMPRESA")) {
        next.obra = "";
        next.fase = "";
      }
      if (field === "destino" && value !== "VIATURA") {
        next.matricula = "";
      }
      return next;
    });
  }

  function updateGrossTotal(value: string) {
    setFormMessage("");
    setCatalogMessage("");
    setGrossTotalDraft(value);
    setForm((current) => {
      const grossTotal = parseDecimalInput(value);
      const quantity = toNumber(current.quantidade);
      const discount1 = toNumber(current.desconto_1);
      const discount2 = toNumber(current.desconto_2);
      const vat = toNumber(current.iva);
      const factor =
        quantity *
        (1 - discount1 / 100) *
        (1 - discount2 / 100) *
        (1 + vat / 100);

      if (grossTotal === null || !quantity || factor <= 0 || !Number.isFinite(factor)) {
        return current;
      }

      return {
        ...current,
        custo_unit: toInputNumber(grossTotal / factor, 4),
      };
    });
  }

  function applyCatalogItem(item: CatalogItem) {
    setAssistantTab("catalogo");
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
    setGrossTotalDraft(null);
    setForm((current) => ({
      ...current,
      obra: value,
      fase: current.fase,
    }));
  }

  function runPreview() {
    setFormMessage("");
    setAssistantTab("impacto");
    preview.mutate({ items: [buildItemPayload(form, selectedCatalog ? form.id_item : null)] });
  }

  function handleQuickCreate() {
    setAssistantTab("catalogo");
    setCatalogMessage("");
    createCatalog.mutate({
      descricao_original: form.descricao_original,
      item_oficial: form.item_oficial,
      natureza: form.natureza,
      unidade: form.unidade,
      observacoes: form.observacoes || null,
    });
  }

  function applySuggestedItemOficial() {
    if (!suggestedItemOficial) return;
    setAssistantTab("catalogo");
    setCatalogMessage("");
    setForm((current) => ({
      ...current,
      item_oficial: suggestedItemOficial,
    }));
  }

  function startEdit(item: FaturaItemRow) {
    setEditingItemId(String(item.id_item_fatura ?? ""));
    setAssistantTab("catalogo");
    setGrossTotalDraft(null);
    setForm(toFormState(item));
    setFormMessage("");
    setCatalogMessage(`A editar ${String(item.id_item_fatura ?? "")}.`);
    preview.reset();
  }

  function cancelEdit() {
    setEditingItemId(null);
    setAssistantTab("catalogo");
    setGrossTotalDraft(null);
    setForm(INITIAL_FORM);
    setFormMessage("");
    setCatalogMessage("");
    preview.reset();
  }

  function handleGrossTotalBlur() {
    setGrossTotalDraft(null);
  }

  const existingItems = ((detail.data?.items as FaturaItemRow[] | undefined) ?? []);
  const existingItemsTotals = existingItems.reduce<{ semIva: number; comIva: number }>(
    (acc, item) => {
      acc.semIva += Number(item.custo_total_sem_iva ?? 0);
      acc.comIva += Number(item.custo_total_com_iva ?? 0);
      return acc;
    },
    { semIva: 0, comIva: 0 },
  );
  const fatura = (detail.data?.fatura as Record<string, unknown> | undefined) ?? {};
  const documentoAtual = String(fatura.nr_documento ?? "-");
  const dataFaturaAtual = String(fatura.data_fatura ?? "-");
  const valorSemIvaFatura = Number(fatura.valor_sem_iva ?? 0);
  const valorComIvaFatura = Number(fatura.valor_com_iva ?? 0);
  const workspaceModeLabel = editingItemId ? `A editar ${editingItemId}` : "Nova linha";
  const destinoLabel =
    form.destino === "STOCK"
      ? "Entrada em stock"
      : form.destino === "VIATURA"
        ? "Consumo em viatura"
        : form.destino === "ESCRITORIO"
          ? "Consumo em escritorio"
          : form.destino === "EMPRESA"
            ? "Consumo da empresa"
        : "Consumo direto";
  const formBusy = createItems.isPending || updateItem.isPending;
  const helperNotes = [
    fuelNature ? "Combustiveis exigem a classificacao do `Uso_Combustivel` antes de fechares a linha." : null,
    fuelNature ? "No combustivel, o campo `Custo Unit` deve ser sem IVA. Se tiveres o preco da bomba com IVA, divide-o por `1 + IVA/100` antes de guardar." : null,
    form.destino === "STOCK" ? "Para selecionar `Obra` e `Fase`, muda primeiro o `Destino` para `CONSUMO`." : null,
    form.destino === "CONSUMO" && workOptions.length ? "O campo `Obra` mostra as obras carregadas da Google Sheet." : null,
    form.destino === "CONSUMO" && availableFases.length ? "O campo `Fase` mostra a lista global de fases carregada da Google Sheet." : null,
    form.destino === "VIATURA" && vehicleOptions.length ? "O campo `Matricula` usa a lista de viaturas carregada da aba `VEICULOS`." : null,
    form.destino === "ESCRITORIO" ? "O destino `ESCRITORIO` gera consumo direto sem passar por `Obra` e `Fase`." : null,
    form.destino === "EMPRESA" ? "O destino `EMPRESA` gera consumo direto da empresa sem passar por `Stock`, `Obra` e `Fase`." : null,
  ].filter((note): note is string => Boolean(note));

  return (
    <div className="detail-page">
      <section className="panel detail-hero">
        <div className="detail-hero-head">
          <div>
            <div className="mono muted">Fatura {idFatura}</div>
            <h3>Workspace de Itens</h3>
            <div className="muted">Lanca ou corrige linhas sem sair da fatura. O foco desta vista e manter o formulario principal limpo e a conferência mais rápida.</div>
          </div>
          <div className="inline-actions">
            <span className="tag">{workspaceModeLabel}</span>
            <span className="tag">{destinoLabel}</span>
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
            <div className="muted">{dataFaturaAtual}</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Totais da fatura</div>
            <div className="summary-main">{formatAmount(valorSemIvaFatura)} sem IVA</div>
            <div className="muted">{formatAmount(valorComIvaFatura)} com IVA</div>
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
              <div className="muted">O centro da pagina fica reservado ao lancamento da linha. Sugestoes, preview e criacao de catalogo passam para um rail de apoio ao lado.</div>
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
            const payload = buildItemPayload(form, selectedCatalog ? form.id_item : null);
            if (editingItemId) {
              updateItem.mutate({ itemId: editingItemId, payload });
              return;
            }
            createItems.mutate({ items: [payload] });
          }}
        >
          <div className="form-section">
            <div className="section-kicker">Item e mapeamento</div>
            <div className="section-copy">Define a descricao da linha, reaproveita um item existente quando possivel e so preenche o item oficial se for um caso novo.</div>
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
                {shouldSuggestNewItemOficial && isSuggestedItemOficial ? (
                  <div className="field-hint">
                    Sem correspondencia forte no catalogo. Foi sugerido automaticamente o nome {form.item_oficial} para este item novo.
                  </div>
                ) : null}
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
                  {unitOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              {fuelNature ? (
                <label>
                  Uso Combustivel
                  <select name="uso_combustivel" value={form.uso_combustivel} onChange={(event) => updateField("uso_combustivel", event.target.value)}>
                    {COMBUSTIVEL_USE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </div>

          <div className="form-section">
            <div className="section-kicker">Valores da linha</div>
            <div className="section-copy">Preenche quantidade, custo unitario, descontos e IVA. O total com IVA e calculado automaticamente para conferencia rapida.</div>
            <div className="form-grid">
              <label>
                Quantidade
                <input name="quantidade" type="number" step="0.01" required value={form.quantidade} onChange={(event) => updateField("quantidade", event.target.value)} />
              </label>
              <label>
                Custo Unit sem IVA
                <input name="custo_unit" type="number" step="0.0001" required value={form.custo_unit} onChange={(event) => updateField("custo_unit", event.target.value)} />
              </label>
              <label>
                Desconto 1 %
                <input name="desconto_1" type="number" step="0.01" value={form.desconto_1} onChange={(event) => updateField("desconto_1", event.target.value)} />
              </label>
              <label>
                Desconto 2 %
                <input name="desconto_2" type="number" step="0.01" value={form.desconto_2} onChange={(event) => updateField("desconto_2", event.target.value)} />
              </label>
              <label>
                IVA %
                <input name="iva" type="number" step="0.01" value={form.iva} onChange={(event) => updateField("iva", event.target.value)} />
              </label>
                <label>
                  Custo Total com IVA
                  <input
                    name="custo_total_com_iva"
                    type="text"
                    inputMode="decimal"
                    value={grossTotalDraft ?? (quantidade > 0 ? toFixedInputNumber(localTotalComIva, 2) : "")}
                    onChange={(event) => updateGrossTotal(event.target.value)}
                    onBlur={handleGrossTotalBlur}
                  />
                </label>
            </div>
          </div>

          <div className="form-section">
            <div className="section-kicker">Destino operacional</div>
            <div className="section-copy">Define se a linha entra em stock, gera consumo direto numa obra, fica imputada diretamente a uma viatura ou segue como despesa direta de escritorio ou empresa.</div>
            <div className="form-grid">
              <label>
                Destino
                <select name="destino" value={form.destino} onChange={(event) => updateField("destino", event.target.value)}>
                  {requiresVehicleDestination ? (
                    <option value="VIATURA">VIATURA</option>
                  ) : fuelNature ? (
                    <>
                      <option value="STOCK">STOCK</option>
                      <option value="CONSUMO">CONSUMO</option>
                    </>
                  ) : (
                    <>
                      <option value="STOCK">STOCK</option>
                      <option value="CONSUMO">CONSUMO</option>
                      <option value="ESCRITORIO">ESCRITORIO</option>
                      <option value="EMPRESA">EMPRESA</option>
                    </>
                  )}
                </select>
              </label>
              {form.destino === "VIATURA" ? (
                <label>
                  Matricula
                  {vehicleOptionsQuery.isPending ? <div className="field-hint">A carregar viaturas da aba `VEICULOS`...</div> : null}
                  {vehicleSelectOptions.length ? (
                    <select name="matricula" value={form.matricula} onChange={(event) => updateField("matricula", event.target.value)}>
                      <option value="">Selecione</option>
                      {vehicleSelectOptions.map((item) => (
                        <option key={item.matricula} value={item.matricula}>
                          {item.veiculo ? `${item.veiculo} | ${item.matricula}` : item.matricula}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {!vehicleSelectOptions.length ? (
                    <input name="matricula" placeholder="Escreve a matricula" value={form.matricula} onChange={(event) => updateField("matricula", event.target.value)} />
                  ) : null}
                  {vehicleOptionsQuery.isError ? (
                    <div className="field-hint">Nao foi possivel carregar as viaturas da Google Sheet. Podes escrever manualmente a matricula.</div>
                  ) : null}
                  {!vehicleOptionsQuery.isPending && !vehicleOptionsQuery.isError ? (
                    <div className="field-hint">{vehicleSelectOptions.length} matricula(s) disponivel(eis) a partir da aba `VEICULOS`.</div>
                  ) : null}
                </label>
              ) : null}
              <label>
                Obra
                {workOptions.length ? (
                  <select name="obra" value={form.obra} onChange={(event) => handleObraChange(event.target.value)} disabled={form.destino !== "CONSUMO"}>
                    <option value="">Selecione</option>
                    {workOptions.map((item) => (
                      <option key={String(item.obra)} value={String(item.obra)}>
                        {String(item.obra)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input name="obra" value={form.obra} onChange={(event) => updateField("obra", event.target.value)} disabled={form.destino !== "CONSUMO"} />
                )}
              </label>
              <label>
                Fase
                {availableFases.length ? (
                  <select name="fase" value={form.fase} onChange={(event) => updateField("fase", event.target.value)} disabled={form.destino !== "CONSUMO"}>
                    <option value="">Selecione</option>
                    {availableFases.map((fase) => (
                      <option key={fase} value={fase}>
                        {fase}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input name="fase" value={form.fase} onChange={(event) => updateField("fase", event.target.value)} disabled={form.destino !== "CONSUMO"} />
                )}
              </label>
            </div>
          </div>
          <label>
            Observacoes
            <textarea name="observacoes" rows={3} value={form.observacoes} onChange={(event) => updateField("observacoes", event.target.value)} />
          </label>

          <div className="form-actions detail-form-actions">
            <button className="btn secondary" disabled={preview.isPending} onClick={runPreview} type="button">
              {preview.isPending ? "A analisar..." : "Atualizar preview"}
            </button>
            <button className="btn primary" disabled={formBusy} type="submit">
              {formBusy ? "A guardar..." : editingItemId ? "Guardar alteracoes" : "Adicionar linha"}
            </button>
          </div>
        </form>
        </section>

        <aside className="detail-side-column">
          <section className="panel detail-assistant-rail">
            <div className="assistant-rail-head">
              <div className="section-kicker">Assistente lateral</div>
              <h3>Contexto da linha</h3>
              <div className="muted">Tudo o que ajuda a decidir sem tirar foco ao formulario principal.</div>
            </div>

            <div className="assistant-tabs" role="tablist" aria-label="Painel lateral de apoio">
              <button className={`assistant-tab ${assistantTab === "catalogo" ? "active" : ""}`} onClick={() => setAssistantTab("catalogo")} type="button">
                Catalogo
              </button>
              <button className={`assistant-tab ${assistantTab === "impacto" ? "active" : ""}`} onClick={() => setAssistantTab("impacto")} type="button">
                Impacto
              </button>
            </div>

            {assistantTab === "catalogo" ? (
              <div className="assistant-tab-panel">
                {catalogMessage ? <div className="status-note">{catalogMessage}</div> : null}

                {shouldSuggestNewItemOficial ? (
                  <div className="assistant-block">
                    <div className="assistant-head">
                      <strong>Sugestao para item novo</strong>
                      <span className="muted">Nao apareceu correspondencia forte no catalogo para esta descricao.</span>
                    </div>
                    <div className="assistant-note-list">
                      <div className="quick-create-copy">
                        <div><strong>Descricao:</strong> {form.descricao_original || "-"}</div>
                        <div><strong>Nome sugerido:</strong> {suggestedItemOficial || "-"}</div>
                      </div>
                      {!isSuggestedItemOficial ? (
                        <button className="btn secondary" onClick={applySuggestedItemOficial} type="button">
                          Usar nome sugerido
                        </button>
                      ) : null}
                      <div className="field-hint">Ajusta o nome se precisares, mas este ja te deixa o item oficial preparado para criacao rapida.</div>
                    </div>
                  </div>
                ) : null}

                <div className="assistant-block">
                  <div className="assistant-head">
                    <strong>Sugestoes do catalogo</strong>
                    <span className="muted">Confirma rapidamente se ja existe um item certo para esta linha.</span>
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
                    <div className="empty-note">Ainda nao apareceu nenhuma sugestao relevante. Continua a escrever ou cria um item novo.</div>
                  )}
                </div>

                <div className="assistant-block">
                  <div className="assistant-head">
                    <strong>Novo item oficial</strong>
                    <span className="muted">Cria um item novo apenas quando a linha nao corresponder a nenhum item existente.</span>
                  </div>
                  <div className="assistant-note-list">
                    <div className="quick-create-copy">
                      <div><strong>Descricao:</strong> {form.descricao_original || "-"}</div>
                      <div><strong>Item Oficial:</strong> {form.item_oficial || "-"}</div>
                    </div>
                    <button className="btn secondary" disabled={!canQuickCreate || createCatalog.isPending} onClick={handleQuickCreate} type="button">
                      {createCatalog.isPending ? "A criar..." : "Criar item no catalogo"}
                    </button>
                    <div className="field-hint">A `Descricao_Original` atual ficara guardada como primeira referencia desse item quando o criares no catalogo.</div>
                  </div>
                </div>
              </div>
            ) : null}

            {assistantTab === "impacto" ? (
              <div className="assistant-tab-panel">
                <div className="summary-card compact">
                  <div className="summary-title">Impacto previsto</div>
                  <div className="summary-main">
                    {form.destino === "STOCK" ? "Entrada em stock" : form.destino === "VIATURA" ? "Consumo em viatura" : form.destino === "ESCRITORIO" ? "Consumo em escritorio" : form.destino === "EMPRESA" ? "Consumo da empresa" : "Consumo direto"}
                  </div>
                  <div className="muted">{previewImpacts.length} efeitos operacionais previstos</div>
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

      <section className="panel detail-history-panel">
          <div className="row-head">
            <div>
              <div className="section-kicker">Linhas ja lancadas</div>
              <h3>{existingItems.length ? `${existingItems.length} linha(s) nesta fatura` : "Ainda sem linhas"}</h3>
              <div className="muted">Usa esta lista para rever o que ja entrou e abrir rapidamente uma linha em modo de correcao.</div>
            </div>
            <div className="history-totals-card">
              <div className="history-totals-title">Totais das linhas</div>
              <div className="history-totals-values">
                <strong>{formatAmount(existingItemsTotals.semIva)} sem IVA</strong>
                <span>{formatAmount(existingItemsTotals.comIva)} com IVA</span>
              </div>
            </div>
          </div>
          <div className="list detail-history-list">
            {existingItems.map((item) => {
              const id = String(item.id_item_fatura ?? "");
              return (
                <div className={`list-row list-row-compact ${editingItemId === id ? "list-row-active" : ""}`} key={id}>
                  <div className="list-row-body">
                    <div className="list-row-title">
                      <strong>{String(item.descricao_original)}</strong>
                      <div className="inline-actions">
                        <span className="tag">{String(item.destino)}</span>
                        {String(item.uso_combustivel ?? "") && String(item.uso_combustivel ?? "") !== "N/A" ? (
                          <span className="tag">{String(item.uso_combustivel)}</span>
                        ) : null}
                        <span className="tag">{String(item.estado_mapeamento ?? "-")}</span>
                        {editingItemId === id ? <span className="tag tag-success">Em edicao</span> : null}
                      </div>
                    </div>
                    <div className="list-row-meta">
                      <span className="mono">{id}</span>
                      <span>{String(item.id_item ?? "-")} | {String(item.item_oficial ?? "-")}</span>
                    </div>
                    <details className="list-row-collapsible">
                      <summary>Ver detalhe operacional</summary>
                      <div className="list-row-facts">
                        <span>{String(item.natureza ?? "-")} | {formatAmount(Number(item.quantidade ?? 0), 2)} {String(item.unidade ?? "")}</span>
                        <span>{formatAmount(Number(item.custo_total_sem_iva ?? 0))} sem IVA | {formatAmount(Number(item.custo_total_com_iva ?? 0))} com IVA</span>
                        <span>{String(item.destino ?? "") === "ESCRITORIO" || String(item.destino ?? "") === "EMPRESA" ? `${String(item.destino ?? "")} | -` : `${String(item.obra ?? "-")} | ${String(item.fase ?? "-")}`}</span>
                        {String(item.matricula ?? "") ? <span>Matricula: {String(item.matricula)}</span> : null}
                      </div>
                    </details>
                  </div>
                  <div className="list-row-actions">
                    <button className="btn secondary" type="button" onClick={() => startEdit(item)}>
                      Editar
                    </button>
                    <button
                      className="btn danger"
                      type="button"
                      disabled={deleteItem.isPending}
                      onClick={() => {
                        if (!window.confirm(`Apagar a linha ${id}? As afetacoes e movimentos gerados a partir desta linha tambem serao reconciliados.`)) {
                          return;
                        }
                        setFormMessage("");
                        deleteItem.mutate(id);
                      }}
                    >
                      Apagar
                    </button>
                  </div>
                </div>
              );
            })}
            {!existingItems.length ? <div className="empty-note">Ainda nao existem linhas associadas a esta fatura.</div> : null}
          </div>
      </section>
      </div>
    </div>
  );
}
