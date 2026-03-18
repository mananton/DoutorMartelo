import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/api";

export function SyncPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["sync-status"], queryFn: api.getSyncStatus });
  const retryMutation = useMutation({
    mutationFn: api.retrySync,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sync-status"] })
  });

  return (
    <section className="panel">
      <h3>Sincronizacao</h3>
      <button className="btn primary" onClick={() => retryMutation.mutate()}>Reenviar pendentes</button>
      <pre className="mono muted" style={{ whiteSpace: "pre-wrap", marginTop: "1rem" }}>
        {JSON.stringify(data ?? {}, null, 2)}
      </pre>
    </section>
  );
}
