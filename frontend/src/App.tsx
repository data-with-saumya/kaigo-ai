import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Shell } from "./components/Shell";
import { scrollToTop, startSmoothScroll } from "./lib/motion";
import { CaregiverAppPage } from "./pages/CaregiverApp";
import { ChangesPage, ContinuityPage, ReplanPage } from "./pages/Continuity";
import { DashboardPage } from "./pages/Dashboard";
import { GuideNote, GuidePage, RolePage, TourRedirect } from "./pages/Guide";
import { HowItWorksPage } from "./pages/HowItWorks";
import { LandingPage } from "./pages/Landing";
import { MatchPage } from "./pages/Match";
import { MessagesPage } from "./pages/Messages";
import { PresentPage } from "./pages/Present";
import { RequestEditorPage, RequestsListPage } from "./pages/Requests";
import { DocumentsPage, VerifyPage } from "./pages/Verify";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { startSmoothScroll(); }, []);
  useEffect(() => { if (!window.location.hash) scrollToTop(); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* The website and the same story as slides. */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/present" element={<PresentPage />} />
        <Route path="/tour/:n" element={<TourRedirect />} />
        {/* The caregiver's phone app has no tabs, only Back. */}
        <Route path="/caregiver/:id" element={<CaregiverAppPage />} />
        <Route path="*" element={<AppPages />} />
      </Routes>
      <GuideNote />
    </>
  );
}

function AppPages() {
  return (
    <Shell>
      <Routes>
        {/* One tab per audience, and a guide page for each thing KaigoAI does for them. */}
        <Route path="/for/:role" element={<RolePage />} />
        <Route path="/for/:role/:fn" element={<GuidePage />} />
        {/* The real screens the guides open. */}
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/requests" element={<RequestsListPage />} />
        <Route path="/requests/new" element={<RequestEditorPage />} />
        <Route path="/requests/:id" element={<RequestEditorPage />} />
        <Route path="/requests/:id/match" element={<MatchPage />} />
        <Route path="/continuity" element={<ContinuityPage />} />
        <Route path="/continuity/:id" element={<ReplanPage />} />
        <Route path="/changes" element={<ChangesPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/learn" element={<Navigate to="/for/coordinator" replace />} />
        <Route path="*" element={<Navigate to="/for/coordinator" replace />} />
      </Routes>
    </Shell>
  );
}
