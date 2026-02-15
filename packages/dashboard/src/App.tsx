import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import ProtectedRoute from "./components/ProtectedRoute.js";
import Layout from "./components/Layout.js";
import LoginPage from "./pages/LoginPage.js";
import RegisterPage from "./pages/RegisterPage.js";
import DashboardPage from "./pages/DashboardPage.js";
import AgentsPage from "./pages/AgentsPage.js";
import AgentDetailPage from "./pages/AgentDetailPage.js";
import ActivityPage from "./pages/ActivityPage.js";
import ApprovalsPage from "./pages/ApprovalsPage.js";
import SettingsPage from "./pages/SettingsPage.js";
import SolveCaptchaPage from "./pages/SolveCaptchaPage.js";
import { useEffect } from "react";
import { apiClient } from "./api/client.js";

function AuthRoutes() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return null;
}

function AppContent() {
  const { token, logout } = useAuth();

  // Set token in API client and handle 401 responses
  useEffect(() => {
    apiClient.setToken(token);
    apiClient.setOnUnauthorized(() => {
      logout();
    });
  }, [token, logout]);

  return (
    <Routes>
      {/* Auth Routes */}
      <Route path="/login" element={
        <>
          <AuthRoutes />
          <LoginPage />
        </>
      } />
      <Route path="/register" element={
        <>
          <AuthRoutes />
          <RegisterPage />
        </>
      } />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/:id" element={<AgentDetailPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/solve/:id" element={<SolveCaptchaPage />} />
        </Route>
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
