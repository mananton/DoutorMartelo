import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/api";

export function AfetacoesPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["afetacoes"], queryFn: api.listAfetacoes });
  const createMutation = useMutation({
    mutationFn: api.createAfetacao,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["afetacoes"] })
  });
  const processMutation = useMutation({
    mutationFn: (id: string) => api.processAfetacao(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["afetacoes"] })
  });

  return (
    <div className="grid two">
      <section className="panel">
        <h3>Nova Afetacao de Stock</h3>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            createMutation.mutate({
              origem: "STOCK",
              data: form.get("data"),
              id_item: form.get("id_item"),
              quantidade: Number(form.get("quantidade") || 0),
              iva: Number(form.get("iva") || 0),
              obra: form.get("obra"),
              fase: form.get("fase"),
              observacoes: form.get("observacoes") || null,
              processar: form.get("processar") === "on"
            });
          }}
        >
          <label>Data<input name="data" type="date" required /></label>
          <label>ID_Item<input name="id_item" required /></label>
          <label>Quantidade<input name="quantidade" type="number" step="0.01" required /></label>
          <label>IVA %<input name="iva" type="number" step="0.01" defaultValue="23" /></label>
          <label>Obra<input name="obra" required /></label>
          <label>Fase<input name="fase" required /></label>
          <label>Observacoes<textarea name="observacoes" rows={3} /></label>
          <label><input name="processar" type="checkbox" /> Processar</label>
          <button className="btn primary" type="submit">Guardar</button>
        </form>
      </section>
      <section className="panel">
        <h3>Afetacoes</h3>
        <div className="list">
          {(data ?? []).map((item) => (
            <div className="list-row" key={String(item.id_afetacao)}>
              <div className="mono">{String(item.id_afetacao)}</div>
              <div>{String(item.item_oficial ?? item.id_item)} · {String(item.obra)} / {String(item.fase)}</div>
              <div className="muted">{String(item.estado)}</div>
              <button className="btn secondary" onClick={() => processMutation.mutate(String(item.id_afetacao))}>Processar</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

