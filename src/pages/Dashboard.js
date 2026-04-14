import React, { useEffect, useState } from "react";
import api from "../services/api";
import "../styles/Dashboard.css";

function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/dashboard/summary")
      .then((res) => setSummary(res.data))
      .catch((err) => console.error("Failed to load summary:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="dashboard">
      <h2>Overview</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Today's Sales</span>
          <span className="stat-value">${summary?.today_sales ?? "0.00"}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Orders</span>
          <span className="stat-value">{summary?.total_orders ?? 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Products</span>
          <span className="stat-value">{summary?.total_products ?? 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Avg. Order</span>
          <span className="stat-value">${summary?.avg_order_value ?? "0.00"}</span>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
