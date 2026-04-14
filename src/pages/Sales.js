import React, { useEffect, useState } from "react";
import api from "../services/api";
import "../styles/Sales.css";

function Sales() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/sales")
      .then((res) => setSales(res.data))
      .catch((err) => console.error("Failed to load sales:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="sales-page">
      <h2>Sales</h2>
      {sales.length === 0 ? (
        <p className="empty-state">No sales records yet.</p>
      ) : (
        <ul className="sales-list">
          {sales.map((sale) => (
            <li key={sale.id} className="sale-item">
              <div className="sale-info">
                <span className="sale-id">#{sale.id}</span>
                <span className="sale-date">{sale.date}</span>
              </div>
              <span className="sale-amount">${sale.total}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Sales;
