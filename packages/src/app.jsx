import React, { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import Header from "./components/Header";

const CHECK_INTERVAL = 1000; // Check every 1 second
const SAMPLES_NEEDED = 30;
const BAD_POSTURE_THRESHOLD = 0.7;

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const samplesRef = useRef([]);
  const sessionStartRef = useRef(Date.now());
  const badPostureStartRef = useRef(null);

  const [status, setStatus] = useState("idle");
  const [err, setErr] = useState("");
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });
  const [postureStatus, setPostureStatus] = useState({ status: 'Good', details: [] });
  const [lastCheckTime, setLastCheckTime] = useState(0);
  const [sessionStats, setSessionStats] = useState({
    totalTime: 0,
    goodPostureTime: 0,
    badPostureTime: 0,
    currentBadPostureDuration: 0,
    longestBadPostureStreak: 0,
    postureBreaks: 0,
    averagePostureScore: 100
  });
  const [realTimeData, setRealTimeData] = useState({
    currentPostureScore: 100,
    trend: 'stable',
    alerts: []
  });

  // New state for tab management and theme
  const [activeTab, setActiveTab] = useState('exercise');
  const [theme, setTheme] = useState('dark');

  // ...existing useEffect and helper functions remain the same...
  useEffect(() => {
    let canceled = false;
    let lastPostureCheck = 0;

    async function init() {
      try {
        setStatus("loading-wasm");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        setStatus("creating-model");
        landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (canceled) return;

        setStatus("starting-camera");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: false,
        });
        streamRef.current = stream;

        const video = videoRef.current;
        video.srcObject = stream;

        await new Promise((resolve, reject) => {
          const to = setTimeout(() => reject(new Error("Video load timeout")), 10000);
          video.onloadedmetadata = () => {
            clearTimeout(to);
            resolve();
          };
        });

        await video.play();

        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        setStageSize({ w: vw, h: vh });
        prepareCanvas(canvasRef.current, vw, vh);

        setStatus("running");

        const tick = () => {
          const lm = landmarkerRef.current;
          const v = videoRef.current;
          const c = canvasRef.current;
          if (!lm || !v || !c) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          const now = performance.now();
          const result = lm.detectForVideo(v, now);
          
          if (now - lastPostureCheck >= CHECK_INTERVAL && result.landmarks?.[0]) {
            const currentPosture = checkPosture(result.landmarks[0]);
            if (currentPosture) {
              updatePostureTracking(currentPosture);
              samplesRef.current.push(currentPosture);
              
              if (samplesRef.current.length > SAMPLES_NEEDED) {
                samplesRef.current.shift();
              }
              
              const averagedStatus = averagePostureStatus(samplesRef.current);
              setPostureStatus(averagedStatus);
              setLastCheckTime(now);
              
              lastPostureCheck = now;
              window.electron?.sendPostureStatus(averagedStatus.status);
            }
          }

          updateSessionStats();
          drawFrame(c, v, result);
          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        console.error(e);
        setErr(e.message || String(e));
        setStatus("error");
      }
    }

    init();

    return () => {
      canceled = true;
      cancelAnimationFrame(rafRef.current);
      try { landmarkerRef.current?.close(); } catch {}
      landmarkerRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const updatePostureTracking = (postureData) => {
    const now = Date.now();
    const isBadPosture = postureData.details.length > 0;
    
    const score = Math.max(0, 100 - postureData.details.reduce((sum, issue) => sum + issue.severity, 0));
    
    setRealTimeData(prev => ({
      ...prev,
      currentPostureScore: Math.round(score),
      trend: score > prev.currentPostureScore ? 'improving' : 
             score < prev.currentPostureScore ? 'declining' : 'stable'
    }));

    if (isBadPosture) {
      if (!badPostureStartRef.current) {
        badPostureStartRef.current = now;
        setSessionStats(prev => ({
          ...prev,
          postureBreaks: prev.postureBreaks + 1
        }));
      }
    } else {
      if (badPostureStartRef.current) {
        const badDuration = now - badPostureStartRef.current;
        setSessionStats(prev => ({
          ...prev,
          longestBadPostureStreak: Math.max(prev.longestBadPostureStreak, badDuration),
          badPostureTime: prev.badPostureTime + badDuration
        }));
        badPostureStartRef.current = null;
      }
    }
  };

  const updateSessionStats = () => {
    const now = Date.now();
    const sessionDuration = now - sessionStartRef.current;
    const currentBadDuration = badPostureStartRef.current ? now - badPostureStartRef.current : 0;
    
    setSessionStats(prev => {
      const goodTime = sessionDuration - (prev.badPostureTime + currentBadDuration);
      
      return {
        ...prev,
        totalTime: sessionDuration,
        goodPostureTime: Math.max(0, goodTime),
        currentBadPostureDuration: currentBadDuration,
        averagePostureScore: Math.round(((goodTime / sessionDuration) * 100) || 100)
      };
    });
  };

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getPostureColor = (score) => {
    if (theme === 'dark') {
      if (score >= 80) return '#10B981';
      if (score >= 60) return '#F59E0B';
      return '#EF4444';
    } else {
      if (score >= 80) return '#059669';
      if (score >= 60) return '#d97706';
      return '#dc2626';
    }
  };

  const resetStats = () => {
    sessionStartRef.current = Date.now();
    badPostureStartRef.current = null;
    setSessionStats({
      totalTime: 0,
      goodPostureTime: 0,
      badPostureTime: 0,
      currentBadPostureDuration: 0,
      longestBadPostureStreak: 0,
      postureBreaks: 0,
      averagePostureScore: 100
    });
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
  };

  const handleThemeToggle = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const styles = getStyles(theme);

  // Render different right panel content based on active tab
  const renderRightPanelContent = () => {
    switch (activeTab) {
      case 'exercise':
        return (
          <>
            {/* Current Status Card */}
            <div style={styles.statusCard}>
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>Current Status</h3>
                <div style={{
                  ...styles.scoreCircle,
                  backgroundColor: getPostureColor(realTimeData.currentPostureScore)
                }}>
                  {realTimeData.currentPostureScore}
                </div>
              </div>
              
              <div style={{
                ...styles.postureStatus,
                borderColor: postureStatus.status === 'Good Posture' ? getPostureColor(100) : getPostureColor(0)
              }}>
                <div style={{
                  color: postureStatus.status === 'Good Posture' ? getPostureColor(100) : getPostureColor(0),
                  fontWeight: 'bold',
                  marginBottom: '8px',
                  fontSize: '16px'
                }}>
                  {postureStatus.status}
                </div>
                
                {sessionStats.currentBadPostureDuration > 0 && (
                  <div style={styles.alert}>
                    ⚠️ Bad posture for: {formatTime(sessionStats.currentBadPostureDuration)}
                  </div>
                )}
              </div>
            </div>

            {/* Current Issues or No Issues */}
            {postureStatus.details.length > 0 ? (
              <div style={styles.issuesCard}>
                <h3 style={styles.cardTitle}>Current Issues</h3>
                {postureStatus.details.map((issue, i) => (
                  <div key={i} style={{
                    ...styles.issueItem,
                    borderLeft: `3px solid ${issue.severity > 5 ? getPostureColor(0) : getPostureColor(60)}`
                  }}>
                    <div style={styles.issueHeader}>
                      <span style={styles.issueType}>{issue.type}</span>
                      <span style={{
                        ...styles.severityBadge,
                        backgroundColor: issue.severity > 5 ? getPostureColor(0) : getPostureColor(60)
                      }}>
                        {Math.round(issue.severity)}/10
                      </span>
                    </div>
                    <div style={styles.issueMessage}>{issue.message}</div>
                    <div style={styles.issueMeasurements}>{issue.measurements}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.noIssuesCard}>
                <div style={styles.noIssuesIcon}>✓</div>
                <h3 style={styles.noIssuesTitle}>Excellent Posture!</h3>
                <p style={styles.noIssuesText}>Keep up the good work. Your posture is looking great.</p>
              </div>
            )}

            {/* Exercise Tips */}
            <div style={styles.exerciseCard}>
              <h3 style={styles.cardTitle}>Posture Exercises</h3>
              <div style={styles.exerciseList}>
                <div style={styles.exerciseItem}>
                  <h4 style={styles.exerciseTitle}>Neck Stretches</h4>
                  <p style={styles.exerciseDescription}>
                    Gently tilt your head to each side, holding for 15-30 seconds.
                  </p>
                </div>
                <div style={styles.exerciseItem}>
                  <h4 style={styles.exerciseTitle}>Shoulder Rolls</h4>
                  <p style={styles.exerciseDescription}>
                    Roll your shoulders backward in slow, controlled circles.
                  </p>
                </div>
                <div style={styles.exerciseItem}>
                  <h4 style={styles.exerciseTitle}>Chin Tucks</h4>
                  <p style={styles.exerciseDescription}>
                    Pull your chin back while lengthening your neck.
                  </p>
                </div>
                <div style={styles.exerciseItem}>
                  <h4 style={styles.exerciseTitle}>Wall Angels</h4>
                  <p style={styles.exerciseDescription}>
                    Stand against a wall and move your arms up and down like making snow angels.
                  </p>
                </div>
              </div>
            </div>
          </>
        );

      case 'data':
        return (
          <>
            {/* Session Statistics */}
            <div style={styles.statsCard}>
              <h3 style={styles.cardTitle}>Session Statistics</h3>
              <div style={styles.statsGrid}>
                <div style={styles.statItem}>
                  <span style={styles.statLabel}>Session Time</span>
                  <span style={styles.statValue}>{formatTime(sessionStats.totalTime)}</span>
                </div>
                <div style={styles.statItem}>
                  <span style={styles.statLabel}>Good Posture</span>
                  <span style={{...styles.statValue, color: getPostureColor(100)}}>
                    {formatTime(sessionStats.goodPostureTime)}
                  </span>
                </div>
                <div style={styles.statItem}>
                  <span style={styles.statLabel}>Bad Posture</span>
                  <span style={{...styles.statValue, color: getPostureColor(0)}}>
                    {formatTime(sessionStats.badPostureTime)}
                  </span>
                </div>
                <div style={styles.statItem}>
                  <span style={styles.statLabel}>Posture Breaks</span>
                  <span style={styles.statValue}>{sessionStats.postureBreaks}</span>
                </div>
                <div style={styles.statItem}>
                  <span style={styles.statLabel}>Longest Bad Streak</span>
                  <span style={styles.statValue}>{formatTime(sessionStats.longestBadPostureStreak)}</span>
                </div>
                <div style={styles.statItem}>
                  <span style={styles.statLabel}>Average Score</span>
                  <span style={{
                    ...styles.statValue,
                    color: getPostureColor(sessionStats.averagePostureScore)
                  }}>
                    {sessionStats.averagePostureScore}%
                  </span>
                </div>
              </div>
            </div>

            {/* Detailed Measurements */}
            {postureStatus.measurements && (
              <div style={styles.measurementsCard}>
                <h3 style={styles.cardTitle}>Detailed Measurements</h3>
                <div style={styles.measurementsGrid}>
                  <div style={styles.measurementItem}>
                    <span style={styles.measurementLabel}>Spine Angle:</span>
                    <span style={styles.measurementValue}>{postureStatus.measurements.spineAngle}°</span>
                  </div>
                  <div style={styles.measurementItem}>
                    <span style={styles.measurementLabel}>Forward Lean:</span>
                    <span style={styles.measurementValue}>{postureStatus.measurements.forwardLean}</span>
                  </div>
                  <div style={styles.measurementItem}>
                    <span style={styles.measurementLabel}>Shoulder Roll:</span>
                    <span style={styles.measurementValue}>{postureStatus.measurements.shoulderRoll}</span>
                  </div>
                  <div style={styles.measurementItem}>
                    <span style={styles.measurementLabel}>Neck Angle:</span>
                    <span style={styles.measurementValue}>{postureStatus.measurements.neckAngle}°</span>
                  </div>
                </div>
              </div>
            )}

            {/* Status Information */}
            <div style={styles.statusInfoCard}>
              <h3 style={styles.cardTitle}>System Status</h3>
              <div style={styles.statusInfo}>
                <div style={styles.statusItem}>
                  <span style={styles.statusLabel}>Camera Status:</span>
                  <span style={{
                    ...styles.statusValue,
                    color: status === 'running' ? getPostureColor(100) : getPostureColor(0)
                  }}>
                    {status}
                  </span>
                </div>
                <div style={styles.statusItem}>
                  <span style={styles.statusLabel}>Last Check:</span>
                  <span style={styles.statusValue}>
                    {lastCheckTime ? `${Math.round((Date.now() - lastCheckTime) / 1000)}s ago` : 'Never'}
                  </span>
                </div>
                {err && (
                  <div style={styles.statusItem}>
                    <span style={styles.statusLabel}>Error:</span>
                    <span style={{...styles.statusValue, color: getPostureColor(0)}}>{err}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        );

      case 'settings':
        return (
          <div style={styles.settingsCard}>
            <h3 style={styles.cardTitle}>Settings</h3>
            <div style={styles.settingsContent}>
              <div style={styles.settingItem}>
                <h4 style={styles.settingTitle}>Theme</h4>
                <p style={styles.settingDescription}>Switch between dark and light mode.</p>
                <div style={styles.settingControl}>
                  <button onClick={handleThemeToggle} style={styles.themeToggleButton}>
                    {theme === 'dark' ? 'Switch to Light Mode ☀️' : 'Switch to Dark Mode 🌙'}
                  </button>
                </div>
              </div>

              <div style={styles.settingItem}>
                <h4 style={styles.settingTitle}>Detection Sensitivity</h4>
                <p style={styles.settingDescription}>Adjust how sensitive the posture detection is.</p>
                <div style={styles.settingControl}>
                  <input type="range" min="0.3" max="0.9" step="0.1" defaultValue="0.7" style={styles.slider} />
                </div>
              </div>
              
              <div style={styles.settingItem}>
                <h4 style={styles.settingTitle}>Check Interval</h4>
                <p style={styles.settingDescription}>How often to check your posture (in seconds).</p>
                <div style={styles.settingControl}>
                  <input type="range" min="1" max="10" step="1" defaultValue="1" style={styles.slider} />
                </div>
              </div>

              <div style={styles.settingItem}>
                <h4 style={styles.settingTitle}>Notifications</h4>
                <p style={styles.settingDescription}>Enable desktop notifications for posture alerts.</p>
                <div style={styles.settingControl}>
                  <label style={styles.toggleSwitch}>
                    <input type="checkbox" defaultChecked style={styles.toggleInput} />
                    <span style={styles.toggleSlider}></span>
                  </label>
                </div>
              </div>

              <div style={styles.settingItem}>
                <h4 style={styles.settingTitle}>Reset Data</h4>
                <p style={styles.settingDescription}>Clear all session data and start fresh.</p>
                <div style={styles.settingControl}>
                  <button onClick={resetStats} style={styles.dangerButton}>
                    Reset All Data
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={styles.page}>
      {/* Header with Tabs */}
      <Header 
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onResetStats={resetStats}
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />

      {/* Status Bar */}
      <div style={styles.statusBar}>
        <span style={styles.status}>
          Status: <strong style={styles.statusText}>{status}</strong>
          {err && <span style={styles.errorText}> • {err}</span>}
        </span>
      </div>

      {/* Main Content - Two Column Layout */}
      <div style={styles.mainContent}>
        {/* Left Side - Camera (Always Visible) */}
        <div style={styles.leftPanel}>
          <div style={styles.videoContainer}>
            <h3 style={styles.sectionTitle}>Camera Feed</h3>
            <div style={{ ...styles.stage, width: stageSize.w * 0.7, height: stageSize.h * 0.7 }}>
              <video ref={videoRef} playsInline muted style={styles.videoHidden} />
              <canvas ref={canvasRef} style={{...styles.canvas, transform: 'scale(0.7)'}} />
            </div>
          </div>
        </div>

        {/* Right Side - Tab Content */}
        <div style={styles.rightPanel}>
          {renderRightPanelContent()}
        </div>
      </div>
    </div>
  );
}

// ...existing helper functions remain the same...
function prepareCanvas(canvas, cssW, cssH) {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawFrame(canvas, video, result) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const vw = video.videoWidth || canvas.width / dpr;
  const vh = video.videoHeight || canvas.height / dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(vw, 0);
  ctx.scale(-1, 1);

  ctx.drawImage(video, 0, 0, vw, vh);

  const landmarks = result?.landmarks?.[0];
  if (landmarks && landmarks.length) {
    drawLandmarksAndSkeleton(ctx, landmarks, vw, vh);
  }

  ctx.restore();
}

function drawLandmarksAndSkeleton(ctx, landmarks, vw, vh) {
  const connections = [
    [11, 12], [11, 23], [12, 24], [23, 24],
    [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
    [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
    [23, 25], [25, 27], [27, 29], [29, 31],
    [24, 26], [26, 28], [28, 30], [30, 32],
  ];

  ctx.lineWidth = 3;
  ctx.strokeStyle = "#10B981";

  connections.forEach(([a, b]) => {
    const A = landmarks[a], B = landmarks[b];
    if (!A || !B) return;
    if ((A.visibility ?? 1) < 0.5 || (B.visibility ?? 1) < 0.5) return;
    const x1 = A.x * vw, y1 = A.y * vh;
    const x2 = B.x * vw, y2 = B.y * vh;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });

  landmarks.forEach((p, i) => {
    if ((p.visibility ?? 1) < 0.5) return;
    const x = p.x * vw, y = p.y * vh;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#F59E0B";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function calculateAngle(a, b, c) {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const cb = { x: b.x - c.x, y: b.y - c.y };
  
  const dot = (ab.x * cb.x + ab.y * cb.y);
  const cross = (ab.x * cb.y - ab.y * cb.x);
  
  const angle = Math.atan2(cross, dot);
  return Math.abs(angle * (180.0 / Math.PI));
}

function checkPosture(landmarks) {
  if (!landmarks?.length) return null;
  
  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftEar = landmarks[7];
  const rightEar = landmarks[8];
  
  const issues = [];
  
  const shoulderMidpoint = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
    z: (leftShoulder.z + rightShoulder.z) / 2
  };
  
  const hipMidpoint = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: (leftHip.z + rightHip.z) / 2
  };
  
  const shoulderHeightDiff = Math.abs(leftShoulder.y - rightShoulder.y);
  if (shoulderHeightDiff > 0.08) {
    issues.push({
      type: 'Uneven Shoulders',
      severity: shoulderHeightDiff * 15,
      message: 'Level your shoulders',
      measurements: `Height difference: ${shoulderHeightDiff.toFixed(3)}`,
    });
  }
  
  const isSlouchingForward = shoulderMidpoint.z - hipMidpoint.z > 0.005;
  if (isSlouchingForward) {
    issues.push({
      type: 'Forward head',
      severity: 8,
      message: 'Straighten your back, pull shoulders back',
      measurements: `Forward lean: ${(shoulderMidpoint.z - hipMidpoint.z).toFixed(3)}`,
    });
  }
  
  const noseToShoulderDist = Math.abs(nose.x - shoulderMidpoint.x);
  const idealNoseToShoulderDist = 0.05;
  
  if (noseToShoulderDist > idealNoseToShoulderDist) {
    issues.push({
      type: 'Slouching',
      severity: ((noseToShoulderDist - idealNoseToShoulderDist) * 15),
      message: 'Chin back slightly',
      measurements: `Head forward by: ${(noseToShoulderDist - idealNoseToShoulderDist).toFixed(3)}`,
    });
  }
  
  const neckTiltAngle = calculateAngle(
    { x: leftEar.x, y: leftEar.y },
    shoulderMidpoint,
    { x: rightEar.x, y: rightEar.y }
  );
  
  if (neckTiltAngle > 35) {
    issues.push({
      type: 'Extreme Neck Tilt',
      severity: (neckTiltAngle - 35) / 10,
      message: 'Try raising your screen height',
      measurements: `Tilt angle: ${neckTiltAngle.toFixed(1)}°`,
    });
  }
  
  const spineAngle = calculateAngle(
    shoulderMidpoint,
    hipMidpoint,
    { x: hipMidpoint.x, y: hipMidpoint.y - 0.5 }
  );
  
  const forwardLean = shoulderMidpoint.z - hipMidpoint.z;
  
  if (spineAngle > 15 || forwardLean > 0.1) {
    issues.push({
      type: 'Slouching/Forward Lean',
      severity: Math.max(spineAngle / 15, forwardLean * 10),
      message: spineAngle > 15 ? 'Straighten your spine' : 'Pull shoulders back',
      measurements: `Spine angle: ${spineAngle.toFixed(1)}°, Forward lean: ${forwardLean.toFixed(3)}`,
    });
  }
  
  const shoulderRoll = (leftShoulder.z + rightShoulder.z) / 2 - hipMidpoint.z;
  if (shoulderRoll > 0.08) {
    issues.push({
      type: 'Rounded Shoulders',
      severity: shoulderRoll * 10,
      message: 'Pull shoulders back and down',
      measurements: `Shoulder roll: ${shoulderRoll.toFixed(3)}`,
    });
  }

  return {
    status: issues.length === 0 ? 'Good Posture' : 'Posture Needs Attention',
    details: issues,
    measurements: {
      spineAngle: spineAngle.toFixed(1),
      forwardLean: forwardLean.toFixed(3),
      shoulderRoll: shoulderRoll.toFixed(3),
      noseToShoulderDistance: noseToShoulderDist.toFixed(3),
      shoulderHeightDiff: shoulderHeightDiff.toFixed(3),
      neckAngle: neckTiltAngle.toFixed(1)
    }
  };
}

function averagePostureStatus(samples) {
  if (samples.length === 0) return { status: 'Good Posture', details: [], measurements: {} };
  
  const issuesCounts = {};
  const measurementsSum = {
    spineAngle: 0,
    forwardLean: 0,
    shoulderRoll: 0,
    noseToShoulderDistance: 0,
    shoulderHeightDiff: 0,
    neckAngle: 0
  };
  
  samples.forEach(sample => {
    if (sample.measurements) {
      Object.keys(measurementsSum).forEach(key => {
        measurementsSum[key] += parseFloat(sample.measurements[key]) || 0;
      });
    }
    
    sample.details.forEach(issue => {
      if (!issuesCounts[issue.type]) {
        issuesCounts[issue.type] = { count: 0, severity: 0, message: issue.message };
      }
      issuesCounts[issue.type].count++;
      issuesCounts[issue.type].severity += issue.severity;
    });
  });
  
  const avgMeasurements = {};
  Object.keys(measurementsSum).forEach(key => {
    avgMeasurements[key] = (measurementsSum[key] / samples.length).toFixed(3);
  });
  
  const details = [];
  Object.entries(issuesCounts).forEach(([type, data]) => {
    if (data.count > samples.length * BAD_POSTURE_THRESHOLD) { 
      details.push({
        type,
        severity: data.severity / data.count,
        message: data.message,
        measurements: `Persistent issue (${data.count}/${samples.length} samples)`
      });
    }
  });

  return {
    status: details.length === 0 ? 'Good Posture' : 'Poor Posture Detected Over Time',
    details,
    measurements: avgMeasurements
  };
}

// Theme-aware styles function
const getStyles = (theme) => {
  const isDark = theme === 'dark';
  
  return {
    page: {
      display: "flex",
      flexDirection: "column",
      minHeight: "100vh",
      fontFamily: "ui-monospace, 'Fira Code', 'Cascadia Code', Consolas, monospace",
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
      color: isDark ? "#e4e4e7" : "#1f2937"
    },
    statusBar: {
      display: "flex",
      alignItems: "center",
      padding: "6px 24px",
      backgroundColor: isDark ? "#0f0f0f" : "#f8f9fa",
      borderBottom: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      fontSize: "12px",
      fontWeight: "400",
      letterSpacing: "0.5px"
    },
    status: {
      fontSize: "12px",
      color: isDark ? "#71717a" : "#6b7280"
    },
    statusText: {
      color: isDark ? "#00ff88" : "#10b981",
      fontWeight: "500"
    },
    errorText: {
      color: isDark ? "#ff4757" : "#dc2626"
    },
    mainContent: {
      display: "flex",
      flex: 1,
      gap: "16px",
      padding: "16px",
      minHeight: "calc(100vh - 120px)"
    },
    leftPanel: {
      flex: "1",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "8px"
    },
    rightPanel: {
      flex: "1",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      overflow: "auto"
    },
    sectionTitle: {
      fontSize: "14px",
      fontWeight: "500",
      color: isDark ? "#a1a1aa" : "#6b7280",
      marginBottom: "12px",
      textAlign: "center",
      letterSpacing: "0.5px",
      textTransform: "uppercase"
    },
    videoContainer: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: "100%"
    },
    stage: {
      position: "relative",
      borderRadius: "4px",
      overflow: "hidden",
      background: "#000000",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`
    },
    videoHidden: { 
      display: "none" 
    },
    canvas: {
      position: "absolute",
      inset: 0,
      zIndex: 1,
      pointerEvents: "none",
      transformOrigin: "top left"
    },
    statusCard: {
      backgroundColor: isDark ? "#0f0f0f" : "#f9fafb",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      padding: "16px"
    },
    cardHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "12px"
    },
    scoreCircle: {
      width: "48px",
      height: "48px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#ffffff",
      fontSize: "14px",
      fontWeight: "600",
      border: "2px solid"
    },
    postureStatus: {
      padding: "12px",
      border: "1px solid",
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff"
    },
    alert: {
      color: isDark ? "#ff4757" : "#dc2626",
      fontWeight: "500",
      fontSize: "12px"
    },
    statsCard: {
      backgroundColor: isDark ? "#0f0f0f" : "#f9fafb",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      padding: "16px"
    },
    cardTitle: {
      margin: "0 0 12px 0",
      fontSize: "14px",
      fontWeight: "500",
      color: isDark ? "#a1a1aa" : "#6b7280",
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    statsGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "8px"
    },
    statItem: {
      display: "flex",
      flexDirection: "column",
      padding: "12px",
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`
    },
    statLabel: {
      fontSize: "10px",
      color: isDark ? "#71717a" : "#6b7280",
      fontWeight: "500",
      marginBottom: "4px",
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    statValue: {
      fontSize: "16px",
      fontWeight: "600",
      color: isDark ? "#e4e4e7" : "#1f2937"
    },
    measurementsCard: {
      backgroundColor: isDark ? "#0f0f0f" : "#f9fafb",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      padding: "16px"
    },
    measurementsGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "8px"
    },
    measurementItem: {
      display: "flex",
      flexDirection: "column",
      padding: "8px",
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`
    },
    measurementLabel: {
      fontSize: "10px",
      color: isDark ? "#71717a" : "#6b7280",
      marginBottom: "2px",
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    measurementValue: {
      fontSize: "14px",
      fontWeight: "600",
      color: isDark ? "#e4e4e7" : "#1f2937"
    },
    issuesCard: {
      backgroundColor: isDark ? "#0f0f0f" : "#f9fafb",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      padding: "16px"
    },
    issueItem: {
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
      padding: "12px",
      margin: "8px 0",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      borderLeft: "3px solid"
    },
    issueHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "6px"
    },
    issueType: {
      fontSize: "12px",
      fontWeight: "600",
      color: isDark ? "#e4e4e7" : "#1f2937"
    },
    severityBadge: {
      padding: "2px 6px",
      color: "#ffffff",
      fontSize: "10px",
      fontWeight: "700"
    },
    issueMessage: {
      fontSize: "12px",
      color: isDark ? "#a1a1aa" : "#6b7280",
      marginBottom: "2px"
    },
    issueMeasurements: {
      fontSize: "10px",
      color: isDark ? "#71717a" : "#9ca3af"
    },
    noIssuesCard: {
      backgroundColor: isDark ? "#0f0f0f" : "#f9fafb",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      padding: "24px",
      textAlign: "center"
    },
    noIssuesIcon: {
      fontSize: "32px",
      color: isDark ? "#00ff88" : "#10b981",
      marginBottom: "8px"
    },
    noIssuesTitle: {
      fontSize: "16px",
      fontWeight: "600",
      color: isDark ? "#e4e4e7" : "#1f2937",
      marginBottom: "4px"
    },
    noIssuesText: {
      fontSize: "12px",
      color: isDark ? "#71717a" : "#6b7280",
      margin: 0
    },
    // Exercise tab styles
    exerciseCard: {
      backgroundColor: isDark ? "#0f0f0f" : "#f9fafb",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      padding: "16px"
    },
    exerciseList: {
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    },
    exerciseItem: {
      padding: "12px",
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`
    },
    exerciseTitle: {
      margin: "0 0 4px 0",
      fontSize: "12px",
      fontWeight: "600",
      color: isDark ? "#00ff88" : "#10b981"
    },
    exerciseDescription: {
      margin: 0,
      fontSize: "12px",
      color: isDark ? "#a1a1aa" : "#6b7280",
      lineHeight: "1.4"
    },
    // Status info styles
    statusInfoCard: {
      backgroundColor: isDark ? "#0f0f0f" : "#f9fafb",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      padding: "16px"
    },
    statusInfo: {
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    },
    statusItem: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "6px 0",
      borderBottom: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`
    },
    statusLabel: {
      fontSize: "10px",
      color: isDark ? "#71717a" : "#6b7280",
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    statusValue: {
      fontSize: "12px",
      fontWeight: "600",
      color: isDark ? "#e4e4e7" : "#1f2937"
    },
    // Settings tab styles
    settingsCard: {
      backgroundColor: isDark ? "#0f0f0f" : "#f9fafb",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      padding: "16px"
    },
    settingsContent: {
      display: "flex",
      flexDirection: "column",
      gap: "16px"
    },
    settingItem: {
      padding: "12px",
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`
    },
    settingTitle: {
      margin: "0 0 4px 0",
      fontSize: "12px",
      fontWeight: "600",
      color: isDark ? "#e4e4e7" : "#1f2937"
    },
    settingDescription: {
      margin: "0 0 12px 0",
      fontSize: "10px",
      color: isDark ? "#71717a" : "#6b7280",
      lineHeight: "1.4"
    },
    settingControl: {
      display: "flex",
      alignItems: "center"
    },
    slider: {
      width: "100%",
      height: "4px",
      backgroundColor: isDark ? "#27272a" : "#e5e7eb",
      outline: "none",
      appearance: "none"
    },
    toggleSwitch: {
      position: "relative",
      display: "inline-block",
      width: "40px",
      height: "20px"
    },
    toggleInput: {
      opacity: 0,
      width: 0,
      height: 0
    },
    toggleSlider: {
      position: "absolute",
      cursor: "pointer",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: isDark ? "#27272a" : "#e5e7eb",
      transition: "0.3s"
    },
    themeToggleButton: {
      padding: "8px 16px",
      backgroundColor: isDark ? "#27272a" : "#e5e7eb",
      color: isDark ? "#e4e4e7" : "#1f2937",
      border: `1px solid ${isDark ? "#3f3f46" : "#d1d5db"}`,
      cursor: "pointer",
      fontSize: "12px",
      fontWeight: "600",
      transition: "all 0.2s ease"
    },
    dangerButton: {
      padding: "8px 16px",
      backgroundColor: isDark ? "#ff4757" : "#dc2626",
      color: "#ffffff",
      border: "none",
      cursor: "pointer",
      fontSize: "10px",
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      transition: "all 0.2s ease"
    }
  };
};