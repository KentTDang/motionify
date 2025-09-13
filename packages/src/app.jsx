import React, { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);

  const [status, setStatus] = useState("idle");
  const [err, setErr] = useState("");
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });

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
};
