import React from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Settings.css";

function Settings() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    navigate("/login");
  };

  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <div className="settings-list">
        <div className="settings-item">
          <span>Store Name</span>
          <span className="settings-value">VEND88</span>
        </div>
        <div className="settings-item">
          <span>API Status</span>
          <span className="settings-value status-ok">Connected</span>
        </div>
        <div className="settings-item">
          <span>Version</span>
          <span className="settings-value">0.1.0</span>
        </div>
      </div>

      <button className="logout-button" onClick={handleLogout}>
        Sign Out
      </button>
    </div>
  );
}

export default Settings;
