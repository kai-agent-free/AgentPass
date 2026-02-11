import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.js";
import DashboardPage from "./pages/DashboardPage.js";
import AgentsPage from "./pages/AgentsPage.js";
import AgentDetailPage from "./pages/AgentDetailPage.js";
import ActivityPage from "./pages/ActivityPage.js";
import ApprovalsPage from "./pages/ApprovalsPage.js";
import SettingsPage from "./pages/SettingsPage.js";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/:id" element={<AgentDetailPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
