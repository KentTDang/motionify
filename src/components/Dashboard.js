import React, { useState, useEffect } from 'react';

const Dashboard = ({ appState, updateAppState }) => {
  const [showNotification, setShowNotification] = useState(false);
  const [postureStatus, setPostureStatus] = useState({
    status: 'good',
    confidence: 85,
    icon: '😊',
    text: 'Good Posture',
    color: '#48bb78'
  });

  // Mock camera feed component
  const CameraFeed = () => (
    <div className="camera-container">
      <div className="camera-mockup">
        <div className="camera-placeholder">
          <div className="webcam-simulation">
            <div className="person-outline">
              <div className="head"></div>
              <div className="shoulders"></div>
              <div className="spine"></div>
            </div>
          </div>
        </div>
        <div className="camera-overlay">
          <div className="posture-indicator">
            <div className="indicator-icon">
              {appState.isMonitoring ? '👀' : '📷'}
            </div>
            <div className="indicator-text">
              {appState.isMonitoring ? 'Monitoring Active' : 'Camera Ready'}
            </div>
          </div>
        </div>
      </div>
      <div className="camera-controls">
        <button
          className={`btn ${appState.isMonitoring ? 'btn-warning' : 'btn-primary'}`}
          onClick={() => updateAppState({ isMonitoring: !appState.isMonitoring })}
        >
          {appState.isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
        </button>
        <button className="btn btn-secondary">
          Calibrate Good Posture
        </button>
      </div>
    </div>
  );

  // Timer component
  const Timer = () => {
    const minutes = Math.floor(appState.timeRemaining / 60);
    const seconds = appState.timeRemaining % 60;

    const startTimer = () => {
      updateAppState({ timerRunning: true });
    };

    const pauseTimer = () => {
      updateAppState({ timerRunning: false });
    };

    const resetTimer = () => {
      updateAppState({ 
        timerRunning: false, 
        timeRemaining: appState.settings.breakInterval * 60 
      });
    };

    return (
      <div className="timer-content">
        <div className="timer-display">
          <span>{minutes.toString().padStart(2, '0')}</span>:
          <span>{seconds.toString().padStart(2, '0')}</span>
        </div>
        <div className="timer-controls">
          <button 
            className="btn btn-success btn-small"
            onClick={startTimer}
            disabled={appState.timerRunning}
          >
            Start Session
          </button>
          <button 
            className="btn btn-warning btn-small"
            onClick={pauseTimer}
            disabled={!appState.timerRunning}
          >
            Pause
          </button>
          <button 
            className="btn btn-secondary btn-small"
            onClick={resetTimer}
          >
            Reset
          </button>
        </div>
      </div>
    );
  };

  // Posture status component
  const PostureStatus = () => (
    <div className="posture-content">
      <div className="status-indicator">
        <div className="status-icon">{postureStatus.icon}</div>
        <div className="status-text" style={{ color: postureStatus.color }}>
          {postureStatus.text}
        </div>
        <div className="confidence-bar">
          <div 
            className="confidence-fill" 
            style={{ 
              width: `${postureStatus.confidence}%`, 
              background: postureStatus.color 
            }}
          ></div>
        </div>
        <span className="confidence-text">{postureStatus.confidence}% Confidence</span>
      </div>
    </div>
  );

  // Quick stats component
  const QuickStats = () => (
    <div className="summary-content">
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-value">7.2h</span>
          <span className="stat-label">Good Posture</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">12</span>
          <span className="stat-label">Breaks Taken</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">3</span>
          <span className="stat-label">Poor Posture Alerts</span>
        </div>
      </div>
    </div>
  );

  // Notification banner component
  const NotificationBanner = () => (
    <div className={`notification-banner ${!showNotification ? 'hidden' : ''}`}>
      <div className="notification-content">
        <div className="notification-icon">⚠️</div>
        <div className="notification-text">
          <h4>Time for a Break!</h4>
          <p>You've been sitting for 30 minutes. Stand up and stretch!</p>
        </div>
        <div className="notification-actions">
          <button className="btn btn-primary">Start Exercises</button>
          <button className="btn btn-secondary">Snooze (5 min)</button>
          <button 
            className="btn btn-text"
            onClick={() => setShowNotification(false)}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );

  // Simulate posture changes for demo
  useEffect(() => {
    if (appState.isMonitoring) {
      const interval = setInterval(() => {
        const statuses = [
          { status: 'good', icon: '😊', text: 'Good Posture', color: '#48bb78' },
          { status: 'warning', icon: '😐', text: 'Posture Warning', color: '#ed8936' },
          { status: 'poor', icon: '😟', text: 'Poor Posture', color: '#e53e3e' }
        ];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        const confidence = Math.floor(Math.random() * 20) + 80; // 80-100%
        
        setPostureStatus({
          ...randomStatus,
          confidence
        });

        // Show notification for poor posture
        if (randomStatus.status === 'poor') {
          setTimeout(() => setShowNotification(true), 1000);
        }
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [appState.isMonitoring]);

  // Timer countdown effect
  useEffect(() => {
    let interval = null;
    if (appState.timerRunning && appState.timeRemaining > 0) {
      interval = setInterval(() => {
        updateAppState({ timeRemaining: appState.timeRemaining - 1 });
      }, 1000);
    } else if (appState.timeRemaining === 0) {
      setShowNotification(true);
      updateAppState({ timerRunning: false });
    }
    return () => clearInterval(interval);
  }, [appState.timerRunning, appState.timeRemaining, updateAppState]);

  return (
    <section className="tab-content active">
      {/* Full-width camera section */}
      <div className="camera-section-full">
        <CameraFeed />
      </div>

      {/* Three sections below camera */}
      <div className="dashboard-info-grid">
        <div className="next-break-section">
          <h3>Next Break</h3>
          <Timer />
        </div>
        
        <div className="current-posture-section">
          <h3>Current Posture</h3>
          <PostureStatus />
        </div>
        
        <div className="todays-summary-section">
          <h3>Today's Summary</h3>
          <QuickStats />
        </div>
      </div>

      {/* Notification Banner */}
      <NotificationBanner />
    </section>
  );
};

export default Dashboard;
