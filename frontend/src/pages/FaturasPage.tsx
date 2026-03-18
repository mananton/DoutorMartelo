import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

import { api } from "../lib/api";

export function FaturasPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formMessage, setFormMessage] = useState<string>("");
  const { data } = useQuery({ queryKey: ["faturas"], queryFn: api.listFaturas });
  const createMutation = useMutation({
    mutationFn: api.createFatura,
    onSuccess: (created) => {
      setFormMessage("Fatura guardada com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      navigate(`/faturas/${String(created.id_fatura)}`);
    },
    onError: (error) => {
      setFormMessage(error instanceof Error ? error.message : "Falha ao guardar fatura.");
    },
  });

  return (
    <div className="grid two">
      <section className="panel">
        <h3>Nova Fatura</h3>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            setFormMessage("");
            const form = new FormData(event.currentTarget);
            createMutation.mutate({
              fornecedor: form.get("fornecedor"),
              nif: form.get("nif"),
              nr_documento: form.get("nr_documento"),
              data_fatura: form.get("data_fatura"),
              valor_sem_iva: Number(form.get("valor_sem_iva") || 0),
              iva: Number(form.get("iva") || 0),
              valor_com_iva: Number(form.get("valor_com_iva") || 0)
            });
          }}
        >
          <label>Fornecedor<input name="fornecedor" required /></label>
          <label>NIF<input name="nif" required /></label>
          <label>Numero Doc/Fatura<input name="nr_documento" required /></label>
          <label>Data Fatura<input name="data_fatura" type="date" required /></label>
          <label>Valor Sem IVA<input name="valor_sem_iva" type="number" step="0.01" /></label>
          <label>IVA %<input name="iva" type="number" step="0.01" defaultValue="23" /></label>
          <label>Valor Com IVA<input name="valor_com_iva" type="number" step="0.01" /></label>
          {formMessage ? <div className="muted">{formMessage}</div> : null}
          <button className="btn primary" type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "A guardar..." : "Guardar"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h3>Lista de Faturas</h3>
        <div className="list">
          {(data ?? []).map((item) => (
            <button key={String(item.id_fatura)} className="list-row" onClick={() => navigate(`/faturas/${String(item.id_fatura)}`)}>
              <div className="mono">{String(item.id_fatura)}</div>
              <div>{String(item.fornecedor)}</div>
              <div className="muted">{String(item.nr_documento)}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
