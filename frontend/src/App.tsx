import { useQuery } from "@tanstack/react-query";
import { NavLink, Route, Routes } from "react-router-dom";

import { api } from "./lib/api";
import { AfetacoesPage } from "./pages/AfetacoesPage";
import { CatalogoPage } from "./pages/CatalogoPage";
import { FaturaDetailPage } from "./pages/FaturaDetailPage";
import { FaturasPage } from "./pages/FaturasPage";
import { SyncPage } from "./pages/SyncPage";
import { TecnicoPage } from "./pages/TecnicoPage";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sem reload manual ainda";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function App() {
  const syncStatus = useQuery({ queryKey: ["sync-status"], queryFn: api.getSyncStatus });
  const lastReloadAt = String(syncStatus.data?.last_reload_at ?? "");
  const lastReloadSource = String(syncStatus.data?.last_reload_source ?? "");

  return (
    <div className="shell">
      <aside className="nav">
        <h1>materials.backoffice</h1>
        <NavLink to="/faturas">Faturas</NavLink>
        <NavLink to="/catalogo">Catalogo</NavLink>
        <NavLink to="/afetacoes">Afetacoes</NavLink>
        <NavLink to="/tecnico">Tecnico</NavLink>
        <NavLink to="/sync">Sincronizacao</NavLink>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <div className="mono muted">Ambiente interno</div>
            <h2 style={{ margin: "0.2rem 0 0" }}>Materials Backoffice MVP</h2>
            <div className="muted">Edicoes manuais feitas na Google Sheet so entram na app depois de `Recarregar do Sheets`.</div>
          </div>
          <div className="panel topbar-panel">
            <div className="mono muted">Estado misto app + Sheets</div>
            <div>Ultimo reload: {formatDateTime(lastReloadAt)}</div>
            <div className="muted">{lastReloadSource ? `Origem: ${lastReloadSource}` : "Usa Sincronizacao para refletir edicoes externas."}</div>
          </div>
        </div>
        <Routes>
          <Route path="/" element={<FaturasPage />} />
          <Route path="/faturas" element={<FaturasPage />} />
          <Route path="/faturas/:idFatura" element={<FaturaDetailPage />} />
          <Route path="/catalogo" element={<CatalogoPage />} />
          <Route path="/afetacoes" element={<AfetacoesPage />} />
          <Route path="/tecnico" element={<TecnicoPage />} />
          <Route path="/sync" element={<SyncPage />} />
        </Routes>
      </main>
    </div>
  );
}
