import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../lib/api";
import type { WorkOption } from "../lib/workOptions";

type DocumentType = "FATURA" | "COMPROMISSO" | "NOTA_CREDITO";

type FaturaFormState = {
  tipo_doc: "FATURA" | "NOTA_CREDITO";
  doc_origem: string;
  id_compromisso: string;
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

type CompromissoFormState = {
  data: string;
  fornecedor: string;
  nif: string;
  tipo_doc: string;
  doc_origem: string;
  obra: string;
  fase: string;
  descricao: string;
  valor_sem_iva: string;
  iva: string;
  valor_com_iva: string;
  estado: string;
  observacoes: string;
};

type FaturaRow = Record<string, unknown> & {
  id_fatura?: string;
  tipo_doc?: string;
  doc_origem?: string;
  id_compromisso?: string;
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
  estado?: string;
};

type CompromissoRow = Record<string, unknown> & {
  id_compromisso?: string;
  data?: string;
  fornecedor?: string;
  nif?: string;
  tipo_doc?: string;
  doc_origem?: string;
  obra?: string;
  fase?: string;
  descricao?: string;
  valor_sem_iva?: number;
  iva?: number;
  valor_com_iva?: number;
  estado?: string;
  observacoes?: string;
};

type SupplierOption = Record<string, unknown> & {
  id_fornecedor?: string;
  fornecedor?: string;
  nif?: string;
};

type QueueRow = {
  document_type: "FATURA" | "COMPROMISSO" | "NOTA_CREDITO";
  id: string;
  fornecedor: string;
  nif: string;
  data: string;
  valor_com_iva: number;
  estado: string;
  documento_ref: string;
  paga: boolean;
  data_pagamento: string;
  tipo_doc: string;
  obra: string;
  fase: string;
  descricao: string;
  id_compromisso: string;
};

const INITIAL_FATURA_FORM: FaturaFormState = {
  tipo_doc: "FATURA",
  doc_origem: "",
  id_compromisso: "",
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

const INITIAL_COMPROMISSO_FORM: CompromissoFormState = {
  data: "",
  fornecedor: "",
  nif: "",
  tipo_doc: "PRO_FORMA",
  doc_origem: "",
  obra: "",
  fase: "",
  descricao: "",
  valor_sem_iva: "",
  iva: "23",
  valor_com_iva: "",
  estado: "ABERTO",
  observacoes: "",
};

const COMPROMISSO_TIPO_DOC_OPTIONS = ["PRO_FORMA", "ORCAMENTO", "ADJUDICACAO"] as const;
const COMPROMISSO_ESTADO_OPTIONS = ["ABERTO", "PARCIALMENTE_PAGO", "PAGO"] as const;

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

function toFaturaFormState(item: FaturaRow): FaturaFormState {
  return {
    tipo_doc: String(item.tipo_doc ?? "FATURA") === "NOTA_CREDITO" ? "NOTA_CREDITO" : "FATURA",
    doc_origem: String(item.doc_origem ?? ""),
    id_compromisso: String(item.id_compromisso ?? ""),
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

function toCompromissoFormState(item: CompromissoRow): CompromissoFormState {
  return {
    data: String(item.data ?? ""),
    fornecedor: String(item.fornecedor ?? ""),
    nif: String(item.nif ?? ""),
    tipo_doc: String(item.tipo_doc ?? "PRO_FORMA"),
    doc_origem: String(item.doc_origem ?? ""),
    obra: String(item.obra ?? ""),
    fase: String(item.fase ?? ""),
    descricao: String(item.descricao ?? ""),
    valor_sem_iva: String(item.valor_sem_iva ?? ""),
    iva: String(item.iva ?? 23),
    valor_com_iva: String(item.valor_com_iva ?? ""),
    estado: String(item.estado ?? "ABERTO"),
    observacoes: String(item.observacoes ?? ""),
  };
}

function buildQueueRows(faturas: FaturaRow[], compromissos: CompromissoRow[]): QueueRow[] {
  const invoiceRows: QueueRow[] = faturas.map((item) => ({
    document_type: String(item.tipo_doc ?? "FATURA") === "NOTA_CREDITO" ? "NOTA_CREDITO" : "FATURA",
    id: String(item.id_fatura ?? ""),
    fornecedor: String(item.fornecedor ?? ""),
    nif: String(item.nif ?? ""),
    data: String(item.data_fatura ?? ""),
    valor_com_iva: Number(item.valor_com_iva ?? 0),
    estado: String(item.estado ?? "ATIVA"),
    documento_ref:
      String(item.tipo_doc ?? "FATURA") === "NOTA_CREDITO"
        ? `${String(item.nr_documento ?? "")}${String(item.doc_origem ?? "") ? ` | origem ${String(item.doc_origem ?? "")}` : ""}`
        : String(item.nr_documento ?? ""),
    paga: String(item.tipo_doc ?? "FATURA") === "NOTA_CREDITO" ? false : Boolean(item.paga ?? false),
    data_pagamento: String(item.data_pagamento ?? ""),
    tipo_doc: String(item.tipo_doc ?? "FATURA"),
    obra: "",
    fase: "",
    descricao: String(item.doc_origem ?? ""),
    id_compromisso: String(item.id_compromisso ?? ""),
  }));

  const compromissoRows: QueueRow[] = compromissos.map((item) => ({
    document_type: "COMPROMISSO",
    id: String(item.id_compromisso ?? ""),
    fornecedor: String(item.fornecedor ?? ""),
    nif: String(item.nif ?? ""),
    data: String(item.data ?? ""),
    valor_com_iva: Number(item.valor_com_iva ?? 0),
    estado: String(item.estado ?? "ABERTO"),
    documento_ref: String(item.doc_origem ?? ""),
    paga: false,
    data_pagamento: "",
    tipo_doc: String(item.tipo_doc ?? "PRO_FORMA"),
    obra: String(item.obra ?? ""),
    fase: String(item.fase ?? ""),
    descricao: String(item.descricao ?? ""),
    id_compromisso: String(item.id_compromisso ?? ""),
  }));

  return [...invoiceRows, ...compromissoRows].sort((left, right) => {
    const leftDate = left.data || "";
    const rightDate = right.data || "";
    if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
    return right.id.localeCompare(left.id);
  });
}

export function FaturasPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [documentType, setDocumentType] = useState<DocumentType>("FATURA");
  const [faturaForm, setFaturaForm] = useState<FaturaFormState>(INITIAL_FATURA_FORM);
  const [compromissoForm, setCompromissoForm] = useState<CompromissoFormState>(INITIAL_COMPROMISSO_FORM);
  const [editingFaturaId, setEditingFaturaId] = useState<string | null>(null);
  const [editingCompromissoId, setEditingCompromissoId] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const faturasQuery = useQuery({ queryKey: ["faturas"], queryFn: api.listFaturas });
  const compromissosQuery = useQuery({ queryKey: ["compromissos"], queryFn: api.listCompromissos });
  const supplierOptionsQuery = useQuery({ queryKey: ["supplier-options"], queryFn: api.getSupplierOptions });
  const workOptionsQuery = useQuery({ queryKey: ["work-options"], queryFn: api.getWorkOptions });

  const faturas = useMemo(() => ((faturasQuery.data as FaturaRow[] | undefined) ?? []), [faturasQuery.data]);
  const compromissos = useMemo(() => ((compromissosQuery.data as CompromissoRow[] | undefined) ?? []), [compromissosQuery.data]);
  const supplierOptions = useMemo(
    () => ((supplierOptionsQuery.data?.fornecedores as SupplierOption[] | undefined) ?? []),
    [supplierOptionsQuery.data],
  );
  const workOptions = useMemo(
    () => ((workOptionsQuery.data?.obras as WorkOption[] | undefined) ?? []),
    [workOptionsQuery.data],
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
  const compromissoOptions = useMemo(
    () =>
      compromissos.map((item) => ({
        id_compromisso: String(item.id_compromisso ?? ""),
        label: `${String(item.id_compromisso ?? "")} | ${String(item.tipo_doc ?? "PRO_FORMA")} | ${String(item.doc_origem ?? "")}`,
      })),
    [compromissos],
  );
  const allFases = useMemo(
    () =>
      Array.from(
        new Set(
          workOptions.flatMap((item) => item.fases ?? []),
        ),
      ).sort((left, right) => left.localeCompare(right, "pt-PT")),
    [workOptions],
  );
  const queueRows = useMemo(() => buildQueueRows(faturas, compromissos), [faturas, compromissos]);
  const filteredRows = useMemo(() => {
    const search = normalize(searchTerm);
    if (!search) return queueRows;
    return queueRows.filter((item) => {
      const haystack = [
        item.id,
        item.fornecedor,
        item.documento_ref,
        item.nif,
        item.obra,
        item.fase,
        item.descricao,
        item.id_compromisso,
        item.tipo_doc,
      ].map(normalize);
      return haystack.some((value) => value.includes(search));
    });
  }, [queueRows, searchTerm]);

  const createFaturaMutation = useMutation({
    mutationFn: api.createFatura,
    onSuccess: (created) => {
      const id = String(created.id_fatura ?? "");
      const tipoDoc = String(created.tipo_doc ?? "FATURA");
      setFormMessage(tipoDoc === "NOTA_CREDITO" ? "Nota de credito guardada com sucesso." : "Fatura guardada com sucesso.");
      setFaturaForm(INITIAL_FATURA_FORM);
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      navigate(`/faturas/${id}`);
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao guardar fatura.");
    },
  });

  const updateFaturaMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.updateFatura(id, payload),
    onSuccess: (updated, variables) => {
      const tipoDoc = String(updated.tipo_doc ?? "FATURA");
      setFormMessage(`${tipoDoc === "NOTA_CREDITO" ? "Nota de credito" : "Fatura"} ${variables.id} atualizada com sucesso.`);
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["fatura", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      setEditingFaturaId(null);
      setFaturaForm(INITIAL_FATURA_FORM);
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao atualizar fatura.");
    },
  });

  const deleteFaturaMutation = useMutation({
    mutationFn: api.deleteFatura,
    onSuccess: (_, id) => {
      setFormMessage(`Documento ${id} apagado com sucesso.`);
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      queryClient.invalidateQueries({ queryKey: ["movimentos"] });
      queryClient.invalidateQueries({ queryKey: ["stock-list"] });
      if (editingFaturaId === id) {
        setEditingFaturaId(null);
        setFaturaForm(INITIAL_FATURA_FORM);
      }
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao apagar fatura.");
    },
  });

  const createCompromissoMutation = useMutation({
    mutationFn: api.createCompromisso,
    onSuccess: (created) => {
      setFormMessage(`Compromisso ${String(created.id_compromisso ?? "")} guardado com sucesso.`);
      setCompromissoForm(INITIAL_COMPROMISSO_FORM);
      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao guardar compromisso.");
    },
  });

  const updateCompromissoMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.updateCompromisso(id, payload),
    onSuccess: (_, variables) => {
      setFormMessage(`Compromisso ${variables.id} atualizado com sucesso.`);
      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      setEditingCompromissoId(null);
      setCompromissoForm(INITIAL_COMPROMISSO_FORM);
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao atualizar compromisso.");
    },
  });

  const deleteCompromissoMutation = useMutation({
    mutationFn: api.deleteCompromisso,
    onSuccess: (_, id) => {
      setFormMessage(`Compromisso ${id} apagado com sucesso.`);
      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      if (editingCompromissoId === id) {
        setEditingCompromissoId(null);
        setCompromissoForm(INITIAL_COMPROMISSO_FORM);
      }
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao apagar compromisso.");
    },
  });

  function resetEditor(nextType: DocumentType = documentType) {
    setDocumentType(nextType);
    setEditingFaturaId(null);
    setEditingCompromissoId(null);
    setFaturaForm({ ...INITIAL_FATURA_FORM, tipo_doc: nextType === "NOTA_CREDITO" ? "NOTA_CREDITO" : "FATURA" });
    setCompromissoForm(INITIAL_COMPROMISSO_FORM);
    setFormMessage("");
  }

  function updateFaturaField(field: keyof FaturaFormState, value: string) {
    setFormMessage("");
    setFaturaForm((current) => {
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

  function updateCompromissoField(field: keyof CompromissoFormState, value: string) {
    setFormMessage("");
    setCompromissoForm((current) => {
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

  function updateFaturaPagaField(checked: boolean) {
    setFormMessage("");
    setFaturaForm((current) => ({
      ...current,
      paga: checked,
      data_pagamento: checked ? current.data_pagamento : "",
    }));
  }

  function updateFaturaFornecedorField(value: string) {
    setFormMessage("");
    setFaturaForm((current) => {
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

  function updateCompromissoFornecedorField(value: string) {
    setFormMessage("");
    setCompromissoForm((current) => {
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

  function startEditFatura(item: FaturaRow) {
    const nextType = String(item.tipo_doc ?? "FATURA") === "NOTA_CREDITO" ? "NOTA_CREDITO" : "FATURA";
    setDocumentType(nextType);
    setEditingCompromissoId(null);
    setEditingFaturaId(String(item.id_fatura ?? ""));
    setFaturaForm(toFaturaFormState(item));
    setCompromissoForm(INITIAL_COMPROMISSO_FORM);
    setFormMessage("");
  }

  function startEditCompromisso(item: CompromissoRow) {
    setDocumentType("COMPROMISSO");
    setEditingFaturaId(null);
    setEditingCompromissoId(String(item.id_compromisso ?? ""));
    setCompromissoForm(toCompromissoFormState(item));
    setFaturaForm(INITIAL_FATURA_FORM);
    setFormMessage("");
  }

  function handleDocumentTypeChange(nextType: DocumentType) {
    if (documentType === nextType) return;
    resetEditor(nextType);
  }

  const headerIsFaturaFamily = documentType === "FATURA" || documentType === "NOTA_CREDITO";
  const valorSemIvaAtual = headerIsFaturaFamily ? toNumber(faturaForm.valor_sem_iva) : toNumber(compromissoForm.valor_sem_iva);
  const valorComIvaAtual = headerIsFaturaFamily ? toNumber(faturaForm.valor_com_iva) : toNumber(compromissoForm.valor_com_iva);
  const volumeTotal = useMemo(
    () => filteredRows.reduce((total, item) => total + Number(item.valor_com_iva ?? 0), 0),
    [filteredRows],
  );
  const latestDocumentDate = useMemo(() => {
    const dates = queueRows.map((item) => item.data).filter(Boolean);
    return dates.sort().at(-1) ?? "";
  }, [queueRows]);
  const workspaceModeLabel = editingFaturaId || editingCompromissoId
    ? `A editar ${editingFaturaId ?? editingCompromissoId ?? ""}`
    : documentType === "COMPROMISSO"
      ? "Novo compromisso"
      : documentType === "NOTA_CREDITO"
        ? "Nova nota de credito"
        : "Nova fatura";
  const busy =
    headerIsFaturaFamily
      ? createFaturaMutation.isPending || updateFaturaMutation.isPending
      : createCompromissoMutation.isPending || updateCompromissoMutation.isPending;

  return (
    <div className="workspace-page">
      <section className="panel workspace-hero">
        <div className="detail-hero-head">
          <div>
            <div className="mono muted">Faturas</div>
            <h3>Queue de Compras</h3>
            <div className="muted">A fila passa a concentrar documentos de compra e compromissos, mantendo o detalhe de linhas reservado para faturas reais.</div>
          </div>
          <div className="inline-actions">
            <span className="tag">{workspaceModeLabel}</span>
            <span className="tag tag-success">{filteredRows.length} visivel(is)</span>
            <button className="btn secondary" type="button" onClick={() => resetEditor(documentType)}>
              Novo registo
            </button>
          </div>
        </div>
        <div className="detail-header-grid workspace-overview-grid">
          <div className="summary-card accent">
            <div className="summary-title">Total de documentos</div>
            <div className="summary-main">{queueRows.length}</div>
            <div className="muted">Faturas e compromissos na fila atual.</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Resultado visivel</div>
            <div className="summary-main">{filteredRows.length}</div>
            <div className="muted">{searchTerm ? "Com o filtro atual aplicado." : "Sem filtro de pesquisa."}</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Volume visivel</div>
            <div className="summary-main">{formatAmount(volumeTotal)} com IVA</div>
            <div className="muted">Soma dos documentos atualmente visiveis na fila.</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Ultima data</div>
            <div className="summary-main">{latestDocumentDate || "-"}</div>
            <div className="muted">{editingFaturaId || editingCompromissoId ? "Editor com correcao em curso." : "Pronto para novo registo."}</div>
          </div>
        </div>
      </section>

      <div className="workspace-shell">
        <section className="panel queue-panel">
          <div className="row-head">
            <div>
              <div className="section-kicker">Fila operacional</div>
              <h3>Lista de Documentos</h3>
              <div className="muted">Usa a fila para localizar uma fatura, abrir o detalhe das linhas ou corrigir um compromisso assumido na obra.</div>
            </div>
          </div>

          <div className="queue-toolbar">
            <label className="queue-search">
              Pesquisar documentos
              <input
                name="search_documentos"
                placeholder="ID, fornecedor, documento, compromisso, obra ou fase"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
          </div>

          <div className="queue-list">
            {filteredRows.map((item) => {
              const isHeaderDetail = item.document_type === "FATURA" || item.document_type === "NOTA_CREDITO";
              const isNoteCredit = item.document_type === "NOTA_CREDITO";
              return (
                <div key={`${item.document_type}-${item.id}`} className={`list-row queue-card ${(editingFaturaId === item.id || editingCompromissoId === item.id) ? "list-row-active" : ""}`}>
                  <div className="queue-card-head">
                    <div className="queue-card-main">
                      <div className="mono">{item.id}</div>
                      <strong>{item.fornecedor || "-"}</strong>
                      <div className="muted">
                        {item.documento_ref || "-"} | {item.data || "-"}
                        {!isHeaderDetail && item.obra ? ` | ${item.obra}${item.fase ? ` / ${item.fase}` : ""}` : ""}
                      </div>
                    </div>
                    <div className="queue-card-metrics">
                      <span className="tag">{isHeaderDetail ? (isNoteCredit ? "Nota de Credito" : "Fatura") : "Compromisso"}</span>
                      {!isHeaderDetail ? <span className="tag">{item.tipo_doc}</span> : null}
                      <span className="tag">{formatAmount(item.valor_com_iva)} com IVA</span>
                      {isHeaderDetail && !isNoteCredit ? (
                        <span className={`tag ${item.paga ? "tag-success" : ""}`}>{item.paga ? "Paga" : "Por pagar"}</span>
                      ) : isNoteCredit ? (
                        <span className="tag">Credito</span>
                      ) : (
                        <span className={`tag ${item.estado === "PAGO" ? "tag-success" : ""}`}>{item.estado}</span>
                      )}
                      {isHeaderDetail && !isNoteCredit && item.data_pagamento ? <span className="tag">{item.data_pagamento}</span> : null}
                      {isHeaderDetail && item.id_compromisso ? <span className="tag">Ligada a {item.id_compromisso}</span> : null}
                      {isNoteCredit && item.descricao ? <span className="tag">Origem {item.descricao}</span> : null}
                      {!isHeaderDetail && item.descricao ? <span className="tag">{item.descricao}</span> : null}
                    </div>
                  </div>
                  <div className="inline-actions">
                    {isHeaderDetail ? (
                      <button className="btn secondary" type="button" onClick={() => navigate(`/faturas/${item.id}`)}>
                        Abrir
                      </button>
                    ) : null}
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => {
                        if (isHeaderDetail) {
                          const row = faturas.find((entry) => String(entry.id_fatura ?? "") === item.id);
                          if (row) startEditFatura(row);
                          return;
                        }
                        const row = compromissos.find((entry) => String(entry.id_compromisso ?? "") === item.id);
                        if (row) startEditCompromisso(row);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="btn danger"
                      type="button"
                      onClick={() => {
                        const confirmation = isHeaderDetail
                          ? `Apagar o documento ${item.id}? Isto tambem remove as linhas e os registos tecnicos gerados a partir dele.`
                          : `Apagar o compromisso ${item.id}? Esta acao so e permitida se nenhuma fatura estiver ligada a este compromisso.`;
                        if (!window.confirm(confirmation)) {
                          return;
                        }
                        setFormMessage("");
                        if (isHeaderDetail) {
                          deleteFaturaMutation.mutate(item.id);
                          return;
                        }
                        deleteCompromissoMutation.mutate(item.id);
                      }}
                      disabled={deleteFaturaMutation.isPending || deleteCompromissoMutation.isPending}
                    >
                      Apagar
                    </button>
                  </div>
                </div>
              );
            })}
            {!filteredRows.length ? (
              <div className="empty-note">
                {searchTerm ? "Nenhum documento corresponde ao filtro atual." : "Ainda nao existem documentos carregados."}
              </div>
            ) : null}
          </div>
        </section>
        <section className="panel editor-panel">
          <div className="row-head">
            <div>
              <div className="section-kicker">Workspace principal</div>
              <h3>
                {documentType === "COMPROMISSO"
                  ? (editingCompromissoId ? `Editar ${editingCompromissoId}` : "Novo Compromisso")
                  : (editingFaturaId ? `Editar ${editingFaturaId}` : documentType === "NOTA_CREDITO" ? "Nova Nota de Credito" : "Nova Fatura")}
              </h3>
              <div className="muted">
                {documentType === "COMPROMISSO"
                  ? "O compromisso regista o custo assumido na obra antes das faturas reais. Nesta fase fica como cabecalho operacional, sem workspace de linhas."
                  : documentType === "NOTA_CREDITO"
                    ? "A nota de credito usa o mesmo cabecalho base de `FATURAS`, mas abre um detalhe proprio para linhas de credito, impacto em stock e reducoes de custo."
                    : "A fatura continua a ser o documento que abre o detalhe de linhas. Aqui so acrescentamos a ligacao opcional a um compromisso ja assumido."}
              </div>
            </div>
            <div className="inline-actions">
              <button className={`btn ${documentType === "FATURA" ? "primary" : "secondary"}`} type="button" onClick={() => handleDocumentTypeChange("FATURA")}>
                Fatura
              </button>
              <button className={`btn ${documentType === "COMPROMISSO" ? "primary" : "secondary"}`} type="button" onClick={() => handleDocumentTypeChange("COMPROMISSO")}>
                Compromisso
              </button>
              <button className={`btn ${documentType === "NOTA_CREDITO" ? "primary" : "secondary"}`} type="button" onClick={() => handleDocumentTypeChange("NOTA_CREDITO")}>
                Nota de Credito
              </button>
              {(editingFaturaId || editingCompromissoId) ? (
                <button className="btn secondary" type="button" onClick={() => resetEditor(documentType)}>
                  Cancelar edicao
                </button>
              ) : null}
            </div>
          </div>

          <div className="field-hint">
            {documentType === "NOTA_CREDITO"
              ? "Os totais do documento continuam em `FATURAS`, mas as linhas passam a ser registadas em `NOTAS_CREDITO_ITENS` com impacto tecnico proprio."
              : "A fila principal continua a misturar documentos e compromissos, mas cada tipo abre o seu fluxo certo sem cruzar linhas nem movimentos."}
          </div>

          {formMessage ? <div className="status-note">{formMessage}</div> : null}

          <div className="form-summary-grid">
            <div className="summary-card accent">
              <div className="summary-title">{documentType === "COMPROMISSO" ? "Compromisso" : "Fornecedor"}</div>
              <div className="summary-main">{documentType === "COMPROMISSO" ? (editingCompromissoId || "Novo compromisso") : (faturaForm.fornecedor || "-")}</div>
              <div className="muted">
                {documentType === "COMPROMISSO"
                  ? (compromissoForm.doc_origem || "Documento de origem ainda por definir.")
                  : documentType === "NOTA_CREDITO"
                    ? (faturaForm.doc_origem || "Documento original ainda por indicar.")
                    : (faturaForm.nr_documento || "Documento ainda por definir.")}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-title">Totais em edicao</div>
              <div className="summary-main">{formatAmount(valorSemIvaAtual)} sem IVA</div>
              <div className="muted">{formatAmount(valorComIvaAtual)} com IVA | IVA {headerIsFaturaFamily ? (faturaForm.iva || "0") : (compromissoForm.iva || "0")}%</div>
            </div>
            <div className="summary-card">
              <div className="summary-title">{documentType === "COMPROMISSO" ? "Estado" : documentType === "NOTA_CREDITO" ? "Origem" : "Pagamento"}</div>
              <div className="summary-main">
                {documentType === "COMPROMISSO"
                  ? (compromissoForm.estado || "ABERTO")
                  : documentType === "NOTA_CREDITO"
                    ? (faturaForm.doc_origem || "-")
                    : (faturaForm.paga ? "Paga" : "Por pagar")}
              </div>
              <div className="muted">
                {documentType === "COMPROMISSO"
                  ? `${compromissoForm.tipo_doc || "PRO_FORMA"} | ${compromissoForm.obra || "Obra por definir"}`
                  : documentType === "NOTA_CREDITO"
                    ? (faturaForm.nr_documento || "Numero da nota ainda por definir.")
                    : (faturaForm.data_pagamento || "Sem data de pagamento registada.")}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-title">{documentType === "COMPROMISSO" ? "Fase" : documentType === "NOTA_CREDITO" ? "Ligacao" : "Ligacao"}</div>
              <div className="summary-main">{documentType === "COMPROMISSO" ? (compromissoForm.fase || "-") : (faturaForm.id_compromisso || "Sem compromisso")}</div>
              <div className="muted">
                {documentType === "COMPROMISSO"
                  ? (compromissoForm.descricao || "Descricao ainda por definir.")
                  : documentType === "NOTA_CREDITO"
                    ? "Usa `ID_Compromisso` apenas se esta regularizacao estiver ligada a um custo previamente assumido."
                    : "Preenche apenas quando a fatura liquidar um custo ja assumido."}
              </div>
            </div>
          </div>

          {documentType !== "COMPROMISSO" ? (
            <form
              className="form detail-form"
              onSubmit={(event) => {
                event.preventDefault();
                setFormMessage("");
                const payload = {
                  tipo_doc: documentType === "NOTA_CREDITO" ? "NOTA_CREDITO" : "FATURA",
                  doc_origem: documentType === "NOTA_CREDITO" ? (faturaForm.doc_origem || null) : null,
                  id_compromisso: faturaForm.id_compromisso || null,
                  fornecedor: faturaForm.fornecedor,
                  nif: faturaForm.nif,
                  nr_documento: faturaForm.nr_documento,
                  data_fatura: faturaForm.data_fatura,
                  valor_sem_iva: toNumber(faturaForm.valor_sem_iva),
                  iva: toNumber(faturaForm.iva),
                  valor_com_iva: toNumber(faturaForm.valor_com_iva),
                  paga: documentType === "FATURA" ? faturaForm.paga : false,
                  data_pagamento: documentType === "FATURA" && faturaForm.paga && faturaForm.data_pagamento ? faturaForm.data_pagamento : null,
                  observacoes: faturaForm.observacoes || null,
                };
                if (editingFaturaId) {
                  updateFaturaMutation.mutate({ id: editingFaturaId, payload });
                  return;
                }
                createFaturaMutation.mutate(payload);
              }}
            >
              <div className="form-section">
                <div className="section-kicker">Tipo de documento</div>
                <div className="section-copy">
                  {documentType === "NOTA_CREDITO"
                    ? "A nota de credito pode ficar ligada a um custo assumido, mas usa sempre `Doc_Origem` para apontar ao documento original."
                    : "Uma fatura pode ou nao ficar ligada a um custo ja assumido em `COMPROMISSOS_OBRA`."}
                </div>
                <div className="form-grid">
                  <label>
                    ID_Compromisso
                    <input
                      list="fatura-compromisso-options"
                      name="id_compromisso"
                      placeholder="Opcional"
                      value={faturaForm.id_compromisso}
                      onChange={(event) => updateFaturaField("id_compromisso", event.target.value)}
                    />
                    <datalist id="fatura-compromisso-options">
                      {compromissoOptions.map((option) => (
                        <option key={option.id_compromisso} value={option.id_compromisso} label={option.label} />
                      ))}
                    </datalist>
                  </label>
                  {documentType === "NOTA_CREDITO" ? (
                    <label>
                      Doc_Origem
                      <input
                        name="doc_origem"
                        required
                        placeholder="Numero do documento original"
                        value={faturaForm.doc_origem}
                        onChange={(event) => updateFaturaField("doc_origem", event.target.value)}
                      />
                    </label>
                  ) : null}
                </div>
                <div className="field-hint">
                  {documentType === "NOTA_CREDITO"
                    ? "Mantem os valores positivos no documento; o motor trata-os como credito e gera os movimentos tecnicos a partir das linhas."
                    : "Usa este campo quando a fatura for uma tranche ou liquidacao de um custo previamente assumido em `COMPROMISSOS_OBRA`."}
                </div>
              </div>

              <div className="form-section">
                <div className="section-kicker">Fornecedor e documento</div>
                <div className="section-copy">
                  {documentType === "NOTA_CREDITO"
                    ? "Define a identidade da nota de credito e os campos que depois hidratam automaticamente as linhas de `NOTAS_CREDITO_ITENS`."
                    : "Define a identidade da fatura e os campos que depois hidratam automaticamente as linhas dependentes."}
                </div>
                <div className="form-grid">
                  <label>
                    Fornecedor
                    <input
                      list="fatura-fornecedor-options"
                      name="fornecedor"
                      required
                      value={faturaForm.fornecedor}
                      onChange={(event) => updateFaturaFornecedorField(event.target.value)}
                    />
                    <datalist id="fatura-fornecedor-options">
                      {supplierOptions.map((option) => {
                        const fornecedor = String(option.fornecedor ?? "");
                        if (!fornecedor) return null;
                        return <option key={String(option.id_fornecedor ?? fornecedor)} value={fornecedor} label={String(option.nif ?? "")} />;
                      })}
                    </datalist>
                  </label>
                  <label>NIF<input name="nif" required value={faturaForm.nif} onChange={(event) => updateFaturaField("nif", event.target.value)} /></label>
                  <label>{documentType === "NOTA_CREDITO" ? "Numero Nota de Credito" : "Numero Doc/Fatura"}<input name="nr_documento" required value={faturaForm.nr_documento} onChange={(event) => updateFaturaField("nr_documento", event.target.value)} /></label>
                  <label>Data Fatura<input name="data_fatura" type="date" required value={faturaForm.data_fatura} onChange={(event) => updateFaturaField("data_fatura", event.target.value)} /></label>
                </div>
                <div className="field-hint">
                  {supplierOptions.length
                    ? "A lista de fornecedores vem da aba `FORNECEDORES`. Ao escolher um fornecedor conhecido, o `NIF` e preenchido automaticamente."
                    : "Quando existirem fornecedores carregados da Google Sheet, este campo passa a sugeri-los automaticamente."}
                </div>
              </div>

              <div className="form-section">
                <div className="section-kicker">Valores</div>
                <div className="section-copy">
                  {documentType === "NOTA_CREDITO"
                    ? "Mantem os totais principais da nota de credito no cabecalho antes de abrires o detalhe das linhas de regularizacao."
                    : "Mantem os totais principais da fatura na mesma ficha antes de entrares no detalhe das linhas."}
                </div>
                <div className="form-grid">
                  <label>Valor Sem IVA<input name="valor_sem_iva" type="number" step="0.01" value={faturaForm.valor_sem_iva} onChange={(event) => updateFaturaField("valor_sem_iva", event.target.value)} /></label>
                  <label>IVA %<input name="iva" type="number" step="0.01" value={faturaForm.iva} onChange={(event) => updateFaturaField("iva", event.target.value)} /></label>
                  <label>Valor Com IVA<input name="valor_com_iva" type="number" step="0.01" value={faturaForm.valor_com_iva} onChange={(event) => updateFaturaField("valor_com_iva", event.target.value)} /></label>
                </div>
              </div>

              {documentType === "FATURA" ? (
                <div className="form-section">
                  <div className="section-kicker">Pagamento</div>
                  <div className="section-copy">Regista se a fatura ja foi paga e, quando aplicavel, a respetiva data de pagamento.</div>
                  <div className="form-grid">
                    <label className="checkbox-field">
                      <span>Pagamento</span>
                      <span className="checkbox-control">
                        <input
                          name="paga"
                          type="checkbox"
                          checked={faturaForm.paga}
                          onChange={(event) => updateFaturaPagaField(event.target.checked)}
                        />
                        <span>Paga?</span>
                      </span>
                    </label>
                    <label>
                      Data Pagamento
                      <input
                        name="data_pagamento"
                        type="date"
                        value={faturaForm.data_pagamento}
                        disabled={!faturaForm.paga}
                        onChange={(event) => updateFaturaField("data_pagamento", event.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              <label>
                Observacoes
                <textarea name="observacoes" rows={3} value={faturaForm.observacoes} onChange={(event) => updateFaturaField("observacoes", event.target.value)} />
              </label>

              <div className="field-hint">
                {documentType === "NOTA_CREDITO"
                  ? "Depois de guardar, abre o detalhe para lancar linhas de credito, decidir se cada uma reduz custo de obra e confirmar quando ha impacto em stock."
                  : "Depois de guardar, usa o detalhe da fatura para lancar linhas, mapear itens e validar impacto operacional."}
              </div>

              <div className="form-actions detail-form-actions">
                <button className="btn primary" type="submit" disabled={busy}>
                  {busy ? "A guardar..." : editingFaturaId ? "Guardar alteracoes" : documentType === "NOTA_CREDITO" ? "Guardar e abrir detalhe do credito" : "Guardar e abrir detalhe"}
                </button>
              </div>
            </form>
          ) : (
            <form
              className="form detail-form"
              onSubmit={(event) => {
                event.preventDefault();
                setFormMessage("");
                const payload = {
                  data: compromissoForm.data,
                  fornecedor: compromissoForm.fornecedor,
                  nif: compromissoForm.nif,
                  tipo_doc: compromissoForm.tipo_doc,
                  doc_origem: compromissoForm.doc_origem,
                  obra: compromissoForm.obra,
                  fase: compromissoForm.fase,
                  descricao: compromissoForm.descricao,
                  valor_sem_iva: toNumber(compromissoForm.valor_sem_iva),
                  iva: toNumber(compromissoForm.iva),
                  valor_com_iva: toNumber(compromissoForm.valor_com_iva),
                  estado: compromissoForm.estado,
                  observacoes: compromissoForm.observacoes || null,
                };
                if (editingCompromissoId) {
                  updateCompromissoMutation.mutate({ id: editingCompromissoId, payload });
                  return;
                }
                createCompromissoMutation.mutate(payload);
              }}
            >
              <div className="form-section">
                <div className="section-kicker">Compromisso de obra</div>
                <div className="section-copy">Este registo fixa o custo assumido na obra. As faturas reais que o liquidam ficam depois ligadas por `ID_Compromisso`.</div>
                <div className="form-grid">
                  <label>Data<input name="data" type="date" required value={compromissoForm.data} onChange={(event) => updateCompromissoField("data", event.target.value)} /></label>
                  <label>
                    Tipo_Doc
                    <select name="tipo_doc" value={compromissoForm.tipo_doc} onChange={(event) => updateCompromissoField("tipo_doc", event.target.value)}>
                      {COMPROMISSO_TIPO_DOC_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>Doc_Origem<input name="doc_origem" required value={compromissoForm.doc_origem} onChange={(event) => updateCompromissoField("doc_origem", event.target.value)} /></label>
                  <label>
                    Estado
                    <select name="estado" value={compromissoForm.estado} onChange={(event) => updateCompromissoField("estado", event.target.value)}>
                      {COMPROMISSO_ESTADO_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="form-section">
                <div className="section-kicker">Fornecedor e atribuicao</div>
                <div className="section-copy">O compromisso fica logo atribuido a `Obra` e `Fase`, mesmo que o pagamento real venha depois em varias faturas.</div>
                <div className="form-grid">
                  <label>
                    Fornecedor
                    <input
                      list="compromisso-fornecedor-options"
                      name="fornecedor"
                      required
                      value={compromissoForm.fornecedor}
                      onChange={(event) => updateCompromissoFornecedorField(event.target.value)}
                    />
                    <datalist id="compromisso-fornecedor-options">
                      {supplierOptions.map((option) => {
                        const fornecedor = String(option.fornecedor ?? "");
                        if (!fornecedor) return null;
                        return <option key={`comp-${String(option.id_fornecedor ?? fornecedor)}`} value={fornecedor} label={String(option.nif ?? "")} />;
                      })}
                    </datalist>
                  </label>
                  <label>NIF<input name="nif" required value={compromissoForm.nif} onChange={(event) => updateCompromissoField("nif", event.target.value)} /></label>
                  <label>
                    Obra
                    <input
                      list="compromisso-obra-options"
                      name="obra"
                      required
                      value={compromissoForm.obra}
                      onChange={(event) => updateCompromissoField("obra", event.target.value)}
                    />
                    <datalist id="compromisso-obra-options">
                      {workOptions.map((option) => (
                        <option key={option.obra} value={option.obra} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    Fase
                    <input
                      list="compromisso-fase-options"
                      name="fase"
                      required
                      value={compromissoForm.fase}
                      onChange={(event) => updateCompromissoField("fase", event.target.value)}
                    />
                    <datalist id="compromisso-fase-options">
                      {allFases.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </label>
                </div>
              </div>

              <div className="form-section">
                <div className="section-kicker">Descricao e valores</div>
                <div className="section-copy">Define o custo assumido na obra; o `ID_Compromisso` sera depois a ponte para as faturas que o liquidam.</div>
                <div className="form-grid">
                  <label>Descricao<input name="descricao" required value={compromissoForm.descricao} onChange={(event) => updateCompromissoField("descricao", event.target.value)} /></label>
                  <label>Valor Sem IVA<input name="valor_sem_iva" type="number" step="0.01" value={compromissoForm.valor_sem_iva} onChange={(event) => updateCompromissoField("valor_sem_iva", event.target.value)} /></label>
                  <label>IVA %<input name="iva" type="number" step="0.01" value={compromissoForm.iva} onChange={(event) => updateCompromissoField("iva", event.target.value)} /></label>
                  <label>Valor Com IVA<input name="valor_com_iva" type="number" step="0.01" value={compromissoForm.valor_com_iva} onChange={(event) => updateCompromissoField("valor_com_iva", event.target.value)} /></label>
                </div>
              </div>

              <label>
                Observacoes
                <textarea name="observacoes" rows={3} value={compromissoForm.observacoes} onChange={(event) => updateCompromissoField("observacoes", event.target.value)} />
              </label>

              <div className="field-hint">Depois de guardado, o compromisso fica pronto para ser referenciado por futuras faturas em `ID_Compromisso`.</div>

              <div className="form-actions detail-form-actions">
                <button className="btn primary" type="submit" disabled={busy}>
                  {busy ? "A guardar..." : editingCompromissoId ? "Guardar alteracoes" : "Guardar compromisso"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
