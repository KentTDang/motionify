import React, { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const VIDEO_W = 800;
const VIDEO_H = 600;

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);

  const [status, setStatus] = useState("idle");
  const [err, setErr] = useState("");

  useEffect(() => {
    let canceled = false;

    async function init() {
      try {
        setStatus("loading-wasm");

        // Load the WASM assets for Tasks Vision
        // You used @latest before; that’s fine. If you see occasional CDN hiccups, pin a version.
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        setStatus("creating-model");

        // Create the Pose Landmarker (.task model hosted by Google)
        landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
          },
          runningMode: "VIDEO",   // we’re feeding frames manually
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (canceled) return;
        setStatus("starting-camera");

        // Get camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: VIDEO_W }, height: { ideal: VIDEO_H }, frameRate: { ideal: 30 } },
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

        // Size canvas to video
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || VIDEO_W;
        canvas.height = video.videoHeight || VIDEO_H;

        setStatus("running");

        // Main loop
        const tick = () => {
          const lm = landmarkerRef.current;
          if (!lm || !videoRef.current) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          const now = performance.now();
          // Run pose detection
          const result = lm.detectForVideo(videoRef.current, now);

          // Draw
          drawFrame(canvas, videoRef.current, result);

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
        <strong>Status:</strong> {status} {err && <span style={{color:'crimson'}}>• {err}</span>}
      </div>
      <div style={styles.stage}>
        <video ref={videoRef} playsInline muted style={styles.video} width={VIDEO_W} height={VIDEO_H} />
        <canvas ref={canvasRef} style={styles.canvas} width={VIDEO_W} height={VIDEO_H} />
      </div>
    </div>
  );
}

/** Draw video + pose landmarks/skeleton onto the canvas */
function drawFrame(canvas, video, result) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.save();
    ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.clearRect(0, 0, W, H);

  const vw = video.videoWidth, vh = video.videoHeight;
  const arVideo = vw / vh;
  const arCanvas = W / H;

  // compute cover crop in source space
  let sx, sy, sw, sh;
  if (arVideo > arCanvas) {
    // video is wider -> crop width
    sh = vh;
    sw = vh * arCanvas;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    // video is taller -> crop height
    sw = vw;
    sh = vw / arCanvas;
    sx = 0;
    sy = (vh - sh) / 2;
  }

  // draw cropped video into full canvas
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);

  const landmarks = result?.landmarks?.[0];
  if (!landmarks?.length) { ctx.restore(); return; }

  // map normalized landmark (0..1 of full frame) -> cropped canvas coords
  const scaleX = W / sw, scaleY = H / sh;

  // connections
  ctx.lineWidth = 3; ctx.strokeStyle = "#00FF00";
  const connections = [
    [11,12],[11,23],[12,24],[23,24],
    [11,13],[13,15],[15,17],[15,19],[15,21],
    [12,14],[14,16],[16,18],[16,20],[16,22],
    [23,25],[25,27],[27,29],[29,31],
    [24,26],[26,28],[28,30],[30,32],
  ];
  connections.forEach(([a,b]) => {
    const A = landmarks[a], B = landmarks[b];
    if (!A || !B) return;
    if ((A.visibility ?? 1) < 0.5 || (B.visibility ?? 1) < 0.5) return;
    const x1 = (A.x * vw - sx) * scaleX;
    const y1 = (A.y * vh - sy) * scaleY;
    const x2 = (B.x * vw - sx) * scaleX;
    const y2 = (B.y * vh - sy) * scaleY;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });

  // joints
  landmarks.forEach((p) => {
    if ((p.visibility ?? 1) < 0.5) return;
    const x = (p.x * vw - sx) * scaleX;
    const y = (p.y * vh - sy) * scaleY;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2);
    ctx.fillStyle = "#FF4D4D"; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
  });

  ctx.restore();
}

const styles = {
  page: {
    display: "flex", 
    flexDirection: "column", 
    gap: 12, padding: 16, 
    fontFamily: "ui-sans-serif, system-ui, -apple-system" 
  },
  toolbar: { 
    display: "flex", 
    gap: 8, 
    alignItems: "center" 
  },
  stage: { 
    position: "relative", 
    width: VIDEO_W, 
    height: VIDEO_H, 
    borderRadius: 12, 
    overflow: "hidden",
     boxShadow: "0 8px 30px rgba(0,0,0,0.15)" 
  },
  video: { 
    position: "absolute", 
    inset: 0, 
    width: "100%", 
    height: "100%", 
    objectFit: "cover" 
  },
  canvas: { 
    position: "absolute", 
    inset: 0, 
    zIndex: 1, 
    pointerEvents: "none" 
  },
};
