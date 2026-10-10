import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Shell } from "./components/Shell";
import { TourCard, TourRoute } from "./components/Tour";
import { CaregiverAppPage } from "./pages/CaregiverApp";
import { ContinuityPage, ReplanPage } from "./pages/Continuity";
import { DashboardPage } from "./pages/Dashboard";
import { HowItWorksPage } from "./pages/HowItWorks";
import { LandingPage } from "./pages/Landing";
import { MatchPage } from "./pages/Match";
import { MessagesPage } from "./pages/Messages";
import { PresentPage } from "./pages/Present";
import { RequestEditorPage, RequestsListPage } from "./pages/Requests";
import { VerifyPage } from "./pages/Verify";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { if (!window.location.hash) window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* The story: a long-scroll landing page, and the same story as slides. */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/present" element={<PresentPage />} />
        <Route path="/tour/:n" element={<TourRoute />} />
        {/* The caregiver's phone app has no coordinator menu. */}
        <Route path="/caregiver/:id" element={<CaregiverAppPage />} />
        <Route path="*" element={<CoordinatorApp />} />
      </Routes>
      <TourCard />
    </>
  );
}

function CoordinatorApp() {
  return (
    <Shell>
      <Routes>
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/requests" element={<RequestsListPage />} />
        <Route path="/requests/new" element={<RequestEditorPage />} />
        <Route path="/requests/:id" element={<RequestEditorPage />} />
        <Route path="/requests/:id/match" element={<MatchPage />} />
        <Route path="/continuity" element={<ContinuityPage />} />
        <Route path="/continuity/:id" element={<ReplanPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Shell>
  );
}
