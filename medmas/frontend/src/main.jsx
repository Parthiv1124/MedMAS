import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Chat from "./pages/Chat.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import DoctorSignup from "./pages/DoctorSignup.jsx";
import DoctorLogin from "./pages/DoctorLogin.jsx";
import DoctorDashboard from "./pages/DoctorDashboard.jsx";
import "./index.css";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("medmas_token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function GuestRoute({ children }) {
  const token = localStorage.getItem("medmas_token");
  if (token) {
    const user = JSON.parse(localStorage.getItem("medmas_user") || "{}");
    if (user.role === "doctor") return <Navigate to="/doctor/dashboard" replace />;
    return <Navigate to="/chat" replace />;
  }
  return children;
}

function DoctorRoute({ children }) {
  const token = localStorage.getItem("medmas_token");
  const doctor = localStorage.getItem("medmas_doctor");
  if (!token || !doctor) return <Navigate to="/doctor/login" replace />;
  return children;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/login"
          element={
            <GuestRoute>
              <Login />
            </GuestRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <GuestRoute>
              <Signup />
            </GuestRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
        {/* Doctor routes */}
        <Route path="/doctor/signup" element={<DoctorSignup />} />
        <Route path="/doctor/login" element={<DoctorLogin />} />
        <Route
          path="/doctor/dashboard"
          element={
            <DoctorRoute>
              <DoctorDashboard />
            </DoctorRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
