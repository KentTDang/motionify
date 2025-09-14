import React, { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import Header from "./components/Header";
import './index.css'; // Import the CSS file where the global styles are defined

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

  // ---- exercise refs/state ----
  const stretchStartRef = useRef(null);
  const wasStretchingRef = useRef(false);
  const [exerciseStatus, setExerciseStatus] = useState({
    stretching: false,
    holdMs: 0,
    reps: 0,
    kind: null, // 'overhead' | 'tpose' | null
    message: ""
  });

  const [status, setStatus] = useState("idle");
  const [err, setErr] = useState("");
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });
  const [postureStatus, setPostureStatus] = useState({ status: "Good", details: [] });
  const [lastCheckTime, setLastCheckTime] = useState(0);
  const [sessionStats, setSessionStats] = useState({
    totalTime: 0,
    goodPostureTime: 0,
    badPostureTime: 0,
    currentBadPostureDuration: 0,
    longestBadPostureStreak: 0,
    postureBreaks: 0,
    averagePostureScore: 100,
  });
  const [realTimeData, setRealTimeData] = useState({
    currentPostureScore: 100,
    trend: "stable",
    alerts: [],
  });

  // New state for tab management and theme
  const [activeTab, setActiveTab] = useState('data'); // Changed from 'exercise' to 'data'
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

          // --- analysis branch: exercise vs posture ---
          if (now - lastPostureCheck >= CHECK_INTERVAL && result.landmarks?.[0]) {
            if (activeTab === "exercise") {
              const det = checkArmStretch(result.landmarks[0]);
              updateExerciseTracking(det);
              setLastCheckTime(now);
            } else {
              const currentPosture = checkPosture(result.landmarks[0]);
              if (currentPosture) {
                updatePostureTracking(currentPosture);
                samplesRef.current.push(currentPosture);
                if (samplesRef.current.length > SAMPLES_NEEDED) samplesRef.current.shift();
                const averagedStatus = averagePostureStatus(samplesRef.current);
                setPostureStatus(averagedStatus);
                setLastCheckTime(now);
                window.electron?.sendPostureStatus(averagedStatus.status);
              }
            }
            lastPostureCheck = now;
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
      try {
        landmarkerRef.current?.close();
      } catch {}
      landmarkerRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [activeTab]);

  function updateExerciseTracking(det) {
    const now = Date.now();
  
    if (det.stretching) {
      if (!wasStretchingRef.current) {
        wasStretchingRef.current = true;
        stretchStartRef.current = now;
      }
      const holdMs = stretchStartRef.current ? now - stretchStartRef.current : 0;
      setExerciseStatus((prev) => ({
        ...prev,
        stretching: true,
        holdMs,
        kind: det.kind,
        message: det.message || prev.message,
      }));
    } else {
      if (wasStretchingRef.current) {
        const repHold = stretchStartRef.current ? now - stretchStartRef.current : 0;
        wasStretchingRef.current = false;
        stretchStartRef.current = null;
        setExerciseStatus((prev) => ({
          ...prev,
          stretching: false,
          holdMs: 0,
          reps: prev.reps + 1,
          kind: null,
          message: repHold > 0 ? `Completed stretch (${Math.round(repHold / 1000)}s)` : prev.message,
        }));
      } else {
        setExerciseStatus((prev) => ({ ...prev, stretching: false, holdMs: 0, kind: null }));
      }
    }
  }

  // ----- posture tracking (unchanged) -----
  const updatePostureTracking = (postureData) => {
    const now = Date.now();
    const isBadPosture = postureData.details.length > 0;

    const score = Math.max(
      0,
      100 - postureData.details.reduce((sum, issue) => sum + issue.severity, 0)
    );

    setRealTimeData((prev) => ({
      ...prev,
      currentPostureScore: Math.round(score),
      trend:
        score > prev.currentPostureScore ? "improving" : score < prev.currentPostureScore ? "declining" : "stable",
    }));

    // Only count posture breaks on non-exercise tabs
    if (activeTab === "exercise") {
      return;
    }

    if (isBadPosture) {
      if (!badPostureStartRef.current) {
        badPostureStartRef.current = now;
        setSessionStats((prev) => ({
          ...prev,
          postureBreaks: prev.postureBreaks + 1,
        }));
      }
    } else {
      if (badPostureStartRef.current) {
        const badDuration = now - badPostureStartRef.current;
        setSessionStats((prev) => ({
          ...prev,
          longestBadPostureStreak: Math.max(prev.longestBadPostureStreak, badDuration),
          badPostureTime: prev.badPostureTime + badDuration
        }));
        badPostureStartRef.current = null;
      }
    }
  };

  const lastPostureRef = useRef("Good Posture");

const [lastTrayState, setLastTrayState] = useState("Good Posture");

useEffect(() => {
  const newState =
    sessionStats.currentBadPostureDuration > 0 ? "Bad Posture" : "Good Posture";

  if (newState !== lastTrayState) {
    window.electron?.sendPostureStatus(newState);
    setLastTrayState(newState);
  }
}, [sessionStats.currentBadPostureDuration, lastTrayState]);


// ⏰ Track last notifications
const lastNotifySecondRef = useRef(0);
const lastBadPostureNotifyRef = useRef(0);

const NOTIFY_INTERVAL = 20;  // periodic reminders
const BAD_POSTURE_NOTIFY_INTERVAL = 30; // seconds

// inside updateSessionStats
const updateSessionStats = () => {
  const now = Date.now();
  const sessionDuration = now - sessionStartRef.current;
  const currentSecond = Math.floor(sessionDuration / 1000);

  // 🔔 Stretch reminder every NOTIFY_INTERVAL seconds
  if (currentSecond - lastNotifySecondRef.current >= NOTIFY_INTERVAL) {
    window.electron?.sendPostureStatus("Stretch Reminder");
    lastNotifySecondRef.current = currentSecond;
  }

  // 🔔 Bad posture alert if slouching too long
  if (badPostureStartRef.current) {
    const badDurationSec = Math.floor((now - badPostureStartRef.current) / 1000);
    if (badDurationSec - lastBadPostureNotifyRef.current >= BAD_POSTURE_NOTIFY_INTERVAL) {
      window.electron?.sendPostureStatus("Bad Posture Alert");
      lastBadPostureNotifyRef.current = badDurationSec;
    }
  }

  // ✅ Update session stats
  setSessionStats(prev => {
    // If bad posture is currently active, count elapsed time since last tick
    const badIncrement = badPostureStartRef.current ? CHECK_INTERVAL : 0;

    const newBadTime = prev.badPostureTime + badIncrement;
    const newGoodTime = sessionDuration - newBadTime;

    return {
      ...prev,
      totalTime: sessionDuration,
      goodPostureTime: newGoodTime,
      badPostureTime: newBadTime,
      currentBadPostureDuration: badPostureStartRef.current
        ? now - badPostureStartRef.current
        : 0,
      averagePostureScore: Math.round(((newGoodTime / sessionDuration) * 100) || 100)
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

  const [sessionTime, setSessionTime] = useState(.5 * 60); // 30 in seconds
  const [isSessionRunning, setIsSessionRunning] = useState(false);

  useEffect(() => {
  if (!isSessionRunning) return;

  const interval = setInterval(() => {
    setSessionTime(prev => {
      if (prev <= 1) {
        clearInterval(interval);
        setIsSessionRunning(false);

        // 🔔 Tell main process to show notification
        window.electron?.sendPostureStatus("Session Ended");

        return 0;
      }
      return prev - 1;
    });
  }, 1000);

  return () => clearInterval(interval);
}, [isSessionRunning]);

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
    setExerciseStatus({ stretching: false, holdMs: 0, reps: 0, kind: null, message: "" });
    setSessionStats({
      totalTime: 0,
      goodPostureTime: 0,
      badPostureTime: 0,
      currentBadPostureDuration: 0,
      longestBadPostureStreak: 0,
      postureBreaks: 0,
      averagePostureScore: 100,
    });
  };

  const handleTabChange = (tabId) => setActiveTab(tabId);


  const handleThemeToggle = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const styles = getStyles(theme);

  // Render different right panel content based on active tab
  const renderRightPanelContent = () => {
    switch (activeTab) {
      case "exercise":
  return (
    <>
      <div style={styles.statusCard}>
        <h3 style={styles.cardTitle}>Arm Stretch Tracker</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Status</span>
            <span
              style={{
                ...styles.statValue,
                color: exerciseStatus.stretching ? "#10B981" : "#9CA3AF",
              }}
            >
              {exerciseStatus.stretching ? "Stretching" : "Idle"}
            </span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Kind</span>
            <span style={styles.statValue}>
                    {exerciseStatus.kind ? (exerciseStatus.kind === "overhead" ? "Overhead" : "T-pose") : "—"}
            </span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Current Hold</span>
                  <span style={styles.statValue}>{Math.round(exerciseStatus.holdMs / 1000)}s</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Completed Reps</span>
            <span style={styles.statValue}>{exerciseStatus.reps}</span>
          </div>
        </div>
        {exerciseStatus.message && (
                <div style={{ marginTop: 12, color: "#D1D5DB", fontSize: 14 }}>💡 {exerciseStatus.message}</div>
              )}
            </div>


            {/* Exercise Tips */}
            <div style={styles.exerciseCard}>
              <h3 style={styles.cardTitle}>Stretch Tips</h3>
              <div style={styles.exerciseList}>
                <div style={styles.exerciseItem}>
                  <h4 style={styles.exerciseTitle}>Overhead Stretch</h4>
                  <p style={styles.exerciseDescription}>
                    Straighten elbows and raise wrists above head level. Hold 10–30s, breathe evenly.
                  </p>
                </div>
                <div style={styles.exerciseItem}>
                  <h4 style={styles.exerciseTitle}>T-Pose Stretch</h4>
                  <p style={styles.exerciseDescription}>
                    Keep elbows straight, wrists near shoulder height, and reach wide to the sides.
                  </p>
                </div>
              </div>
            </div>
          </>
        );

      case "data":
  return (
    <>
      {/* ✅ Live Posture Card (driven by timer) */}
      <div
        style={{
          ...styles.statusCard,
          border: `2px solid ${
            sessionStats.currentBadPostureDuration > 0 ? "#EF4444" : "#22C55E"
          }`,
          backgroundColor:
            sessionStats.currentBadPostureDuration > 0 ? "#FEE2E2" : "#DCFCE7",
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            ...styles.cardTitle,
            color: sessionStats.currentBadPostureDuration > 0 ? "#B91C1C" : "#166534",
          }}
        >
          {sessionStats.currentBadPostureDuration > 0
            ? "⚠️ Poor Posture"
            : "✅ Good Posture"}
        </h3>
        <p
          style={{
            color: sessionStats.currentBadPostureDuration > 0 ? "#B91C1C" : "#166534",
            fontWeight: "600",
          }}
        >
          {sessionStats.currentBadPostureDuration > 0
            ? `Your posture needs correction. You’ve been slouching for ${Math.round(
                sessionStats.currentBadPostureDuration / 1000
              )}s`
            : "Keep it up! You're sitting well."}
        </p>
      </div>

      {/* 📊 Session Statistics */}
      <div style={styles.statsCard}>
        <h3 style={styles.cardTitle}>Session Statistics</h3>
        <div style={styles.statsGrid}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Session Time</span>
            <span style={styles.statValue}>{formatTime(sessionStats.totalTime)}</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Good Posture</span>
            <span style={{ ...styles.statValue, color: getPostureColor(100) }}>
              {formatTime(sessionStats.goodPostureTime)}
            </span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Bad Posture</span>
            <span style={{ ...styles.statValue, color: getPostureColor(0) }}>
              {formatTime(sessionStats.badPostureTime)}
            </span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Posture Breaks</span>
            <span style={styles.statValue}>{sessionStats.postureBreaks}</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Longest Bad Streak</span>
            <span style={styles.statValue}>
              {formatTime(sessionStats.longestBadPostureStreak)}
            </span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Average Score</span>
            <span
              style={{
                ...styles.statValue,
                color: getPostureColor(sessionStats.averagePostureScore),
              }}
            >
              {sessionStats.averagePostureScore}%
            </span>
          </div>
        </div>
      </div>

      {/* 📏 Detailed Measurements */}
      {postureStatus.measurements && (
        <div style={styles.measurementsCard}>
          <h3 style={styles.cardTitle}>Detailed Measurements</h3>
          <div style={styles.measurementsGrid}>
            <div style={styles.measurementItem}>
              <span style={styles.measurementLabel}>Spine Angle:</span>
              <span style={styles.measurementValue}>
                {postureStatus.measurements.spineAngle}°
              </span>
            </div>
            <div style={styles.measurementItem}>
              <span style={styles.measurementLabel}>Forward Lean:</span>
              <span style={styles.measurementValue}>
                {postureStatus.measurements.forwardLean}
              </span>
            </div>
            <div style={styles.measurementItem}>
              <span style={styles.measurementLabel}>Shoulder Roll:</span>
              <span style={styles.measurementValue}>
                {postureStatus.measurements.shoulderRoll}
              </span>
            </div>
            <div style={styles.measurementItem}>
              <span style={styles.measurementLabel}>Neck Angle:</span>
              <span style={styles.measurementValue}>
                {postureStatus.measurements.neckAngle}°
              </span>
            </div>
          </div>
        </div>
      )}
    </>
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

      <div style={styles.mainContent}>
        <div style={styles.leftPanel}>
          <div style={styles.videoContainer}>
            {/* <h3 style={styles.sectionTitle}>Camera Feed</h3> */}
            <div style={{ ...styles.stage, width: stageSize.w * 0.7, height: stageSize.h * 0.7 }}>
              <video ref={videoRef} playsInline muted style={styles.videoHidden} />
              <canvas ref={canvasRef} style={{ ...styles.canvas, transform: "scale(0.7)" }} />
            </div>
          </div>
        </div>

        <div style={styles.rightPanel}>{renderRightPanelContent()}</div>
      </div>
    </div>
  );
}

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
    [11, 12],
    [11, 23],
    [12, 24],
    [23, 24],
    [11, 13],
    [13, 15],
    [15, 17],
    [15, 19],
    [15, 21],
    [12, 14],
    [14, 16],
    [16, 18],
    [16, 20],
    [16, 22],
    [23, 25],
    [25, 27],
    [27, 29],
    [29, 31],
    [24, 26],
    [26, 28],
    [28, 30],
    [30, 32],
  ];

  ctx.lineWidth = 3;
  ctx.strokeStyle = "#10B981";

  connections.forEach(([a, b]) => {
    const A = landmarks[a],
      B = landmarks[b];
    if (!A || !B) return;
    if ((A.visibility ?? 1) < 0.5 || (B.visibility ?? 1) < 0.5) return;
    const x1 = A.x * vw,
      y1 = A.y * vh;
    const x2 = B.x * vw,
      y2 = B.y * vh;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });

  landmarks.forEach((p) => {
    if ((p.visibility ?? 1) < 0.5) return;
    const x = p.x * vw,
      y = p.y * vh;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#F59E0B";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

// ---------- posture math ----------
function calculateAngle(a, b, c) {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const cb = { x: b.x - c.x, y: b.y - c.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const cross = ab.x * cb.y - ab.y * cb.x;
  const angle = Math.atan2(cross, dot);
  return Math.abs((angle * 180.0) / Math.PI);
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
    z: (leftShoulder.z + rightShoulder.z) / 2,
  };

  const hipMidpoint = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: (leftHip.z + rightHip.z) / 2,
  };

  const shoulderHeightDiff = Math.abs(leftShoulder.y - rightShoulder.y);
  if (shoulderHeightDiff > 0.08) {
    issues.push({
      type: "Uneven Shoulders",
      severity: shoulderHeightDiff * 15,
      message: "Level your shoulders",
      measurements: `Height difference: ${shoulderHeightDiff.toFixed(3)}`,
    });
  }

  const isSlouchingForward = shoulderMidpoint.z - hipMidpoint.z > 0.005;
  if (isSlouchingForward) {
    issues.push({
      type: "Forward head",
      severity: 8,
      message: "Straighten your back, pull shoulders back",
      measurements: `Forward lean: ${(shoulderMidpoint.z - hipMidpoint.z).toFixed(3)}`,
    });
  }

  const noseToShoulderDist = Math.abs(nose.x - shoulderMidpoint.x);
  const idealNoseToShoulderDist = 0.05;

  if (noseToShoulderDist > idealNoseToShoulderDist) {
    issues.push({
      type: "Slouching",
      severity: (noseToShoulderDist - idealNoseToShoulderDist) * 15,
      message: "Chin back slightly",
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
      type: "Extreme Neck Tilt",
      severity: (neckTiltAngle - 35) / 10,
      message: "Try raising your screen height",
      measurements: `Tilt angle: ${neckTiltAngle.toFixed(1)}°`,
    });
  }

  const spineAngle = calculateAngle(shoulderMidpoint, hipMidpoint, { x: hipMidpoint.x, y: hipMidpoint.y - 0.5 });
  const forwardLean = shoulderMidpoint.z - hipMidpoint.z;

  if (spineAngle > 15 || forwardLean > 0.1) {
    issues.push({
      type: "Slouching/Forward Lean",
      severity: Math.max(spineAngle / 15, forwardLean * 10),
      message: spineAngle > 15 ? "Straighten your spine" : "Pull shoulders back",
      measurements: `Spine angle: ${spineAngle.toFixed(1)}°, Forward lean: ${forwardLean.toFixed(3)}`,
    });
  }

  const shoulderRoll = (leftShoulder.z + rightShoulder.z) / 2 - hipMidpoint.z;
  if (shoulderRoll > 0.08) {
    issues.push({
      type: "Rounded Shoulders",
      severity: shoulderRoll * 10,
      message: "Pull shoulders back and down",
      measurements: `Shoulder roll: ${shoulderRoll.toFixed(3)}`,
    });
  }

  return {
    status: issues.length === 0 ? "Good Posture" : "Posture Needs Attention",
    details: issues,
    measurements: {
      spineAngle: spineAngle.toFixed(1),
      forwardLean: forwardLean.toFixed(3),
      shoulderRoll: shoulderRoll.toFixed(3),
      noseToShoulderDistance: noseToShoulderDist.toFixed(3),
      shoulderHeightDiff: shoulderHeightDiff.toFixed(3),
      neckAngle: neckTiltAngle.toFixed(1),
    },
  };
}

function averagePostureStatus(samples) {
  if (samples.length === 0) return { status: "Good Posture", details: [], measurements: {} };

  const issuesCounts = {};
  const measurementsSum = {
    spineAngle: 0,
    forwardLean: 0,
    shoulderRoll: 0,
    noseToShoulderDistance: 0,
    shoulderHeightDiff: 0,
    neckAngle: 0,
  };

  samples.forEach((sample) => {
    if (sample.measurements) {
      Object.keys(measurementsSum).forEach((key) => {
        measurementsSum[key] += parseFloat(sample.measurements[key]) || 0;
      });
    }

    sample.details.forEach((issue) => {
      if (!issuesCounts[issue.type]) {
        issuesCounts[issue.type] = { count: 0, severity: 0, message: issue.message };
      }
      issuesCounts[issue.type].count++;
      issuesCounts[issue.type].severity += issue.severity;
    });
  });

  const avgMeasurements = {};
  Object.keys(measurementsSum).forEach((key) => {
    avgMeasurements[key] = (measurementsSum[key] / samples.length).toFixed(3);
  });

  const details = [];
  Object.entries(issuesCounts).forEach(([type, data]) => {
    if (data.count > samples.length * BAD_POSTURE_THRESHOLD) {
      details.push({
        type,
        severity: data.severity / data.count,
        message: data.message,
        measurements: `Persistent issue (${data.count}/${samples.length} samples)`,
      });
    }
  });

  return {
    status: details.length === 0 ? "Good Posture" : "Poor Posture Detected Over Time",
    details,
    measurements: avgMeasurements,
  };
}

// ---------- exercise detection ----------
function vDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function jointAngle(a, b, c) {
  // angle at b (deg)
  const abx = a.x - b.x,
    aby = a.y - b.y;
  const cbx = c.x - b.x,
    cby = c.y - b.y;
  const ab = Math.hypot(abx, aby) || 1e-6;
  const cb = Math.hypot(cbx, cby) || 1e-6;
  const cos = (abx * cbx + aby * cby) / (ab * cb);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

function checkArmStretch(pts) {
  const Ls = pts[11],
    Rs = pts[12]; // shoulders
  const Le = pts[13],
    Re = pts[14]; // elbows
  const Lw = pts[15],
    Rw = pts[16]; // wrists
  const nose = pts[0];
  if (!Ls || !Rs || !Le || !Re || !Lw || !Rw || !nose) {
    return { stretching: false, kind: null, message: "Missing landmarks" };
  }

  const ELBOW_STRAIGHT = 160;
  const leftElbowDeg = jointAngle(Ls, Le, Lw);
  const rightElbowDeg = jointAngle(Rs, Re, Rw);
  const elbowsStraight = leftElbowDeg > ELBOW_STRAIGHT && rightElbowDeg > ELBOW_STRAIGHT;

  const OVERHEAD_MARGIN = 0.02;
  const wristsOverhead = Lw.y < nose.y - OVERHEAD_MARGIN && Rw.y < nose.y - OVERHEAD_MARGIN;

  const TPOSE_Y_TOL = 0.08;
  const wristsNearShoulderY = Math.abs(Lw.y - Ls.y) < TPOSE_Y_TOL && Math.abs(Rw.y - Rs.y) < TPOSE_Y_TOL;

  const spanWrists = Math.abs(Lw.x - Rw.x);
  const spanShoulder = Math.abs(Ls.x - Rs.x) || 1e-6;
  const TPOSE_SPAN_MULT = 1.6;
  const wristsWide = spanWrists > TPOSE_SPAN_MULT * spanShoulder;

  if (elbowsStraight && wristsOverhead) {
    return { stretching: true, kind: "overhead", message: "Overhead arm stretch" };
  }
  if (elbowsStraight && wristsNearShoulderY && wristsWide) {
    return { stretching: true, kind: "tpose", message: "T-pose / lateral arm stretch" };
  }

  return { stretching: false, kind: null, message: "" };
}



// ---------- misc UI helpers ----------
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

const styles = {
  page: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    fontFamily: "ui-sans-serif, system-ui, -apple-system",
    backgroundColor: "#111111",
    color: "#E5E7EB",
  },
  statusBar: {
    display: "flex",
    alignItems: "center",
    padding: "8px 32px",
    backgroundColor: "#1F1F1F",
    borderBottom: "1px solid #374151",
  },
  status: { fontSize: "14px", color: "#9CA3AF" },
  statusText: { color: "#FFFFFF" },
  errorText: { color: "#EF4444" },
  mainContent: {
    display: "flex",
    flex: 1,
    gap: "24px",
    padding: "24px",
    minHeight: "calc(100vh - 160px)",
  },
  leftPanel: { flex: "1", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px" },
  rightPanel: { flex: "1", display: "flex", flexDirection: "column", gap: "20px", overflow: "auto" },
  sectionTitle: { fontSize: "20px", fontWeight: "600", color: "#FFFFFF", marginBottom: "20px", textAlign: "center" },
  videoContainer: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%" },
  stage: {
    position: "relative",
    borderRadius: "16px",
    overflow: "hidden",
    boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
    background: "#000000",
    border: "2px solid #374151",
  },
  videoHidden: { display: "none" },
  canvas: { position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", transformOrigin: "top left" },

  statusCard: {
    backgroundColor: "#1F1F1F",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
    border: "1px solid #374151",
  },
  cardTitle: { margin: "0 0 20px 0", fontSize: "20px", fontWeight: "600", color: "#FFFFFF" },

  statsCard: {
    backgroundColor: "#1F1F1F",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
    border: "1px solid #374151",
  },
  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  statItem: {
    display: "flex",
    flexDirection: "column",
    padding: "16px",
    backgroundColor: "#111111",
    borderRadius: "8px",
    border: "1px solid #374151",
  },
  statLabel: { fontSize: "12px", color: "#9CA3AF", fontWeight: "500", marginBottom: "8px" },
  statValue: { fontSize: "18px", fontWeight: "700", color: "#FFFFFF" },

  measurementsCard: {
    backgroundColor: "#1F1F1F",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
    border: "1px solid #374151",
  },
  measurementsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
  measurementItem: {
    display: "flex",
    flexDirection: "column",
    padding: "12px",
    backgroundColor: "#111111",
    borderRadius: "8px",
    border: "1px solid #374151",
  },
  measurementLabel: { fontSize: "12px", color: "#9CA3AF", marginBottom: "4px" },
  measurementValue: { fontSize: "16px", fontWeight: "600", color: "#FFFFFF" },

  issuesCard: {
    backgroundColor: "#1F1F1F",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
    border: "1px solid #374151",
  },

  exerciseCard: {
    backgroundColor: "#1F1F1F",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
    border: "1px solid #374151",
  },
  exerciseList: { display: "flex", flexDirection: "column", gap: "16px" },
  exerciseItem: {
    padding: "16px",
    backgroundColor: "#111111",
    borderRadius: "8px",
    border: "1px solid #374151",
  },
  exerciseTitle: { margin: "0 0 8px 0", fontSize: "16px", fontWeight: "600", color: "#10B981" },
  exerciseDescription: { margin: 0, fontSize: "14px", color: "#D1D5DB", lineHeight: "1.5" },

  statusInfoCard: {
    backgroundColor: "#1F1F1F",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
    border: "1px solid #374151",
  },
  statusInfo: { display: "flex", flexDirection: "column", gap: "12px" },
  statusItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid #374151",
  },
  statusLabel: { fontSize: "14px", color: "#9CA3AF" },
  statusValue: { fontSize: "14px", fontWeight: "600", color: "#FFFFFF" },

  // settingsCard: {
  //   backgroundColor: "#1F1F1F",
  //   borderRadius: "16px",
  //   padding: "24px",
  //   boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
  //   border: "1px solid #374151",
  // },
  // settingsContent: { display: "flex", flexDirection: "column", gap: "24px" },
  // settingItem: {
  //   padding: "20px",
  //   backgroundColor: "#111111",
  //   borderRadius: "8px",
  //   border: "1px solid #374151",
  // },
  // settingTitle: { margin: "0 0 8px 0", fontSize: "16px", fontWeight: "600", color: "#FFFFFF" },
  // settingDescription: { margin: "0 0 16px 0", fontSize: "14px", color: "#9CA3AF", lineHeight: "1.5" },
  // settingControl: { display: "flex", alignItems: "center" },
  slider: {
    width: "100%",
    height: "6px",
    borderRadius: "3px",
    backgroundColor: "#374151",
    outline: "none",
    appearance: "none",
  },
  toggleSwitch: { position: "relative", display: "inline-block", width: "50px", height: "24px" },
  toggleInput: { opacity: 0, width: 0, height: 0 },
  toggleSlider: {
    position: "absolute",
    cursor: "pointer",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#374151",
    borderRadius: "24px",
    transition: "0.4s",
  },
  dangerButton: {
    padding: "10px 20px",
    backgroundColor: "#EF4444",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "all 0.2s ease",
  },
};
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
      color: isDark ? "#e4e4e7" : "#1f2937",
      margin: 0,
      padding: 0
    },
    statusBar: {
      display: "flex",
      alignItems: "center",
      padding: "6px 12px",
      backgroundColor: isDark ? "#0f0f0f" : "#f8f9fa",
      fontSize: "12px",
      fontWeight: "400",
      letterSpacing: "0.5px",
      margin: 0
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
      gap: "8px",
      padding: "8px",
      minHeight: "calc(100vh - 120px)",
      margin: 0
    },
    leftPanel: {
      flex: "1",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "4px",
      margin: 0
    },
    rightPanel: {
      flex: "1",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      overflow: "auto",
      padding: "4px",
      margin: 0
    },
    sectionTitle: {
      fontSize: "14px",
      fontWeight: "500",
      color: isDark ? "#a1a1aa" : "#6b7280",
      marginBottom: "8px",
      textAlign: "center",
      letterSpacing: "0.5px",
      textTransform: "uppercase"
    },
    videoContainer: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: "100%",
      margin: 0,
      padding: 0
    },
    stage: {
      position: "relative",
      borderRadius: "4px",
      overflow: "hidden",
      background: "#000000",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      margin: 0
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
      padding: "12px",
      margin: "0 0 8px 0"
    },
    cardHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "8px"
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
      padding: "8px",
      border: "1px solid",
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
      margin: 0
    },
    alert: {
      color: isDark ? "#ff4757" : "#dc2626",
      fontWeight: "500",
      fontSize: "12px"
    },
    statsCard: {
      backgroundColor: isDark ? "#0f0f0f" : "#f9fafb",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      padding: "12px",
      margin: "0 0 8px 0"
    },
    cardTitle: {
      margin: "0 0 8px 0",
      fontSize: "14px",
      fontWeight: "500",
      color: isDark ? "#a1a1aa" : "#6b7280",
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    statsGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "6px"
    },
    statItem: {
      display: "flex",
      flexDirection: "column",
      padding: "8px",
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      margin: 0
    },
    statLabel: {
      fontSize: "10px",
      color: isDark ? "#71717a" : "#6b7280",
      fontWeight: "500",
      marginBottom: "2px",
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
      padding: "12px",
      margin: "0 0 8px 0"
    },
    measurementsGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "6px"
    },
    measurementItem: {
      display: "flex",
      flexDirection: "column",
      padding: "6px",
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      margin: 0
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
      padding: "12px",
      margin: "0 0 8px 0"
    },
    issueItem: {
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
      padding: "8px",
      margin: "4px 0",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      borderLeft: "3px solid"
    },
    issueHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "4px"
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
      padding: "16px",
      textAlign: "center",
      margin: "0 0 8px 0"
    },
    noIssuesIcon: {
      fontSize: "32px",
      color: isDark ? "#00ff88" : "#10b981",
      marginBottom: "6px"
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
      padding: "12px",
      margin: "0 0 8px 0"
    },
    exerciseList: {
      display: "flex",
      flexDirection: "column",
      gap: "6px"
    },
    exerciseItem: {
      padding: "8px",
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      margin: 0
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
      padding: "12px",
      margin: "0 0 8px 0"
    },
    statusInfo: {
      display: "flex",
      flexDirection: "column",
      gap: "6px"
    },
    statusItem: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "4px 0",
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
      padding: "12px",
      margin: "0 0 8px 0"
    },
    settingsContent: {
      display: "flex",
      flexDirection: "column",
      gap: "12px"
    },
    settingItem: {
      padding: "8px",
      backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
      border: `1px solid ${isDark ? "#27272a" : "#e5e7eb"}`,
      margin: 0
    },
    settingTitle: {
      margin: "0 0 4px 0",
      fontSize: "12px",
      fontWeight: "600",
      color: isDark ? "#e4e4e7" : "#1f2937"
    },
    settingDescription: {
      margin: "0 0 8px 0",
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