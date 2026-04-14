import React from "react";
import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav";
import "../styles/Layout.css";

function Layout() {
  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>VEND88 Dashboard</h1>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

export default Layout;
