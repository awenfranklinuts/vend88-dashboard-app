import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Sales from "./pages/Sales";
import Products from "./pages/Products";
import Settings from "./pages/Settings";

// Protected Route Component
function PrivateRoute({ element }) {
  const isAuthenticated = localStorage.getItem("authToken");
  return isAuthenticated ? element : <Navigate to="/login" replace />;
}

function App() {
  const isAuthenticated = localStorage.getItem("authToken");

  return (
    <Routes>
      {/* Login route - always accessible */}
      <Route path="/login" element={<Login />} />
      
      {/* Protected routes - require authentication */}
      <Route path="/" element={<PrivateRoute element={<Layout />} />}>
        <Route index element={<Dashboard />} />
        <Route path="sales" element={<Sales />} />
        <Route path="products" element={<Products />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Redirect to login by default if not authenticated */}
      <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
    </Routes>
  );
}

export default App;
