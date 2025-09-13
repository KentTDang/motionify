import React, { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

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
    trend: 'stable', // 'improving', 'declining', 'stable'
    alerts: []
  });

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
          
          // Check posture every CHECK_INTERVAL ms
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
                // Average the samples
                const averagedStatus = averagePostureStatus(samplesRef.current);
                setPostureStatus(averagedStatus);
                // Send status to main process for tray icon
                window.electron?.sendPostureStatus(averagedStatus.status);
                setLastCheckTime(now);
                // Clear samples after using them
                samplesRef.current = [];
            }
          }

          // Update session stats every second
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
    
    // Calculate posture score (0-100)
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
          longestBadPostureStreak: Math.max(prev.longestBadPostureStreak, badDuration)
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
      const badTime = prev.badPostureTime + (badPostureStartRef.current ? 1000 : 0);
      const goodTime = sessionDuration - badTime;
      
      return {
        ...prev,
        totalTime: sessionDuration,
        goodPostureTime: goodTime,
        badPostureTime: badTime,
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
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FF9800';
    return '#F44336';
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

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Posture Monitor</h1>
        <div style={styles.statusBar}>
          <span style={styles.status}>
            Status: <strong>{status}</strong>
            {err && <span style={{ color: "crimson" }}> • {err}</span>}
          </span>
          <button onClick={resetStats} style={styles.resetButton}>
            Reset Session
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.mainContent}>
        {/* Video Feed */}
        <div style={styles.videoSection}>
          <div style={{ ...styles.stage, width: stageSize.w * 0.6, height: stageSize.h * 0.6 }}>
            <video ref={videoRef} playsInline muted style={styles.videoHidden} />
            <canvas ref={canvasRef} style={{...styles.canvas, transform: 'scale(0.6)'}} />
          </div>
        </div>

        {/* Dashboard */}
        <div style={styles.dashboard}>
          {/* Real-time Status Card */}
          <div style={styles.statusCard}>
            <div style={styles.cardHeader}>
              <h3>Current Status</h3>
              <div style={{
                ...styles.scoreCircle,
                backgroundColor: getPostureColor(realTimeData.currentPostureScore)
              }}>
                {realTimeData.currentPostureScore}
              </div>
            </div>
            
            <div style={{
              ...styles.postureStatus,
              borderColor: postureStatus.status === 'Good Posture' ? '#4CAF50' : '#F44336'
            }}>
              <div style={{
                color: postureStatus.status === 'Good Posture' ? '#4CAF50' : '#F44336',
                fontWeight: 'bold',
                marginBottom: '8px'
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
                <span style={{...styles.statValue, color: '#4CAF50'}}>
                  {formatTime(sessionStats.goodPostureTime)}
                </span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Bad Posture</span>
                <span style={{...styles.statValue, color: '#F44336'}}>
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

          {/* Issues Details */}
          {postureStatus.details.length > 0 && (
            <div style={styles.issuesCard}>
              <h3 style={styles.cardTitle}>Current Issues</h3>
              {postureStatus.details.map((issue, i) => (
                <div key={i} style={{
                  ...styles.issueItem,
                  borderLeft: `4px solid ${issue.severity > 5 ? '#F44336' : '#FF9800'}`
                }}>
                  <div style={styles.issueHeader}>
                    <span style={styles.issueType}>{issue.type}</span>
                    <span style={{
                      ...styles.severityBadge,
                      backgroundColor: issue.severity > 5 ? '#F44336' : '#FF9800'
                    }}>
                      {Math.round(issue.severity)}/10
                    </span>
                  </div>
                  <div style={styles.issueMessage}>{issue.message}</div>
                  <div style={styles.issueMeasurements}>{issue.measurements}</div>
                </div>
              ))}
            </div>
          )}

          {/* Measurements */}
          {postureStatus.measurements && (
            <div style={styles.measurementsCard}>
              <h3 style={styles.cardTitle}>Detailed Measurements</h3>
              <div style={styles.measurementsGrid}>
                <div style={styles.measurementItem}>
                  <span>Spine Angle:</span>
                  <span>{postureStatus.measurements.spineAngle}°</span>
                </div>
                <div style={styles.measurementItem}>
                  <span>Forward Lean:</span>
                  <span>{postureStatus.measurements.forwardLean}</span>
                </div>
                <div style={styles.measurementItem}>
                  <span>Shoulder Roll:</span>
                  <span>{postureStatus.measurements.shoulderRoll}</span>
                </div>
                <div style={styles.measurementItem}>
                  <span>Neck Angle:</span>
                  <span>{postureStatus.measurements.neckAngle}°</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// All the existing helper functions remain the same...
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
  ctx.strokeStyle = "#00FF00";

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
    ctx.fillStyle = "#fb8500";
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
    Object.keys(measurementsSum).forEach(key => {
      measurementsSum[key] += parseFloat(sample.measurements[key]);
    });
    
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

const styles = {
  page: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    fontFamily: "ui-sans-serif, system-ui, -apple-system",
    backgroundColor: "#f8fafc",
    color: "#334155"
  },
  header: {
    backgroundColor: "#fff",
    padding: "16px 24px",
    borderBottom: "1px solid #e2e8f0",
    boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)"
  },
  title: {
    margin: 0,
    fontSize: "28px",
    fontWeight: "700",
    color: "#1e293b"
  },
  statusBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "8px"
  },
  status: {
    fontSize: "14px",
    color: "#64748b"
  },
  resetButton: {
    padding: "6px 12px",
    backgroundColor: "#3b82f6",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px"
  },
  mainContent: {
    display: "flex",
    flex: 1,
    gap: "24px",
    padding: "24px"
  },
  videoSection: {
    flex: "0 0 auto"
  },
  stage: {
    position: "relative",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
    background: "#000"
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
  dashboard: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    minWidth: "400px"
  },
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px"
  },
  scoreCircle: {
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: "20px",
    fontWeight: "bold"
  },
  postureStatus: {
    padding: "16px",
    border: "2px solid",
    borderRadius: "8px",
    backgroundColor: "#f9fafb"
  },
  alert: {
    color: "#dc2626",
    fontWeight: "600",
    fontSize: "14px"
  },
  statsCard: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
  },
  cardTitle: {
    margin: "0 0 16px 0",
    fontSize: "18px",
    fontWeight: "600",
    color: "#1e293b"
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "16px"
  },
  statItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px"
  },
  statLabel: {
    fontSize: "14px",
    color: "#64748b",
    fontWeight: "500"
  },
  statValue: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#1e293b"
  },
  issuesCard: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
  },
  issueItem: {
    backgroundColor: "#f8fafc",
    padding: "12px 16px",
    margin: "8px 0",
    borderRadius: "8px"
  },
  issueHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "4px"
  },
}