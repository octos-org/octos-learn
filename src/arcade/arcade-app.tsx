// The Arcade (plan docs/ARCADE_PLAN.md). Standalone phase (decision 18): these
// routes sit outside AuthGuard and make no network request.

import { Navigate, Route, Routes } from "react-router-dom";
import { ArcadeGamesPage, ArcadeHomePage, ArcadeSkillsPage } from "./pages/arcade-pages";
import { ArcadePlayPage } from "./pages/play-page";
import "./arcade.css";

export default function ArcadeApp() {
  return (
    <div className="arcade-root">
      <Routes>
        <Route index element={<ArcadeHomePage />} />
        <Route path="skills" element={<ArcadeSkillsPage />} />
        <Route path="skills/:skill/games" element={<ArcadeGamesPage />} />
        <Route path="play/:skill/:game" element={<ArcadePlayPage />} />
        <Route path="*" element={<Navigate to="/arcade" replace />} />
      </Routes>
    </div>
  );
}
