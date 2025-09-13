import React, { useState } from 'react';

const Settings = ({ appState, updateAppState }) => {
  const [tempSettings, setTempSettings] = useState({ ...appState.settings });
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);

  const handleSettingChange = (key, value) => {
    setTempSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const saveSettings = () => {
    updateAppState({
      settings: { ...tempSettings }
    });
    setShowSaveConfirmation(true);
    setTimeout(() => setShowSaveConfirmation(false), 3000);
  };

  const resetSettings = () => {
    const defaultSettings = {
      breakInterval: 30,
      soundNotifications: true,
      desktopNotifications: true,
      sensitivity: 7,
      autoCalibrate: true,
      theme: 'light',
      minimizeToTray: true
    };
    setTempSettings(defaultSettings);
  };

  const SettingItem = ({ label, children, description }) => (
    <div className="setting-item">
      <div className="setting-info">
        <label>{label}</label>
        {description && <p className="setting-description">{description}</p>}
      </div>
      <div className="setting-control">
        {children}
      </div>
    </div>
  );

  const ToggleSwitch = ({ checked, onChange }) => (
    <div className={`toggle-switch ${checked ? 'checked' : ''}`} onClick={() => onChange(!checked)}>
      <div className="toggle-slider"></div>
    </div>
  );

  const RangeSlider = ({ value, onChange, min = 1, max = 10, step = 1 }) => (
    <div className="range-container">
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step}
        value={value} 
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="range-slider"
      />
      <span className="range-value">{value}</span>
    </div>
  );

  return (
    <section className="tab-content active">
      <div className="settings-container">
        <div className="settings-header">
          <h2>Settings</h2>
          <p>Customize your posture monitoring experience</p>
        </div>
        
        <div className="settings-groups">
          {/* Notifications Group */}
          <div className="settings-group">
            <h3>
              <span className="group-icon">🔔</span>
              Notifications
            </h3>
            <div className="settings-list">
              <SettingItem 
                label="Break Reminder Interval"
                description="How often you'll be reminded to take a break"
              >
                <select 
                  value={tempSettings.breakInterval}
                  onChange={(e) => handleSettingChange('breakInterval', parseInt(e.target.value))}
                  className="setting-select"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                </select>
              </SettingItem>

              <SettingItem 
                label="Sound Notifications"
                description="Play sound when notifications appear"
              >
                <ToggleSwitch 
                  checked={tempSettings.soundNotifications}
                  onChange={(value) => handleSettingChange('soundNotifications', value)}
                />
              </SettingItem>

              <SettingItem 
                label="Desktop Notifications"
                description="Show system notifications outside the app"
              >
                <ToggleSwitch 
                  checked={tempSettings.desktopNotifications}
                  onChange={(value) => handleSettingChange('desktopNotifications', value)}
                />
              </SettingItem>
            </div>
          </div>

          {/* Posture Detection Group */}
          <div className="settings-group">
            <h3>
              <span className="group-icon">🎯</span>
              Posture Detection
            </h3>
            <div className="settings-list">
              <SettingItem 
                label="Detection Sensitivity"
                description="Higher values detect smaller posture changes"
              >
                <RangeSlider 
                  value={tempSettings.sensitivity}
                  onChange={(value) => handleSettingChange('sensitivity', value)}
                  min={1}
                  max={10}
                />
              </SettingItem>

              <SettingItem 
                label="Auto-calibrate Good Posture"
                description="Automatically learn your good posture over time"
              >
                <ToggleSwitch 
                  checked={tempSettings.autoCalibrate}
                  onChange={(value) => handleSettingChange('autoCalibrate', value)}
                />
              </SettingItem>

              <SettingItem 
                label="Posture Check Frequency"
                description="How often to analyze your posture"
              >
                <select 
                  value={tempSettings.checkFrequency || 'medium'}
                  onChange={(e) => handleSettingChange('checkFrequency', e.target.value)}
                  className="setting-select"
                >
                  <option value="low">Every 10 seconds</option>
                  <option value="medium">Every 5 seconds</option>
                  <option value="high">Every 2 seconds</option>
                  <option value="realtime">Real-time</option>
                </select>
              </SettingItem>
            </div>
          </div>

          {/* Display & Interface Group */}
          <div className="settings-group">
            <h3>
              <span className="group-icon">🎨</span>
              Display & Interface
            </h3>
            <div className="settings-list">
              <SettingItem 
                label="Theme"
                description="Choose your preferred color scheme"
              >
                <select 
                  value={tempSettings.theme}
                  onChange={(e) => handleSettingChange('theme', e.target.value)}
                  className="setting-select"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">Auto (System)</option>
                </select>
              </SettingItem>

              <SettingItem 
                label="Minimize to System Tray"
                description="Keep app running in background when closed"
              >
                <ToggleSwitch 
                  checked={tempSettings.minimizeToTray}
                  onChange={(value) => handleSettingChange('minimizeToTray', value)}
                />
              </SettingItem>

              <SettingItem 
                label="Camera Preview Size"
                description="Adjust the size of the camera preview"
              >
                <select 
                  value={tempSettings.cameraSize || 'medium'}
                  onChange={(e) => handleSettingChange('cameraSize', e.target.value)}
                  className="setting-select"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </SettingItem>
            </div>
          </div>

          {/* Privacy & Data Group */}
          <div className="settings-group">
            <h3>
              <span className="group-icon">🔒</span>
              Privacy & Data
            </h3>
            <div className="settings-list">
              <SettingItem 
                label="Save Session Data"
                description="Store posture statistics for analysis"
              >
                <ToggleSwitch 
                  checked={tempSettings.saveData !== false}
                  onChange={(value) => handleSettingChange('saveData', value)}
                />
              </SettingItem>

              <SettingItem 
                label="Anonymous Usage Analytics"
                description="Help improve the app with anonymous data"
              >
                <ToggleSwitch 
                  checked={tempSettings.analytics || false}
                  onChange={(value) => handleSettingChange('analytics', value)}
                />
              </SettingItem>

              <SettingItem 
                label="Export Data"
                description="Download your posture data"
              >
                <button className="btn btn-secondary btn-small">
                  Export CSV
                </button>
              </SettingItem>
            </div>
          </div>

          {/* Advanced Group */}
          <div className="settings-group">
            <h3>
              <span className="group-icon">⚙️</span>
              Advanced
            </h3>
            <div className="settings-list">
              <SettingItem 
                label="Camera Device"
                description="Select which camera to use"
              >
                <select 
                  value={tempSettings.cameraDevice || 'default'}
                  onChange={(e) => handleSettingChange('cameraDevice', e.target.value)}
                  className="setting-select"
                >
                  <option value="default">Default Camera</option>
                  <option value="front">Front Camera</option>
                  <option value="back">Back Camera</option>
                  <option value="external">External Camera</option>
                </select>
              </SettingItem>

              <SettingItem 
                label="Reset All Data"
                description="Clear all stored statistics and settings"
              >
                <button className="btn btn-danger btn-small">
                  Clear All Data
                </button>
              </SettingItem>

              <SettingItem 
                label="Debug Mode"
                description="Show additional debugging information"
              >
                <ToggleSwitch 
                  checked={tempSettings.debugMode || false}
                  onChange={(value) => handleSettingChange('debugMode', value)}
                />
              </SettingItem>
            </div>
          </div>
        </div>

        {/* Save Actions */}
        <div className="settings-actions">
          <button 
            className="btn btn-primary"
            onClick={saveSettings}
          >
            Save Settings
          </button>
          <button 
            className="btn btn-secondary"
            onClick={resetSettings}
          >
            Reset to Defaults
          </button>
        </div>

        {/* Save Confirmation */}
        {showSaveConfirmation && (
          <div className="save-confirmation">
            <div className="confirmation-content">
              <span className="confirmation-icon">✅</span>
              <span>Settings saved successfully!</span>
            </div>
          </div>
        )}

        {/* App Info */}
        <div className="app-info">
          <h3>About Motionify</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Version</span>
              <span className="info-value">1.0.0</span>
            </div>
            <div className="info-item">
              <span className="info-label">Build</span>
              <span className="info-value">2025.09.13</span>
            </div>
            <div className="info-item">
              <span className="info-label">Platform</span>
              <span className="info-value">Web</span>
            </div>
          </div>
          <p>Made with ❤️ for HopHacks 2025 by Kent, Pearce, and Chaoping</p>
        </div>
      </div>
    </section>
  );
};

export default Settings;
