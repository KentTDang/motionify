import React, { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const CHECK_INTERVAL = 1;  // NOTE: NOW BEING USED TO CHECK DURATION IN BAD POSITION
const SAMPLES_NEEDED = 30;     // Keep 30 samples (5 minutes worth of data)
const BAD_POSTURE_THRESHOLD = 0.7; // 70% of samples must show an issue to trigger warning

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const samplesRef = useRef([]);

  const [status, setStatus] = useState("idle");
  const [err, setErr] = useState("");
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });
  const [postureStatus, setPostureStatus] = useState({ status: 'Good', details: [] });
  const [lastCheckTime, setLastCheckTime] = useState(0);

  useEffect(() => {
    let canceled = false;

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

        // Use the real camera resolution for perfect alignment
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        setStageSize({ w: vw, h: vh });

        // Size canvas backing store for DPR & map 1 unit = 1 CSS pixel in video space
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
          
          // Check posture
          if (result.landmarks?.[0]) {
            const currentPosture = checkPosture(result.landmarks[0]);
            if (currentPosture) {
              // Add current sample
              samplesRef.current.push(currentPosture);
              // Keep only last SAMPLES_NEEDED samples
              if (samplesRef.current.length > SAMPLES_NEEDED) {
                samplesRef.current.shift();
              }
              
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

  // Update the return statement to include posture feedback
  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        <strong>Status:</strong>&nbsp;{status}
        {err && <span style={{ color: "crimson" }}> • {err}</span>}
      </div>

      <div style={{ ...styles.stage, width: stageSize.w, height: stageSize.h }}>
        {/* Hidden DOM video — we draw it into the canvas for exact alignment */}
        <video ref={videoRef} playsInline muted style={styles.videoHidden} />
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>

      <div style={styles.postureStatus}>
        <h3 style={{ color: postureStatus.status === 'Good Posture' ? '#4CAF50' : '#FF5722' }}>
          {postureStatus.status}
        </h3>
        
        {postureStatus.details.map((issue, i) => (
          <div key={i} style={{
            backgroundColor: issue.severity > 5 ? '#FFEBEE' : '#FFF3E0',
            padding: '8px 12px',
            margin: '4px 0',
            borderRadius: '4px',
            borderLeft: `4px solid ${issue.severity > 5 ? '#F44336' : '#FF9800'}`
          }}>
            <strong>{issue.type}</strong>
            <div>{issue.message}</div>
            <div style={{ fontSize: '0.9em', color: '#666' }}>{issue.measurements}</div>
          </div>
        ))}
        
        {postureStatus.measurements && (
          <div style={{ marginTop: '12px', fontSize: '0.9em', color: '#666' }}>
            <div>Nose-Shoulder Distance: {postureStatus.measurements.noseToShoulderDistance}</div>
            <div>Vertical Alignment: {postureStatus.measurements.verticalAlignment}</div>
            <div>Neck Angle: {postureStatus.measurements.neckAngle}°</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Prepare canvas for crisp drawing at devicePixelRatio, mapping 1 unit = 1 CSS pixel in *video* space */
function prepareCanvas(canvas, cssW, cssH) {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Draw the video frame + pose landmarks in the *same* coordinate space (video pixels). */
function drawFrame(canvas, video, result) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const vw = video.videoWidth || canvas.width / dpr;
  const vh = video.videoHeight || canvas.height / dpr;

  // Reset to our CSS pixel mapping (set by prepareCanvas)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);

  // Mirror once (selfie view): this mirrors both the video and the landmarks
  ctx.save();
  ctx.translate(vw, 0);
  ctx.scale(-1, 1);

  // Draw the exact frame we detect on — no crop/cover
  ctx.drawImage(video, 0, 0, vw, vh);

  const landmarks = result?.landmarks?.[0];
  if (landmarks && landmarks.length) {
    // Keep the mirror transform active while drawing — no extra math required
    drawLandmarksAndSkeleton(ctx, landmarks, vw, vh);
  }

  ctx.restore();
}

/** Draws connections + joints; expects ctx already transformed (mirrored) and using video pixel space */
function drawLandmarksAndSkeleton(ctx, landmarks, vw, vh) {
  // POSE subset connections
  const connections = [
    [11, 12], [11, 23], [12, 24], [23, 24],
    [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
    [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
    [23, 25], [25, 27], [27, 29], [29, 31],
    [24, 26], [26, 28], [28, 30], [30, 32],
  ];

  ctx.lineWidth = 3;
  ctx.strokeStyle = "#00FF00";

  // Lines
  connections.forEach(([a, b]) => {
    const A = landmarks[a], B = landmarks[b];
    if (!A || !B) return;
    if ((A.visibility ?? 1) < 0.5 || (B.visibility ?? 1) < 0.5) return;
    const x1 = A.x * vw, y1 = A.y * vh;
    const x2 = B.x * vw, y2 = B.y * vh;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });

  // Joints
  landmarks.forEach((p, i) => {
    if ((p.visibility ?? 1) < 0.5) return;
    const x = p.x * vw, y = p.y * vh;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    // like your original: hide face (0–10) and hands (15–22)
    // const hidden = (i >= 0 && i <= 10) || (i >= 15 && i <= 22);
    ctx.fillStyle = "#fb8500";
    ctx.fill();
    // if (!hidden) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    // }
  });
}

// First, update the calculateAngle function for more accurate angle calculation
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
  
  // Calculate midpoints
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
  
  // Check uneven shoulders - compare y positions with less sensitivity
  const shoulderHeightDiff = Math.abs(leftShoulder.y - rightShoulder.y);
  if (shoulderHeightDiff > 0.08) { // increased threshold from 0.05 to 0.08
    issues.push({
      type: 'Uneven Shoulders',
      severity: shoulderHeightDiff * 15, // reduced multiplier from 20 to 15
      message: 'Level your shoulders',
      measurements: `Height difference: ${shoulderHeightDiff.toFixed(3)}`,
    });
  }
  
  // Check slouching forward with more sensitivity
  const isSlouchingForward = shoulderMidpoint.z - hipMidpoint.z > 0.005;
  if (isSlouchingForward) {
    issues.push({
      type: 'Forward head',
      severity: 8,
      message: 'Straighten your back, pull shoulders back',
      measurements: `Forward lean: ${(shoulderMidpoint.z - hipMidpoint.z).toFixed(3)}`,
    });
  }
  
  // Forward head posture - increased sensitivity
  const noseToShoulderDist = Math.abs(nose.x - shoulderMidpoint.x);
  const idealNoseToShoulderDist = 0.05; // reduced from 0.07 to 0.05 for more sensitivity
  
  if (noseToShoulderDist > idealNoseToShoulderDist) {
    issues.push({
      type: 'Slouching',
      severity: ((noseToShoulderDist - idealNoseToShoulderDist) * 15), // increased multiplier from 10 to 15
      message: 'Chin back slightly',
      measurements: `Head forward by: ${(noseToShoulderDist - idealNoseToShoulderDist).toFixed(3)}`,
    });
  }
  
  // Neck tilt - calculate angle between ears and shoulders
  const neckTiltAngle = calculateAngle(
    { x: leftEar.x, y: leftEar.y },
    shoulderMidpoint,
    { x: rightEar.x, y: rightEar.y }
  );
  
  // Only warn if neck tilt is extreme (> 35 degrees)
  if (neckTiltAngle > 35) {
    issues.push({
      type: 'Extreme Neck Tilt',
      severity: (neckTiltAngle - 35) / 10,
      message: 'Try raising your screen height',
      measurements: `Tilt angle: ${neckTiltAngle.toFixed(1)}°`,
    });
  }
  
  // Calculate spine angle (between shoulders and hips)
  const spineAngle = calculateAngle(
    shoulderMidpoint,
    hipMidpoint,
    { x: hipMidpoint.x, y: hipMidpoint.y - 0.5 } // vertical reference point
  );
  
  // Check forward lean by comparing shoulder and hip Z positions
  const forwardLean = shoulderMidpoint.z - hipMidpoint.z;
  const shoulderHipRatio = Math.abs(shoulderMidpoint.y - hipMidpoint.y);
  
  // Detect slouching using both spine angle and forward lean
  if (spineAngle > 15 || forwardLean > 0.1) {
    issues.push({
      type: 'Slouching/Forward Lean',
      severity: Math.max(spineAngle / 15, forwardLean * 10),
      message: spineAngle > 15 ? 'Straighten your spine' : 'Pull shoulders back',
      measurements: `Spine angle: ${spineAngle.toFixed(1)}°, Forward lean: ${forwardLean.toFixed(3)}`,
    });
  }
  
  // Check if shoulders are rolling forward
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

// New function to average posture status over multiple samples
function averagePostureStatus(samples) {
  // Count issues by type
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
    // Sum up measurements
    Object.keys(measurementsSum).forEach(key => {
      measurementsSum[key] += parseFloat(sample.measurements[key]);
    });
    
    // Count issues
    sample.details.forEach(issue => {
      if (!issuesCounts[issue.type]) {
        issuesCounts[issue.type] = { count: 0, severity: 0, message: issue.message };
      }
      issuesCounts[issue.type].count++;
      issuesCounts[issue.type].severity += issue.severity;
    });
  });
  
  // Average measurements
  const avgMeasurements = {};
  Object.keys(measurementsSum).forEach(key => {
    avgMeasurements[key] = (measurementsSum[key] / samples.length).toFixed(3);
  });
  
  // Convert issue counts to details array - now requires 70% of samples to show an issue
  const details = [];
  Object.entries(issuesCounts).forEach(([type, data]) => {
    if (data.count > samples.length * BAD_POSTURE_THRESHOLD) { 
      details.push({
        type,
        severity: data.severity / data.count,
        message: data.message,
        measurements: `Detected in ${data.count}/${samples.length} samples over ${Math.round(samples.length * CHECK_INTERVAL / 1000)} seconds` // This needs to be recalculated
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
    gap: 12,
    padding: 16,
    fontFamily: "ui-sans-serif, system-ui, -apple-system",
  },
  toolbar: { display: "flex", gap: 8, alignItems: "center" },
  stage: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
    background: "#000",
  },
  videoHidden: { display: "none" },
  canvas: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    pointerEvents: "none",
  },
  postureStatus: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  }
};
