// Global state management
const AppState = {
  isMonitoring: false,
  timerInterval: null,
  timeRemaining: 30 * 60, // 30 minutes in seconds
  isPaused: false,
  currentPosture: 'good',
  exercises: [
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
  ],
  currentExerciseIndex: 0
};

// DOM elements
const video = document.getElementById("webcam");
const navTabs = document.querySelectorAll('.nav-tab');
const tabContents = document.querySelectorAll('.tab-content');
const toggleCameraBtn = document.getElementById('toggleCamera');
const calibrateBtn = document.getElementById('calibratePosture');
const startTimerBtn = document.getElementById('startTimer');
const pauseTimerBtn = document.getElementById('pauseTimer');
const resetTimerBtn = document.getElementById('resetTimer');
const timerMinutes = document.getElementById('timerMinutes');
const timerSeconds = document.getElementById('timerSeconds');
const postureIndicator = document.getElementById('postureIndicator');
const statusIndicator = document.getElementById('statusIndicator');
const notificationBanner = document.getElementById('notificationBanner');
const exercisesGrid = document.getElementById('exercisesGrid');
const exerciseModal = document.getElementById('exerciseModal');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
  setupEventListeners();
  renderExercises();
  loadSettings();
});

function initializeApp() {
  // Set initial timer display
  updateTimerDisplay();
  
  // Initialize camera
  startWebcam();
  
  // Start simulated posture detection
  startPostureSimulation();
}

function setupEventListeners() {
  // Navigation tabs
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Camera controls
  toggleCameraBtn.addEventListener('click', toggleMonitoring);
  calibrateBtn.addEventListener('click', calibratePosture);

  // Timer controls
  startTimerBtn.addEventListener('click', startTimer);
  pauseTimerBtn.addEventListener('click', pauseTimer);
  resetTimerBtn.addEventListener('click', resetTimer);

  // Notification actions
  document.getElementById('startExercise')?.addEventListener('click', startExerciseRoutine);
  document.getElementById('snoozeBreak')?.addEventListener('click', snoozeBreak);
  document.getElementById('dismissNotification')?.addEventListener('click', dismissNotification);

  // Exercise categories
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => filterExercises(btn.dataset.category));
  });

  // Exercise modal
  document.getElementById('closeExerciseModal')?.addEventListener('click', closeExerciseModal);
  document.getElementById('startExerciseTimer')?.addEventListener('click', startExerciseTimer);
  document.getElementById('skipExercise')?.addEventListener('click', skipExercise);
  document.getElementById('nextExercise')?.addEventListener('click', nextExercise);

  // Settings
  document.getElementById('saveSettings')?.addEventListener('click', saveSettings);
  document.getElementById('resetSettings')?.addEventListener('click', resetSettings);
  
  // Range input updates
  document.getElementById('sensitivity')?.addEventListener('input', updateRangeValue);
}

// Camera functionality
async function startWebcam() {
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
    
    // Update camera status
    postureIndicator.innerHTML = `
      <div class="indicator-icon">📹</div>
      <div class="indicator-text">Camera Ready</div>
    `;
    
    calibrateBtn.disabled = false;
  } catch (err) {
    console.error("Error accessing webcam:", err);
    postureIndicator.innerHTML = `
      <div class="indicator-icon">❌</div>
      <div class="indicator-text">Camera Access Denied</div>
    `;
  }
}

function toggleMonitoring() {
  AppState.isMonitoring = !AppState.isMonitoring;
  
  if (AppState.isMonitoring) {
    toggleCameraBtn.textContent = 'Stop Monitoring';
    toggleCameraBtn.className = 'btn btn-warning';
    postureIndicator.innerHTML = `
      <div class="indicator-icon">👀</div>
      <div class="indicator-text">Monitoring Active</div>
    `;
  } else {
    toggleCameraBtn.textContent = 'Start Monitoring';
    toggleCameraBtn.className = 'btn btn-primary';
    postureIndicator.innerHTML = `
      <div class="indicator-icon">📹</div>
      <div class="indicator-text">Camera Ready</div>
    `;
  }
}

function calibratePosture() {
  // Simulate calibration process
  calibrateBtn.disabled = true;
  calibrateBtn.textContent = 'Calibrating...';
  
  setTimeout(() => {
    calibrateBtn.disabled = false;
    calibrateBtn.textContent = 'Recalibrate';
    showToast('Posture calibrated successfully!', 'success');
  }, 3000);
}

// Timer functionality
function startTimer() {
  if (!AppState.timerInterval) {
    AppState.timerInterval = setInterval(updateTimer, 1000);
    startTimerBtn.disabled = true;
    pauseTimerBtn.disabled = false;
    AppState.isPaused = false;
  }
}

function pauseTimer() {
  if (AppState.timerInterval) {
    clearInterval(AppState.timerInterval);
    AppState.timerInterval = null;
    startTimerBtn.disabled = false;
    pauseTimerBtn.disabled = true;
    AppState.isPaused = true;
  }
}

function resetTimer() {
  if (AppState.timerInterval) {
    clearInterval(AppState.timerInterval);
    AppState.timerInterval = null;
  }
  
  AppState.timeRemaining = 30 * 60; // Reset to 30 minutes
  updateTimerDisplay();
  startTimerBtn.disabled = false;
  pauseTimerBtn.disabled = true;
  AppState.isPaused = false;
}

function updateTimer() {
  AppState.timeRemaining--;
  updateTimerDisplay();
  
  if (AppState.timeRemaining <= 0) {
    clearInterval(AppState.timerInterval);
    AppState.timerInterval = null;
    showBreakNotification();
    resetTimer();
  }
}

function updateTimerDisplay() {
  const minutes = Math.floor(AppState.timeRemaining / 60);
  const seconds = AppState.timeRemaining % 60;
  timerMinutes.textContent = minutes.toString().padStart(2, '0');
  timerSeconds.textContent = seconds.toString().padStart(2, '0');
}

// Posture simulation (replace with actual AI detection)
function startPostureSimulation() {
  setInterval(() => {
    if (AppState.isMonitoring) {
      // Simulate posture detection
      const postureStates = ['good', 'warning', 'poor'];
      const randomState = postureStates[Math.floor(Math.random() * postureStates.length)];
      updatePostureStatus(randomState);
    }
  }, 5000); // Check every 5 seconds
}

function updatePostureStatus(posture) {
  AppState.currentPosture = posture;
  const confidence = Math.floor(Math.random() * 20) + 80; // Random confidence 80-100%
  
  let icon, text, color;
  switch (posture) {
    case 'good':
      icon = '😊';
      text = 'Good Posture';
      color = '#48bb78';
      break;
    case 'warning':
      icon = '😐';
      text = 'Posture Warning';
      color = '#ed8936';
      break;
    case 'poor':
      icon = '😟';
      text = 'Poor Posture';
      color = '#e53e3e';
      showPostureAlert();
      break;

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
  
  statusIndicator.innerHTML = `
    <div class="status-icon">${icon}</div>
    <div class="status-text" style="color: ${color}">${text}</div>
    <div class="confidence-bar">
      <div class="confidence-fill" style="width: ${confidence}%; background: ${color}"></div>
    </div>
    <span class="confidence-text">${confidence}% Confidence</span>
  `;
}

// Notification system
function showBreakNotification() {
  notificationBanner.classList.remove('hidden');
  
  // Play notification sound (if enabled)
  if (document.getElementById('soundNotifications')?.checked) {
    playNotificationSound();
  }
  
  // Desktop notification (if enabled)
  if (document.getElementById('desktopNotifications')?.checked) {
    showDesktopNotification();
  }
}

function showPostureAlert() {
  showToast('Poor posture detected! Please adjust your position.', 'warning');
}

function dismissNotification() {
  notificationBanner.classList.add('hidden');
}

function snoozeBreak() {
  dismissNotification();
  AppState.timeRemaining = 5 * 60; // 5 minutes snooze
  updateTimerDisplay();
  showToast('Break snoozed for 5 minutes', 'info');
}

function playNotificationSound() {
  // Create a simple beep sound
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = 800;
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
}

function showDesktopNotification() {
  if (Notification.permission === 'granted') {
    new Notification('Motionify - Break Time!', {
      body: 'Time for a stretch break. Your posture will thank you!',
      icon: '/icon.png' // Add an icon file
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        showDesktopNotification();
      }
    });
  }
}

// Tab navigation
function switchTab(tabName) {
  // Update nav tabs
  navTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  // Update tab contents
  tabContents.forEach(content => {
    content.classList.toggle('active', content.id === tabName);
  });
}

// Exercise system
function renderExercises(category = 'all') {
  const filteredExercises = category === 'all' 
    ? AppState.exercises 
    : AppState.exercises.filter(ex => ex.category === category);
  
  exercisesGrid.innerHTML = filteredExercises.map(exercise => `
    <div class="exercise-card" onclick="openExerciseModal(${exercise.id})">
      <h4>${exercise.title}</h4>
      <div class="exercise-meta">
        <span>⏱️ ${exercise.duration}s</span>
        <span>📂 ${exercise.category}</span>
      </div>
      <p class="exercise-description">${exercise.description}</p>
    </div>
  `).join('');
}

function filterExercises(category) {
  // Update category buttons
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });
  
  renderExercises(category);
}

function openExerciseModal(exerciseId) {
  const exercise = AppState.exercises.find(ex => ex.id === exerciseId);
  if (!exercise) return;
  
  document.getElementById('exerciseTitle').textContent = exercise.title;
  document.getElementById('exerciseDescription').textContent = exercise.description;
  document.getElementById('exerciseCountdown').textContent = exercise.duration;
  
  exerciseModal.classList.remove('hidden');
}

function closeExerciseModal() {
  exerciseModal.classList.add('hidden');
  
  // Reset exercise timer state
  document.getElementById('startExerciseTimer').classList.remove('hidden');
  document.getElementById('skipExercise').classList.remove('hidden');
  document.getElementById('nextExercise').classList.add('hidden');
}

function startExerciseTimer() {
  const countdownElement = document.getElementById('exerciseCountdown');
  let timeLeft = parseInt(countdownElement.textContent);
  
  document.getElementById('startExerciseTimer').classList.add('hidden');
  
  const exerciseInterval = setInterval(() => {
    timeLeft--;
    countdownElement.textContent = timeLeft;
    
    if (timeLeft <= 0) {
      clearInterval(exerciseInterval);
      document.getElementById('skipExercise').classList.add('hidden');
      document.getElementById('nextExercise').classList.remove('hidden');
      showToast('Exercise completed! Great job!', 'success');
    }
  }, 1000);
}

function skipExercise() {
  nextExercise();
}

function nextExercise() {
  AppState.currentExerciseIndex++;
  
  if (AppState.currentExerciseIndex < AppState.exercises.length) {
    const nextEx = AppState.exercises[AppState.currentExerciseIndex];
    openExerciseModal(nextEx.id);
  } else {
    closeExerciseModal();
    AppState.currentExerciseIndex = 0;
    showToast('Exercise routine completed! 🎉', 'success');
  }
}

function startExerciseRoutine() {
  dismissNotification();
  switchTab('exercises');
  AppState.currentExerciseIndex = 0;
  openExerciseModal(AppState.exercises[0].id);
}

// Settings management
function loadSettings() {
  const settings = JSON.parse(localStorage.getItem('motionifySettings') || '{}');
  
  // Apply saved settings
  if (settings.breakInterval) {
    document.getElementById('breakInterval').value = settings.breakInterval;
  }
  if (settings.soundNotifications !== undefined) {
    document.getElementById('soundNotifications').checked = settings.soundNotifications;
  }
  if (settings.desktopNotifications !== undefined) {
    document.getElementById('desktopNotifications').checked = settings.desktopNotifications;
  }
  if (settings.sensitivity) {
    document.getElementById('sensitivity').value = settings.sensitivity;
    updateRangeValue({ target: document.getElementById('sensitivity') });
  }
  if (settings.autoCalibrate !== undefined) {
    document.getElementById('autoCalibrate').checked = settings.autoCalibrate;
  }
  if (settings.theme) {
    document.getElementById('theme').value = settings.theme;
  }
  if (settings.minimizeToTray !== undefined) {
    document.getElementById('minimizeToTray').checked = settings.minimizeToTray;
  }
}

function saveSettings() {
  const settings = {
    breakInterval: document.getElementById('breakInterval').value,
    soundNotifications: document.getElementById('soundNotifications').checked,
    desktopNotifications: document.getElementById('desktopNotifications').checked,
    sensitivity: document.getElementById('sensitivity').value,
    autoCalibrate: document.getElementById('autoCalibrate').checked,
    theme: document.getElementById('theme').value,
    minimizeToTray: document.getElementById('minimizeToTray').checked
  };
  
  localStorage.setItem('motionifySettings', JSON.stringify(settings));
  
  // Update timer interval if changed
  if (settings.breakInterval !== '30') {
    AppState.timeRemaining = parseInt(settings.breakInterval) * 60;
    updateTimerDisplay();
  }
  
  showToast('Settings saved successfully!', 'success');
}

function resetSettings() {
  localStorage.removeItem('motionifySettings');
  
  // Reset form to defaults
  document.getElementById('breakInterval').value = '30';
  document.getElementById('soundNotifications').checked = true;
  document.getElementById('desktopNotifications').checked = true;
  document.getElementById('sensitivity').value = '7';
  document.getElementById('autoCalibrate').checked = true;
  document.getElementById('theme').value = 'light';
  document.getElementById('minimizeToTray').checked = true;
  
  updateRangeValue({ target: document.getElementById('sensitivity') });
  
  showToast('Settings reset to defaults', 'info');
}

function updateRangeValue(event) {
  const rangeInput = event.target;
  const valueSpan = rangeInput.parentNode.querySelector('.range-value');
  if (valueSpan) {
    valueSpan.textContent = rangeInput.value;
  }
}

// Toast notifications
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  // Add toast styles
  toast.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    background: ${type === 'success' ? '#48bb78' : type === 'warning' ? '#ed8936' : '#4c51bf'};
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    z-index: 3000;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add CSS animations for toasts
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Request notification permission on load
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
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
