import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { api } from "../lib/api";

type SyncJob = {
  entity?: string;
  pending_retry?: boolean;
  last_error?: string | null;
  last_attempt_at?: string | null;
  last_success_at?: string | null;
  last_upserted?: number;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Ainda sem atividade";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function entityLabel(entity: string | undefined) {
  const labels: Record<string, string> = {
    faturas: "Faturas",
    faturas_itens: "Itens de Fatura",
    materiais_cad: "Catalogo",
    afetacoes_obra: "Afetacoes",
    materiais_mov: "Movimentos",
  };
  return labels[entity ?? ""] ?? entity ?? "Entidade";
}

export function SyncPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string>("");
  const { data } = useQuery({ queryKey: ["sync-status"], queryFn: api.getSyncStatus });
  const jobs = ((data?.jobs as SyncJob[] | undefined) ?? []);
  const diagnosticsMutation = useMutation({
    mutationFn: api.getSyncDiagnostics,
    onSuccess: () => {
      setMessage("Diagnostico de divergencias concluido.");
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Falha ao executar diagnostico.");
    },
  });

  const retryMutation = useMutation({
    mutationFn: api.retrySync,
    onSuccess: () => {
      setMessage("Pendentes reenviados.");
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Falha ao reenviar pendentes.");
    },
  });
  const reloadMutation = useMutation({
    mutationFn: api.reloadState,
    onSuccess: (result) => {
      setMessage("Estado recarregado a partir da Google Sheet.");
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      if (result.faturas_itens) {
        queryClient.invalidateQueries({ queryKey: ["fatura"] });
      }
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Falha ao recarregar estado.");
    },
  });

  const pendingCount = useMemo(() => jobs.filter((job) => job.pending_retry).length, [jobs]);
  const lastSuccess = useMemo(() => {
    const timestamps = jobs.map((job) => job.last_success_at).filter(Boolean) as string[];
    if (!timestamps.length) return null;
    return timestamps.sort().at(-1) ?? null;
  }, [jobs]);
  const reloadInfo = reloadMutation.data as Record<string, unknown> | undefined;

  return (
    <section className="panel">
      <h3>Sincronizacao</h3>
      <div className="form-summary-grid">
        <div className="summary-card accent">
          <div className="summary-title">Pendentes</div>
          <div className="summary-main">{pendingCount}</div>
          <div className="muted">{pendingCount ? "Entidades a precisar de retry" : "Sem retries pendentes"}</div>
        </div>
        <div className="summary-card">
          <div className="summary-title">Ultimo sucesso</div>
          <div className="summary-main">{formatDateTime(lastSuccess)}</div>
          <div className="muted">Com base na atividade desta sessao do backend</div>
        </div>
        <div className="summary-card">
          <div className="summary-title">Ultimo reload</div>
          <div className="summary-main">{formatDateTime(String(reloadInfo?.reloaded_at ?? ""))}</div>
          <div className="muted">{reloadInfo ? `${String(reloadInfo.faturas ?? 0)} faturas | ${String(reloadInfo.faturas_itens ?? 0)} itens` : "Sem reload manual ainda"}</div>
        </div>
      </div>

      <div className="form-actions">
        <button
          className="btn secondary"
          onClick={() => {
            setMessage("");
            reloadMutation.mutate();
          }}
          disabled={reloadMutation.isPending}
        >
          {reloadMutation.isPending ? "A recarregar..." : "Recarregar do Sheets"}
        </button>
        <button
          className="btn secondary"
          onClick={() => {
            setMessage("");
            diagnosticsMutation.mutate();
          }}
          disabled={diagnosticsMutation.isPending}
        >
          {diagnosticsMutation.isPending ? "A diagnosticar..." : "Diagnosticar divergencias"}
        </button>
        <button
          className="btn primary"
          onClick={() => {
            setMessage("");
            retryMutation.mutate();
          }}
          disabled={retryMutation.isPending}
        >
          {retryMutation.isPending ? "A reenviar..." : "Reenviar pendentes"}
        </button>
      </div>

      {message ? <div className="status-note" style={{ marginTop: "1rem" }}>{message}</div> : null}

      {diagnosticsMutation.data ? (
        <div className="assistant-block" style={{ marginTop: "1rem" }}>
          <div className="assistant-head">
            <strong>Diagnostico runtime vs Google Sheets</strong>
            <span className="muted">{formatDateTime(String((diagnosticsMutation.data as Record<string, unknown>).checked_at ?? ""))}</span>
          </div>
          <div className="sync-job-grid">
            {(((diagnosticsMutation.data as Record<string, unknown>).entities as Record<string, unknown>[] | undefined) ?? []).map((entity) => (
              <div className="sync-job-card" key={String(entity.entity)}>
                <div className="row-head">
                  <strong>{entityLabel(String(entity.entity ?? ""))}</strong>
                  <span className={`tag ${entity.matches ? "tag-success" : "tag-danger"}`}>{entity.matches ? "Alinhado" : "Divergente"}</span>
                </div>
                <div className="sync-meta">
                  <div><span className="detail-label">Runtime</span><div>{String(entity.runtime_count ?? 0)}</div></div>
                  <div><span className="detail-label">Sheets</span><div>{String(entity.sheet_count ?? 0)}</div></div>
                </div>
                <div className="muted">Faltam no runtime: {(((entity.missing_in_runtime as string[] | undefined) ?? []).join(", ")) || "-"}</div>
                <div className="muted">Faltam no sheets: {(((entity.missing_in_sheet as string[] | undefined) ?? []).join(", ")) || "-"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="sync-job-grid">
        {jobs.map((job) => (
          <div className="sync-job-card" key={String(job.entity)}>
            <div className="row-head">
              <strong>{entityLabel(job.entity)}</strong>
              <span className={`tag ${job.pending_retry ? "tag-danger" : "tag-success"}`}>
                {job.pending_retry ? "Pendente" : "OK"}
              </span>
            </div>
            <div className="sync-meta">
              <div><span className="detail-label">Entidade</span><div className="mono">{String(job.entity)}</div></div>
              <div><span className="detail-label">Ultimo upsert</span><div>{String(job.last_upserted ?? 0)} registos</div></div>
              <div><span className="detail-label">Ultima tentativa</span><div>{formatDateTime(job.last_attempt_at)}</div></div>
              <div><span className="detail-label">Ultimo sucesso</span><div>{formatDateTime(job.last_success_at)}</div></div>
            </div>
            {job.last_error ? <div className="status-note warning">{job.last_error}</div> : <div className="muted">Sem erros registados nesta sessao.</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
