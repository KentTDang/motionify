import React from "react";

const Header = ({
  activeTab,
  onTabChange,
  onResetStats,
  theme,
  onThemeToggle,
}) => {
  const tabs = [
    { id: "data", label: "DATA" },
    { id: "exercise", label: "EXERCISE" },
  ];

  const styles = getStyles(theme);

  return (
    <div style={styles.header}>
      <div style={styles.headerContent}>
        <h1 style={styles.title}>MOTIONIFY</h1>
        <div style={styles.headerButtons}>
          <button onClick={onThemeToggle} style={styles.themeButton}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button onClick={onResetStats} style={styles.resetButton}>
            RESET
          </button>
        </div>
      </div>

      <div style={styles.tabsContainer}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.activeTab : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const getStyles = (theme) => {
  const isDark = theme === "dark";

  return {
    header: {
      backgroundColor: isDark ? "#0f0f0f" : "#f8f9fa",
      padding: "16px 24px",
      borderBottom: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
    },
    headerContent: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "16px",
    },
    title: {
      margin: 0,
      fontSize: "24px",
      fontWeight: "700",
      color: isDark ? "#e4e4e7" : "#1f2937",
      letterSpacing: "2px",
      fontFamily: "ui-monospace, 'Fira Code', monospace",
    },
    headerButtons: {
      display: "flex",
      gap: "8px",
      alignItems: "center",
    },
    themeButton: {
      padding: "8px 12px",
      backgroundColor: isDark ? "#27272a" : "#e5e7eb",
      color: isDark ? "#e4e4e7" : "#1f2937",
      border: `1px solid ${isDark ? "#3f3f46" : "#d1d5db"}`,
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: "600",
      borderRadius: "4px",
      transition: "all 0.2s ease",
    },
    resetButton: {
      padding: "8px 16px",
      backgroundColor: isDark ? "#27272a" : "#e5e7eb",
      color: isDark ? "#e4e4e7" : "#1f2937",
      border: `1px solid ${isDark ? "#3f3f46" : "#d1d5db"}`,
      cursor: "pointer",
      fontSize: "10px",
      fontWeight: "600",
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      transition: "all 0.2s ease",
    },
    tabsContainer: {
      display: "flex",
      gap: "2px",
    },
    tab: {
      padding: "8px 16px",
      backgroundColor: "transparent",
      color: isDark ? "#71717a" : "#6b7280",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      cursor: "pointer",
      fontSize: "10px",
      fontWeight: "600",
      transition: "all 0.2s ease",
      letterSpacing: "0.5px",
    },
    activeTab: {
      color: isDark ? "#00ff88" : "#10b981",
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
      borderColor: isDark ? "#00ff88" : "#10b981",
    },
  };
};

export default Header;
