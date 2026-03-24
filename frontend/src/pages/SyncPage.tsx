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

type DiagnosticsEntity = Record<string, unknown> & {
  entity?: string;
  matches?: boolean;
  runtime_count?: number;
  sheet_count?: number;
  missing_in_runtime?: string[];
  missing_in_sheet?: string[];
  field_mismatch_count?: number;
  field_mismatches?: Array<{ id?: string; fields?: string[]; sheet_row_num?: number | null }>;
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
    compromissos_obra: "Compromissos",
    faturas_itens: "Itens de Fatura",
    notas_credito_itens: "Itens de Nota de Credito",
    materiais_cad: "Catalogo",
    materiais_referencias: "Referencias",
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
      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
      queryClient.invalidateQueries({ queryKey: ["catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["afetacoes"] });
      if (result.faturas_itens || result.notas_credito_itens) {
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
  const reloadInfo = {
    at: String(data?.last_reload_at ?? ""),
    source: String(data?.last_reload_source ?? ""),
  };
  const diagnosticsData = diagnosticsMutation.data as Record<string, unknown> | undefined;
  const diagnosticsEntities = ((diagnosticsData?.entities as DiagnosticsEntity[] | undefined) ?? []);
  const divergentCount = useMemo(() => diagnosticsEntities.filter((entity) => !entity.matches).length, [diagnosticsEntities]);
  const alignedCount = jobs.length - pendingCount;
  const messageTone = message.toLowerCase().includes("falha") ? "warning" : "";

  return (
    <div className="sync-page">
      <section className="panel sync-hero">
        <div className="detail-hero-head">
          <div>
            <div className="mono muted">Sync Center</div>
            <h3>Sincronizacao</h3>
            <div className="muted">A vista passa a separar o estado geral, as acoes manuais e o diagnostico tecnico para reduzir ruido na operacao diaria.</div>
          </div>
          <div className="inline-actions">
            <span className="tag">{jobs.length} entidade(s)</span>
            <span className={`tag ${pendingCount ? "tag-danger" : "tag-success"}`}>{pendingCount ? `${pendingCount} pendente(s)` : "Sem pendentes"}</span>
            {diagnosticsData ? <span className={`tag ${divergentCount ? "tag-danger" : "tag-success"}`}>{divergentCount ? `${divergentCount} divergente(s)` : "Diagnostico alinhado"}</span> : null}
          </div>
        </div>
        <div className="detail-header-grid sync-overview-grid">
          <div className="summary-card accent">
            <div className="summary-title">Pendentes</div>
            <div className="summary-main">{pendingCount}</div>
            <div className="muted">{pendingCount ? "Entidades a precisar de retry" : "Sem retries pendentes"}</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Entidades OK</div>
            <div className="summary-main">{alignedCount}</div>
            <div className="muted">{jobs.length ? "Sem retry nesta sessao" : "Ainda sem atividade observada"}</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Ultimo sucesso</div>
            <div className="summary-main">{formatDateTime(lastSuccess)}</div>
            <div className="muted">Com base na atividade desta sessao do backend</div>
          </div>
          <div className="summary-card">
            <div className="summary-title">Ultimo reload</div>
            <div className="summary-main">{formatDateTime(reloadInfo.at)}</div>
            <div className="muted">{reloadInfo.source ? `Fonte: ${reloadInfo.source}` : "Sem reload manual ainda"}</div>
          </div>
        </div>
      </section>

      <div className="sync-shell">
        <section className="panel sync-main-panel">
          <div className="row-head">
            <div>
              <div className="section-kicker">Estado atual</div>
              <h3>Fila e entidades</h3>
              <div className="muted">Aqui ficam apenas os sinais operacionais que interessam para perceber rapidamente se o sistema esta alinhado ou se precisa de intervencao.</div>
            </div>
          </div>

          {message ? <div className={messageTone ? `status-note ${messageTone}` : "status-note"}>{message}</div> : null}

          <div className="sync-status-list">
            {jobs.map((job) => (
              <div className={`sync-status-card ${job.pending_retry ? "is-pending" : ""}`} key={String(job.entity)}>
                <div className="row-head">
                  <div>
                    <strong>{entityLabel(job.entity)}</strong>
                    <div className="muted mono">{String(job.entity)}</div>
                  </div>
                  <span className={`tag ${job.pending_retry ? "tag-danger" : "tag-success"}`}>
                    {job.pending_retry ? "Pendente" : "OK"}
                  </span>
                </div>
                <div className="sync-status-meta">
                  <div>
                    <span className="detail-label">Ultimo upsert</span>
                    <div>{String(job.last_upserted ?? 0)} registos</div>
                  </div>
                  <div>
                    <span className="detail-label">Ultima tentativa</span>
                    <div>{formatDateTime(job.last_attempt_at)}</div>
                  </div>
                  <div>
                    <span className="detail-label">Ultimo sucesso</span>
                    <div>{formatDateTime(job.last_success_at)}</div>
                  </div>
                </div>
                {job.last_error ? <div className="status-note warning">{job.last_error}</div> : <div className="muted">Sem erros registados nesta sessao.</div>}
              </div>
            ))}
            {!jobs.length ? <div className="empty-note">Ainda nao existe atividade de sincronizacao nesta sessao.</div> : null}
          </div>
        </section>

        <aside className="sync-side-column">
          <section className="panel sync-actions-rail">
            <div className="assistant-rail-head">
              <div className="section-kicker">Acoes manuais</div>
              <h3>Manutencao e validacao</h3>
              <div className="muted">O rail lateral concentra operacoes raras e notas de contexto, sem roubar foco ao estado das entidades.</div>
            </div>

            <div className="status-note warning">
              Quando alguem mexe diretamente na Google Sheet, a app nao atualiza sozinha. Usa `Recarregar do Sheets` antes de validar divergencias ou continuar a trabalhar.
            </div>

            <div className="sync-action-list">
              <button
                className="btn secondary sync-action-btn"
                onClick={() => {
                  setMessage("");
                  reloadMutation.mutate();
                }}
                disabled={reloadMutation.isPending}
              >
                {reloadMutation.isPending ? "A recarregar..." : "Recarregar do Sheets"}
              </button>
              <button
                className="btn secondary sync-action-btn"
                onClick={() => {
                  setMessage("");
                  diagnosticsMutation.mutate();
                }}
                disabled={diagnosticsMutation.isPending}
              >
                {diagnosticsMutation.isPending ? "A diagnosticar..." : "Diagnosticar divergencias"}
              </button>
              <button
                className="btn primary sync-action-btn"
                onClick={() => {
                  setMessage("");
                  retryMutation.mutate();
                }}
                disabled={retryMutation.isPending}
              >
                {retryMutation.isPending ? "A reenviar..." : "Reenviar pendentes"}
              </button>
            </div>

            <details className="assistant-collapsible">
              <summary>Leitura operacional</summary>
              <div className="assistant-note-list">
                <div className="field-hint">`Recarregar do Sheets` deve ser o primeiro passo quando suspeitas de edicoes manuais fora da app.</div>
                <div className="field-hint">`Diagnosticar divergencias` serve para comparar runtime e Google Sheets por entidade.</div>
                <div className="field-hint">`Reenviar pendentes` deve ser usado quando existirem entidades marcadas com retry pendente.</div>
              </div>
            </details>
          </section>
        </aside>
      </div>

      {diagnosticsData ? (
        <section className="panel sync-diagnostics-panel">
          <div className="row-head">
            <div>
              <div className="section-kicker">Diagnostico tecnico</div>
              <h3>Runtime vs Google Sheets</h3>
              <div className="muted">As entidades ficam resumidas por defeito. Abre apenas as que estiverem divergentes ou que queiras validar em detalhe.</div>
            </div>
            <div className="inline-actions">
              <span className="tag">{formatDateTime(String(diagnosticsData.checked_at ?? ""))}</span>
              <span className={`tag ${divergentCount ? "tag-danger" : "tag-success"}`}>{divergentCount ? `${divergentCount} divergente(s)` : "Tudo alinhado"}</span>
            </div>
          </div>

          <div className="sync-diagnostic-grid">
            {diagnosticsEntities.map((entity) => {
              const mismatches = (entity.field_mismatches as DiagnosticsEntity["field_mismatches"]) ?? [];
              return (
                <details className={`sync-diagnostic-card ${entity.matches ? "" : "is-divergent"}`} key={String(entity.entity)} open={!entity.matches}>
                  <summary className="sync-diagnostic-summary">
                    <div>
                      <strong>{entityLabel(String(entity.entity ?? ""))}</strong>
                      <div className="muted">Runtime {String(entity.runtime_count ?? 0)} | Sheets {String(entity.sheet_count ?? 0)}</div>
                    </div>
                    <span className={`tag ${entity.matches ? "tag-success" : "tag-danger"}`}>{entity.matches ? "Alinhado" : "Divergente"}</span>
                  </summary>
                  <div className="sync-diagnostic-body">
                    <div className="sync-meta">
                      <div><span className="detail-label">Faltam no runtime</span><div>{(((entity.missing_in_runtime as string[] | undefined) ?? []).join(", ")) || "-"}</div></div>
                      <div><span className="detail-label">Faltam no sheets</span><div>{(((entity.missing_in_sheet as string[] | undefined) ?? []).join(", ")) || "-"}</div></div>
                    </div>
                    <div className="muted">Campos divergentes: {String(entity.field_mismatch_count ?? 0)}</div>
                    {mismatches.length ? (
                      <div className="diagnostic-list">
                        {mismatches.map((mismatch, index) => (
                          <div className="diagnostic-row" key={`${String(entity.entity)}-${String(mismatch?.id ?? index)}`}>
                            <div className="mono">{String(mismatch?.id ?? "-")}</div>
                            <div className="muted">Fields: {((mismatch?.fields ?? []).join(", ")) || "-"}</div>
                            <div className="muted">Sheet row: {String(mismatch?.sheet_row_num ?? "-")}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </details>
              );
            })}
            {!diagnosticsEntities.length ? <div className="empty-note">O diagnostico nao devolveu entidades para comparar.</div> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
