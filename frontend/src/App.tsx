import { NavLink, Route, Routes } from "react-router-dom";

import { AfetacoesPage } from "./pages/AfetacoesPage";
import { CatalogoPage } from "./pages/CatalogoPage";
import { FaturaDetailPage } from "./pages/FaturaDetailPage";
import { FaturasPage } from "./pages/FaturasPage";
import { SyncPage } from "./pages/SyncPage";

export function App() {
  return (
    <div className="shell">
      <aside className="nav">
        <h1>materials.backoffice</h1>
        <NavLink to="/faturas">Faturas</NavLink>
        <NavLink to="/catalogo">Catalogo</NavLink>
        <NavLink to="/afetacoes">Afetacoes</NavLink>
        <NavLink to="/sync">Sincronizacao</NavLink>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <div className="mono muted">Ambiente interno</div>
            <h2 style={{ margin: "0.2rem 0 0" }}>Materials Backoffice MVP</h2>
          </div>
          <div className="panel" style={{ minWidth: "18rem" }}>
            <div className="mono muted">Input explicito</div>
            <div>Guardar, Adicionar linha, Processar, Reenviar pendentes</div>
          </div>
        </div>
        <Routes>
          <Route path="/" element={<FaturasPage />} />
          <Route path="/faturas" element={<FaturasPage />} />
          <Route path="/faturas/:idFatura" element={<FaturaDetailPage />} />
          <Route path="/catalogo" element={<CatalogoPage />} />
          <Route path="/afetacoes" element={<AfetacoesPage />} />
          <Route path="/sync" element={<SyncPage />} />
        </Routes>
      </main>
    </div>
  );
}

