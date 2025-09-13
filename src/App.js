import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import Exercises from './components/Exercises';
import Statistics from './components/Statistics';
import Settings from './components/Settings';

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [appState, setAppState] = useState({
    isMonitoring: false,
    timeRemaining: 30 * 60, // 30 minutes in seconds
    currentPosture: 'good',
    timerRunning: false,
    settings: {
      breakInterval: 30,
      soundNotifications: true,
      desktopNotifications: true,
      sensitivity: 7,
      autoCalibrate: true,
      theme: 'light',
      minimizeToTray: true
    }
  });

  const exercises = [
    {
      id: 1,
      title: "Neck Stretch",
      category: "neck",
      duration: 30,
      description: "Gently tilt your head to the right, bringing your ear towards your shoulder. Hold for 15 seconds, then repeat on the left side."
    },
    {
      id: 2,
      title: "Shoulder Rolls",
      category: "neck",
      duration: 20,
      description: "Roll your shoulders backwards in a circular motion. Do 10 rolls backwards, then 10 rolls forwards."
    },
    {
      id: 3,
      title: "Cat-Cow Stretch",
      category: "back",
      duration: 45,
      description: "While seated, arch your back and look up (cow), then round your spine and tuck your chin (cat). Repeat slowly."
    },
    {
      id: 4,
      title: "Seated Spinal Twist",
      category: "back",
      duration: 30,
      description: "Sit up straight, place your right hand on your left knee, and gently twist your torso to the left. Hold, then repeat on the other side."
    },
    {
      id: 5,
      title: "Quick Desk Stretch",
      category: "quick",
      duration: 60,
      description: "Stand up, reach your arms overhead, take a deep breath, and do 5 gentle side bends in each direction."
    },
    {
      id: 6,
      title: "Eye Relief",
      category: "quick",
      duration: 30,
      description: "Look away from your screen. Focus on something 20 feet away for 20 seconds. Blink slowly 10 times."
    }
  ];

  const updateAppState = (updates) => {
    setAppState(prev => ({ ...prev, ...updates }));
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'exercises', label: 'Exercises' },
    { id: 'statistics', label: 'Statistics' },
    { id: 'settings', label: 'Settings' }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard appState={appState} updateAppState={updateAppState} />;
      case 'exercises':
        return <Exercises exercises={exercises} />;
      case 'statistics':
        return <Statistics />;
      case 'settings':
        return <Settings appState={appState} updateAppState={updateAppState} />;
      default:
        return <Dashboard appState={appState} updateAppState={updateAppState} />;
    }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="nav-container">
          <div className="logo">
            <h1>🧘‍♀️ Motionify</h1>
            <span className="tagline">Your Posture Guardian</span>
          </div>
          <nav className="nav-tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {renderTabContent()}
      </main>
    </div>
  );
};

export default App;
