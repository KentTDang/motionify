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
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
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
