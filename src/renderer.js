let video, canvas, ctx, pose, camera;
let isDetectionActive = false;

function waitForMediaPipe() {
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      if (
        window.Pose &&
        window.Camera &&
        window.drawConnectors &&
        window.drawLandmarks
      ) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);

    // Timeout after 15 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error("MediaPipe failed to load from CDN"));
    }, 15000);
  });
}

async function loadMediaPipe() {
  try {
    const loadingElement = document.getElementById("loading");
    loadingElement.textContent = "Loading MediaPipe from CDN...";

    await waitForMediaPipe();

    loadingElement.textContent = "MediaPipe loaded successfully!";
    setTimeout(() => {
      loadingElement.style.display = "none";
    }, 1000);

    initializePoseDetection();
  } catch (error) {
    console.error("Failed to load MediaPipe:", error);
    document.getElementById("loading").textContent =
      "Error loading MediaPipe. Please check your internet connection.";
  }
}

function initializePoseDetection() {
  video = document.getElementById("webcam");
  canvas = document.getElementById("output");
  ctx = canvas.getContext("2d");

  // 1) Create Pose instance & point it at the CDN for assets
  pose = new Pose({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
  });

  // 2) Configure options
  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  // 3) Handle results -> draw & give feedback
  pose.onResults((results) => {
    // Ensure canvas is properly sized
    if (
      canvas.width !== video.videoWidth ||
      canvas.height !== video.videoHeight
    ) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the video frame first
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Draw pose landmarks
    if (results.poseLandmarks) {
      console.log("Pose landmarks detected:", results.poseLandmarks.length);

      // Draw pose connections with different colors for different body parts
      if (
        window.drawConnectors &&
        window.Pose &&
        window.Pose.POSE_CONNECTIONS
      ) {
        drawConnectors(ctx, results.poseLandmarks, Pose.POSE_CONNECTIONS, {
          color: "#00FF00",
          lineWidth: 3,
        });
      } else {
        // Fallback: draw basic connections manually
        drawBasicConnections(ctx, results.poseLandmarks);
      }

      // Draw enhanced pose landmarks with body part labels
      drawEnhancedLandmarks(ctx, results.poseLandmarks);

      // Get comprehensive posture feedback
      const feedback = getComprehensivePostureFeedback(results.poseLandmarks);
      console.log(feedback);

      // Display feedback on canvas
      displayFeedback(ctx, feedback);
    } else {
      console.log("No pose landmarks detected");
    }
  });

  // 4) Start camera
  startCamera();
}

// Start camera and stream frames to Pose
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: 800,
        height: 600,
        facingMode: "user",
      },
      audio: false,
    });

    video.srcObject = stream;

    video.onloadedmetadata = () => {
      video.play();

      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      console.log("Camera initialized successfully");
      console.log(
        "Video dimensions:",
        video.videoWidth,
        "x",
        video.videoHeight
      );
      console.log("Canvas dimensions:", canvas.width, "x", canvas.height);
    };
  } catch (error) {
    console.error("Camera access error:", error);
    document.getElementById("loading").textContent =
      "Camera access denied. Please allow camera permissions.";
  }
}

// Start pose detection
function startDetection() {
  if (!pose || !video || isDetectionActive) return;

  isDetectionActive = true;

  // Start MediaPipe camera
  camera = new Camera(video, {
    onFrame: async () => {
      if (isDetectionActive) {
        await pose.send({ image: video });
      }
    },
    width: video.videoWidth,
    height: video.videoHeight,
  });
  camera.start();

  // Update UI
  document.getElementById("startBtn").disabled = true;
  document.getElementById("stopBtn").disabled = false;

  console.log("Pose detection started");
}

// Stop pose detection
function stopDetection() {
  if (!isDetectionActive) return;

  isDetectionActive = false;

  if (camera) {
    camera.stop();
    camera = null;
  }

  // Clear canvas
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }

  // Update UI
  document.getElementById("startBtn").disabled = false;
  document.getElementById("stopBtn").disabled = true;

  console.log("Pose detection stopped");
}

// Fallback function to draw basic pose connections
function drawBasicConnections(ctx, landmarks) {
  // Basic pose connections (simplified version of MediaPipe's POSE_CONNECTIONS)
  const connections = [
    // Face
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 7], // Left eye
    [0, 4],
    [4, 5],
    [5, 6],
    [6, 8], // Right eye
    [9, 10], // Mouth

    // Torso
    [11, 12], // Shoulders
    [11, 13],
    [12, 14], // Arms
    [13, 15],
    [14, 16], // Forearms
    [11, 23],
    [12, 24], // Torso sides
    [23, 24], // Hips

    // Legs
    [23, 25],
    [24, 26], // Thighs
    [25, 27],
    [26, 28], // Shins
    [27, 29],
    [28, 30], // Feet
    [29, 31],
    [30, 32], // Heels
    [27, 31],
    [28, 32], // Foot connections
  ];

  ctx.strokeStyle = "#00FF00";
  ctx.lineWidth = 3;

  connections.forEach(([start, end]) => {
    if (
      landmarks[start] &&
      landmarks[end] &&
      landmarks[start].visibility > 0.5 &&
      landmarks[end].visibility > 0.5
    ) {
      const startX = landmarks[start].x * canvas.width;
      const startY = landmarks[start].y * canvas.height;
      const endX = landmarks[end].x * canvas.width;
      const endY = landmarks[end].y * canvas.height;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  });
}

// Make functions globally available
window.startDetection = startDetection;
window.stopDetection = stopDetection;

// Enhanced landmark drawing with body part labels
function drawEnhancedLandmarks(ctx, landmarks) {
  const bodyPartNames = [
    "Nose",
    "Left Eye Inner",
    "Left Eye",
    "Left Eye Outer",
    "Right Eye Inner",
    "Right Eye",
    "Right Eye Outer",
    "Left Ear",
    "Right Ear",
    "Mouth Left",
    "Mouth Right",
    "Left Shoulder",
    "Right Shoulder",
    "Left Elbow",
    "Right Elbow",
    "Left Wrist",
    "Right Wrist",
    "Left Pinky",
    "Right Pinky",
    "Left Index",
    "Right Index",
    "Left Thumb",
    "Right Thumb",
    "Left Hip",
    "Right Hip",
    "Left Knee",
    "Right Knee",
    "Left Ankle",
    "Right Ankle",
    "Left Heel",
    "Right Heel",
    "Left Foot Index",
    "Right Foot Index",
  ];

  const bodyPartColors = {
    head: "#FF6B6B", // Red for head/face
    torso: "#4ECDC4", // Teal for torso
    arms: "#45B7D1", // Blue for arms
    legs: "#96CEB4", // Green for legs
    hands: "#FFEAA7", // Yellow for hands
    feet: "#DDA0DD", // Purple for feet
  };

  landmarks.forEach((landmark, index) => {
    if (landmark.visibility > 0.5) {
      // Only draw if landmark is visible
      const x = landmark.x * canvas.width;
      const y = landmark.y * canvas.height;

      // Determine body part category and color
      let color = bodyPartColors.head;
      if (index >= 11 && index <= 23)
        color = bodyPartColors.torso; // Shoulders to hips
      else if (index >= 12 && index <= 23) color = bodyPartColors.arms; // Arms
      else if (index >= 24 && index <= 27) color = bodyPartColors.legs; // Legs
      else if (index >= 16 && index <= 23)
        color = bodyPartColors.hands; // Hands
      else if (index >= 28 && index <= 33) color = bodyPartColors.feet; // Feet

      // Draw larger, more visible point
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw body part label
      ctx.font = "12px Arial";
      ctx.fillStyle = "#FFFFFF";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      const label = bodyPartNames[index] || `Point ${index}`;
      ctx.strokeText(label, x + 12, y - 8);
      ctx.fillText(label, x + 12, y - 8);
    }
  });
}

// Display feedback on canvas
function displayFeedback(ctx, feedback) {
  ctx.font = "18px Arial";
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 3;

  // Display main feedback
  ctx.strokeText(feedback.main, 20, 30);
  ctx.fillText(feedback.main, 20, 30);

  // Display additional feedback if available
  if (feedback.details) {
    ctx.font = "14px Arial";
    feedback.details.forEach((detail, index) => {
      const y = 60 + index * 25;
      ctx.strokeText(detail, 20, y);
      ctx.fillText(detail, 20, y);
    });
  }
}

// Comprehensive posture feedback function
function getComprehensivePostureFeedback(landmarks) {
  if (!landmarks || landmarks.length < 33) {
    return { main: "No pose detected", details: [] };
  }

  const feedback = { main: "", details: [] };

  // Head position analysis
  if (landmarks[0] && landmarks[11] && landmarks[12]) {
    const headYDiff = landmarks[0].y - landmarks[11].y;
    const shoulderLevel = Math.abs(landmarks[11].y - landmarks[12].y);

    if (headYDiff > 0.03) {
      feedback.details.push("📈 Lift your head slightly");
    } else if (headYDiff < -0.03) {
      feedback.details.push("📉 Lower your head slightly");
    } else {
      feedback.details.push("✅ Head position: Good");
    }

    if (shoulderLevel > 0.05) {
      feedback.details.push("⚠️ Shoulders not level");
    } else {
      feedback.details.push("✅ Shoulders: Level");
    }
  }

  // Arm position analysis
  if (landmarks[11] && landmarks[12] && landmarks[13] && landmarks[14]) {
    const leftArmAngle = calculateAngle(
      landmarks[11],
      landmarks[13],
      landmarks[15]
    );
    const rightArmAngle = calculateAngle(
      landmarks[12],
      landmarks[14],
      landmarks[16]
    );

    if (leftArmAngle < 45 || rightArmAngle < 45) {
      feedback.details.push("💪 Relax your arms");
    } else {
      feedback.details.push("✅ Arms: Relaxed");
    }
  }

  // Hip alignment analysis
  if (landmarks[23] && landmarks[24]) {
    const hipLevel = Math.abs(landmarks[23].y - landmarks[24].y);
    if (hipLevel > 0.03) {
      feedback.details.push("🔄 Hips not aligned");
    } else {
      feedback.details.push("✅ Hips: Aligned");
    }
  }

  // Overall posture assessment
  const goodCount = feedback.details.filter((d) => d.includes("✅")).length;
  const totalCount = feedback.details.length;

  if (goodCount === totalCount) {
    feedback.main = "🎉 Excellent posture!";
  } else if (goodCount >= totalCount * 0.7) {
    feedback.main = "👍 Good posture overall";
  } else {
    feedback.main = "📝 Posture needs attention";
  }

  return feedback;
}

// Helper function to calculate angle between three points
function calculateAngle(point1, point2, point3) {
  const a = Math.sqrt(
    Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)
  );
  const b = Math.sqrt(
    Math.pow(point3.x - point2.x, 2) + Math.pow(point3.y - point2.y, 2)
  );
  const c = Math.sqrt(
    Math.pow(point1.x - point3.x, 2) + Math.pow(point1.y - point3.y, 2)
  );

  const angle = Math.acos((a * a + b * b - c * c) / (2 * a * b));
  return angle * (180 / Math.PI);
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  loadMediaPipe();
});
