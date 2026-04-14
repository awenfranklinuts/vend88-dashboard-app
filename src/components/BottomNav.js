import React from "react";
import { NavLink } from "react-router-dom";
import "../styles/BottomNav.css";

function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
        <span className="nav-icon">📊</span>
        <span className="nav-label">Dashboard</span>
      </NavLink>
      <NavLink to="/sales" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
        <span className="nav-icon">💰</span>
        <span className="nav-label">Sales</span>
      </NavLink>
      <NavLink to="/products" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
        <span className="nav-icon">📦</span>
        <span className="nav-label">Products</span>
      </NavLink>
      <NavLink to="/settings" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
        <span className="nav-icon">⚙️</span>
        <span className="nav-label">Settings</span>
      </NavLink>
    </nav>
  );
}

export default BottomNav;
