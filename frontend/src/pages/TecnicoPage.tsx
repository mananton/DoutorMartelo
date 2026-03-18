import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function TecnicoPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const stockQuery = useQuery({ queryKey: ["stock-list"], queryFn: api.listStockSnapshots });
  const movimentosQuery = useQuery({ queryKey: ["movimentos"], queryFn: api.listMovimentos });

  const stockRows = (stockQuery.data ?? []).filter((item) => {
    const term = normalize(deferredSearch);
    if (!term) return true;
    return [item.id_item, item.item_oficial, item.unidade].some((value) => normalize(String(value ?? "")).includes(term));
  });

  const movimentoRows = (movimentosQuery.data ?? []).filter((item) => {
    const term = normalize(deferredSearch);
    if (!term) return true;
    return [item.id_item, item.item_oficial, item.obra, item.fase, item.source_id, item.tipo].some((value) => normalize(String(value ?? "")).includes(term));
  });

  return (
    <div className="grid">
      <section className="panel">
        <div className="row-head">
          <div>
            <h3 style={{ marginBottom: "0.25rem" }}>Tecnico</h3>
            <div className="muted">Visao read-only de `STOCK_ATUAL` e `MATERIAIS_MOV` para validacao operacional.</div>
          </div>
          <label style={{ minWidth: "18rem" }}>
            Pesquisa
            <input placeholder="ID, item oficial, obra, fase..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
        </div>
      </section>

      <div className="grid two">
        <section className="panel">
          <h3>Stock Atual</h3>
          <div className="list">
            {stockRows.map((item) => (
              <div className="list-row" key={String(item.id_item)}>
                <div className="row-head">
                  <div className="mono">{String(item.id_item)}</div>
                  <span className={`tag ${Number(item.stock_atual ?? 0) > 0 ? "tag-success" : ""}`}>{String(item.stock_atual ?? 0)}</span>
                </div>
                <div>{String(item.item_oficial ?? "-")}</div>
                <div className="muted">{String(item.unidade ?? "-")} | custo medio {String(item.custo_medio_atual ?? 0)}</div>
              </div>
            ))}
            {!stockRows.length ? <div className="empty-note">Sem linhas de stock para a pesquisa atual.</div> : null}
          </div>
        </section>

        <section className="panel">
          <h3>Materiais Mov</h3>
          <div className="list">
            {movimentoRows.map((item) => (
              <div className="list-row" key={String(item.id_mov)}>
                <div className="row-head">
                  <div className="mono">{String(item.id_mov)}</div>
                  <span className={`tag ${String(item.tipo) === "ENTRADA" ? "tag-success" : ""}`}>{String(item.tipo)}</span>
                </div>
                <div>{String(item.item_oficial ?? item.id_item)} | {String(item.quantidade ?? 0)} {String(item.unidade ?? "")}</div>
                <div className="muted">{String(item.obra ?? "-")} / {String(item.fase ?? "-")} | source {String(item.source_type ?? "-")}:{String(item.source_id ?? "-")}</div>
              </div>
            ))}
            {!movimentoRows.length ? <div className="empty-note">Sem movimentos para a pesquisa atual.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
