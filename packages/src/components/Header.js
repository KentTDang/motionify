import React from 'react';

const Header = ({ activeTab, onTabChange, onResetStats }) => {
  const tabs = [
    { id: 'exercise', label: 'Exercise' },
    { id: 'data', label: 'Data' },
    { id: 'settings', label: 'Settings' }
  ];

  return (
    <div style={styles.header}>
      <div style={styles.headerContent}>
        <h1 style={styles.title}>Posture Monitor</h1>
        <button onClick={onResetStats} style={styles.resetButton}>
          Reset Session
        </button>
      </div>
      
      <div style={styles.tabsContainer}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.activeTab : {})
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const styles = {
  header: {
    backgroundColor: "#1F1F1F",
    padding: "20px 32px",
    borderBottom: "1px solid #374151",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)"
  },
  headerContent: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px"
  },
  title: {
    margin: 0,
    fontSize: "32px",
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: "-0.025em"
  },
  resetButton: {
    padding: "10px 20px",
    backgroundColor: "#374151",
    color: "#FFFFFF",
    border: "1px solid #4B5563",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "all 0.2s ease"
  },
  tabsContainer: {
    display: "flex",
    gap: "8px",
    borderBottom: "1px solid #374151",
    paddingBottom: "0"
  },
  tab: {
    padding: "12px 24px",
    backgroundColor: "transparent",
    color: "#9CA3AF",
    border: "none",
    borderRadius: "8px 8px 0 0",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "500",
    transition: "all 0.2s ease",
    borderBottom: "3px solid transparent"
  },
  activeTab: {
    color: "#FFFFFF",
    backgroundColor: "#374151",
    borderBottom: "3px solid #10B981"
  }
};

export default Header;