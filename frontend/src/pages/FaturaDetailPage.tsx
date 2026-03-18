import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { api } from "../lib/api";

export function FaturaDetailPage() {
  const { idFatura = "" } = useParams();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ["fatura", idFatura], queryFn: () => api.getFatura(idFatura), enabled: !!idFatura });
  const preview = useMutation({ mutationFn: (payload: Record<string, unknown>) => api.previewItems(idFatura, payload) });
  const createItems = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.createItems(idFatura, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fatura", idFatura] })
  });

  return (
    <div className="grid two">
      <section className="panel">
        <h3>Detalhe da Fatura</h3>
        <pre className="mono muted" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(detail.data?.fatura ?? {}, null, 2)}</pre>
        <h4>Itens</h4>
        <div className="list">
          {((detail.data?.items as Record<string, unknown>[] | undefined) ?? []).map((item) => (
            <div className="list-row" key={String(item.id_item_fatura)}>
              <div>{String(item.descricao_original)}</div>
              <div className="muted">{String(item.destino)} · {String(item.item_oficial ?? "")}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Adicionar Itens</h3>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const payload = {
              items: [
                {
                  descricao_original: form.get("descricao_original"),
                  quantidade: Number(form.get("quantidade") || 0),
                  custo_unit: Number(form.get("custo_unit") || 0),
                  iva: Number(form.get("iva") || 0),
                  destino: form.get("destino"),
                  obra: form.get("obra") || null,
                  fase: form.get("fase") || null,
                  id_item: form.get("id_item") || null,
                  item_oficial: form.get("item_oficial") || null,
                  natureza: form.get("natureza") || null,
                  unidade: form.get("unidade") || null
                }
              ]
            };
            createItems.mutate(payload);
          }}
        >
          <label>Descricao Original<input name="descricao_original" required /></label>
          <label>ID_Item existente<input name="id_item" placeholder="Opcional" /></label>
          <label>Item Oficial novo<input name="item_oficial" placeholder="Se nao existir no catalogo" /></label>
          <label>Natureza
            <select name="natureza" defaultValue="">
              <option value="">Selecione</option>
              <option value="MATERIAL">MATERIAL</option>
              <option value="SERVICO">SERVICO</option>
              <option value="ALUGUER">ALUGUER</option>
              <option value="TRANSPORTE">TRANSPORTE</option>
            </select>
          </label>
          <label>Unidade<input name="unidade" placeholder="UN, M2, H..." /></label>
          <label>Quantidade<input name="quantidade" type="number" step="0.01" required /></label>
          <label>Custo Unit<input name="custo_unit" type="number" step="0.0001" required /></label>
          <label>IVA %<input name="iva" type="number" step="0.01" defaultValue="23" /></label>
          <label>Destino
            <select name="destino" defaultValue="STOCK">
              <option value="STOCK">STOCK</option>
              <option value="CONSUMO">CONSUMO</option>
            </select>
          </label>
          <label>Obra<input name="obra" /></label>
          <label>Fase<input name="fase" /></label>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn secondary" type="button" onClick={(event) => {
              const form = new FormData((event.currentTarget.form)!);
              preview.mutate({
                items: [{
                  descricao_original: form.get("descricao_original"),
                  quantidade: Number(form.get("quantidade") || 0),
                  custo_unit: Number(form.get("custo_unit") || 0),
                  iva: Number(form.get("iva") || 0),
                  destino: form.get("destino"),
                  obra: form.get("obra") || null,
                  fase: form.get("fase") || null,
                  id_item: form.get("id_item") || null,
                  item_oficial: form.get("item_oficial") || null,
                  natureza: form.get("natureza") || null,
                  unidade: form.get("unidade") || null
                }]
              });
            }}>Preview impacto</button>
            <button className="btn primary" type="submit">Adicionar linha</button>
          </div>
        </form>
        <pre className="mono muted" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(preview.data ?? createItems.data ?? {}, null, 2)}</pre>
      </section>
    </div>
  );
}

