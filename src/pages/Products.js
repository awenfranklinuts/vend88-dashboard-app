import React, { useEffect, useState } from "react";
import api from "../services/api";
import "../styles/Products.css";

function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/products")
      .then((res) => setProducts(res.data))
      .catch((err) => console.error("Failed to load products:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="products-page">
      <h2>Products</h2>
      {products.length === 0 ? (
        <p className="empty-state">No products found.</p>
      ) : (
        <ul className="product-list">
          {products.map((product) => (
            <li key={product.id} className="product-item">
              <div className="product-info">
                <span className="product-name">{product.name}</span>
                <span className="product-category">{product.category}</span>
              </div>
              <span className="product-price">${product.price}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Products;
