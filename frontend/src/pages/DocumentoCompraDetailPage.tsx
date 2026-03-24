import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { api } from "../lib/api";
import { FaturaDetailPage } from "./FaturaDetailPage";
import { NotaCreditoDetailPage } from "./NotaCreditoDetailPage";

export function DocumentoCompraDetailPage() {
  const { idFatura = "" } = useParams();
  const detail = useQuery({
    queryKey: ["documento-compra", idFatura],
    queryFn: () => api.getFatura(idFatura),
    enabled: !!idFatura,
  });

  if (detail.isLoading) {
    return (
      <section className="panel">
        <div className="section-kicker">Documento</div>
        <h3>A carregar detalhe...</h3>
      </section>
    );
  }

  if (detail.isError) {
    return (
      <section className="panel">
        <div className="section-kicker">Documento</div>
        <h3>Falha ao carregar o detalhe</h3>
        <div className="status-note">{detail.error instanceof Error ? detail.error.message : "Erro inesperado."}</div>
      </section>
    );
  }

  const tipoDoc = String((detail.data?.fatura as Record<string, unknown> | undefined)?.tipo_doc ?? "FATURA");
  return tipoDoc === "NOTA_CREDITO" ? <NotaCreditoDetailPage /> : <FaturaDetailPage />;
}
