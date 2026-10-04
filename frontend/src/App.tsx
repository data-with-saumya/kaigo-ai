import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Shell } from "./components/Shell";
import { ContinuityPage, ReplanPage } from "./pages/Continuity";
import { DashboardPage } from "./pages/Dashboard";
import { HowItWorksPage } from "./pages/HowItWorks";
import { MatchPage } from "./pages/Match";
import { RequestEditorPage, RequestsListPage } from "./pages/Requests";
import { VerifyPage } from "./pages/Verify";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <Shell>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/requests" element={<RequestsListPage />} />
        <Route path="/requests/new" element={<RequestEditorPage />} />
        <Route path="/requests/:id" element={<RequestEditorPage />} />
        <Route path="/requests/:id/match" element={<MatchPage />} />
        <Route path="/continuity" element={<ContinuityPage />} />
        <Route path="/continuity/:id" element={<ReplanPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
