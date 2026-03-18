import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/api";

export function CatalogoPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["catalogo"], queryFn: api.listCatalog });
  const createMutation = useMutation({
    mutationFn: api.createCatalog,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalogo"] })
  });

  return (
    <div className="grid two">
      <section className="panel">
        <h3>Novo Item Oficial</h3>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            createMutation.mutate({
              fornecedor: form.get("fornecedor"),
              descricao_original: form.get("descricao_original"),
              item_oficial: form.get("item_oficial"),
              natureza: form.get("natureza"),
              unidade: form.get("unidade")
            });
          }}
        >
          <label>Fornecedor<input name="fornecedor" required /></label>
          <label>Descricao Original<input name="descricao_original" required /></label>
          <label>Item Oficial<input name="item_oficial" required /></label>
          <label>Natureza
            <select name="natureza" defaultValue="MATERIAL">
              <option value="MATERIAL">MATERIAL</option>
              <option value="SERVICO">SERVICO</option>
              <option value="ALUGUER">ALUGUER</option>
              <option value="TRANSPORTE">TRANSPORTE</option>
            </select>
          </label>
          <label>Unidade<input name="unidade" required /></label>
          <button className="btn primary" type="submit">Guardar</button>
        </form>
      </section>
      <section className="panel">
        <h3>Catalogo</h3>
        <div className="list">
          {(data ?? []).map((item) => (
            <div className="list-row" key={String(item.id_item)}>
              <div className="mono">{String(item.id_item)}</div>
              <div>{String(item.item_oficial)}</div>
              <div className="muted">{String(item.fornecedor)} · {String(item.descricao_original)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

