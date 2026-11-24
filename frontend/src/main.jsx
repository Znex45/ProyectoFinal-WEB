import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { Layout } from "./components/Layout.jsx";
import { ProtectedRoute, PublicOnlyRoute, AdminRoute } from "./components/ProtectedRoute.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { InventarioPage } from "./pages/InventarioPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { NotFoundPage } from "./pages/NotFoundPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import { SolicitarPrestamoPage } from "./pages/SolicitarPrestamoPage.jsx";
import { MisSolicitudesPage } from "./pages/MisSolicitudesPage.jsx";
import { AdminSolicitudesPage } from "./pages/AdminSolicitudesPage.jsx";
import "./styles/main.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            {/* Públicas */}
            <Route path="/" element={<HomePage />} />
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/registro" element={<RegisterPage />} />
            </Route>

            {/* Privadas */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/inventario" element={<InventarioPage />} />
              <Route path="/solicitar" element={<SolicitarPrestamoPage />} />
              <Route path="/mis-solicitudes" element={<MisSolicitudesPage />} />
              <Route element={<AdminRoute />}>
                <Route path="/admin/solicitudes" element={<AdminSolicitudesPage />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
