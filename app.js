'use strict';

// =============================================
// CONFIG
// =============================================
const BACKEND_URL = (typeof window !== 'undefined' && window.BACKEND_URL)
  || 'https://your-railway-app.up.railway.app';

const PROMPTS = [
  { n: 1, text: 'In one word, describe Sharon', limit: 10 },
  { n: 2, text: 'What are you most grateful for about Sharon?', limit: 60 },
  { n: 3, text: 'Share your wishes for Sharon!', limit: 60 },
  { n: 4, text: 'Say "Happy Birthday Sharon!" 🎂', limit: 10 },
];

// =============================================
// STATE
// =============================================
const state = {
  session: null,          // { firstName, lastName, location, identifier, completedPrompts, photoCount, timestamps }
  currentPrompt: null,    // prompt config { n, text, limit }
  pendingRetakePrompt: null,
  mediaStream: null,
  mediaRecorder: null,
  recordedChunks: [],
  recordedBlob: null,
  recordedMimeType: '',
  timerInterval: null,
  playbackUrl: null,
  photoFiles: [],
};

// =============================================
// UTILITIES
// =============================================
function $(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (el) {
    el.classList.add('active');
    el.scrollTop = 0;
  }
}

function showOverlay(id) {
  const el = $(id);
  if (el) el.classList.add('active');
}

function hideOverlay(id) {
  const el = $(id);
  if (el) el.classList.remove('active');
}

function showError(msg) {
  const el = $('error-toast');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.remove('visible'), 5000);
}

function showLoading(show, msg) {
  const el = $('overlay-loading');
  if (show) {
    el.querySelector('.loading-text').textContent = msg || 'Loading...';
    el.classList.add('active');
  } else {
    el.classList.remove('active');
  }
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('Too many requests. Please wait a moment and try again.');
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return res.json();
}

// =============================================
// INIT
// =============================================
async function init() {
  if (!localStorage.getItem('sharon_oath')) {
    showOverlay('overlay-oath');
    return;
  }
  afterOath();
}

// =============================================
// OATH
// =============================================
function swear() {
  localStorage.setItem('sharon_oath', '1');
  hideOverlay('overlay-oath');
  afterOath();
}

function iAmSharon() {
  window.location.href =
    'https://www.quora.com/What-is-the-best-way-to-act-surprised-when-someone-tells-you-something-you-already-knew-but-were-not-supposed-to-know';
}

async function afterOath() {
  if (isDesktop()) {
    showScreen('screen-desktop');
    return;
  }
  await checkDeadline();
}

// =============================================
// DEVICE CHECK
// =============================================
function isDesktop() {
  return window.innerWidth > 1024 || (window.screen && window.screen.width > 1024);
}

// =============================================
// DEADLINE CHECK
// =============================================
async function checkDeadline() {
  try {
    showLoading(true, 'Checking...');
    const data = await apiFetch('/deadline');
    showLoading(false);
    if (new Date() > new Date(data.deadline)) {
      showScreen('screen-closed');
      return;
    }
  } catch (e) {
    showLoading(false);
    console.warn('Deadline check failed, continuing:', e.message);
    // Non-blocking — don't stop users if backend is unreachable
  }

  // Restore session if available
  try {
    const saved = localStorage.getItem('sharon_session');
    if (saved) {
      state.session = JSON.parse(saved);
      showDashboard();
      return;
    }
  } catch (e) {
    localStorage.removeItem('sharon_session');
  }

  showScreen('screen-form');
}

// =============================================
// REGISTRATION FORM
// =============================================
async function submitForm() {
  const firstName = $('input-firstname').value.trim();
  const lastName = $('input-lastname').value.trim();
  const location = $('input-location').value.trim();

  if (!firstName || !lastName || !location) {
    showError('Please fill in all fields.');
    return;
  }

  try {
    showLoading(true, 'Getting started...');
    const data = await apiFetch('/session', {
      method: 'POST',
      body: JSON.stringify({ firstName, lastName, location }),
    });
    showLoading(false);

    state.session = {
      firstName,
      lastName,
      location,
      identifier: data.identifier,
      completedPrompts: data.completedPrompts || [],
      photoCount: data.photoCount || 0,
      timestamps: data.timestamps || {},
    };
    localStorage.setItem('sharon_session', JSON.stringify(state.session));
    showDashboard();
  } catch (e) {
    showLoading(false);
    showError(e.message);
  }
}

// =============================================
// DASHBOARD
// =============================================
function showDashboard() {
  renderDashboard();
  showScreen('screen-dashboard');
}

function renderDashboard() {
  const { completedPrompts, firstName, photoCount, timestamps } = state.session;

  $('dashboard-greeting').textContent = `Hey ${firstName}! 👋`;

  const container = $('cards-container');
  container.innerHTML = '';

  // Video prompt cards 1–4
  PROMPTS.forEach((prompt) => {
    const n = prompt.n;
    const completed = completedPrompts.includes(n);
    const unlocked = n === 1 || completedPrompts.includes(n - 1);

    const card = document.createElement('div');
    card.className = `card${completed ? ' completed' : ''}${!unlocked ? ' locked' : ''}`;

    let icon = '🔒';
    if (completed) icon = '✅';
    else if (unlocked) icon = '🎥';

    let metaHtml = '';
    if (completed && timestamps && timestamps[n]) {
      const hrs = Math.floor((Date.now() - new Date(timestamps[n]).getTime()) / 3600000);
      const agoStr = hrs < 1 ? 'just now' : hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
      metaHtml = `<div class="card-meta">Recorded ${agoStr}</div>`;
    } else if (!unlocked) {
      metaHtml = `<div class="card-meta">Complete prompt ${n - 1} first</div>`;
    }

    card.innerHTML = `
      <div class="card-icon">${icon}</div>
      <div class="card-content">
        <div class="card-title">Prompt ${n}</div>
        <div class="card-subtitle">${prompt.text}</div>
        ${metaHtml}
      </div>
      <div class="card-arrow">${unlocked ? '›' : ''}</div>
    `;

    if (unlocked) {
      card.addEventListener('click', () => handlePromptCardTap(n, completed));
    }

    container.appendChild(card);
  });

  // Photo card (unlocks after all 4 prompts)
  const allVideoDone = [1, 2, 3, 4].every(n => completedPrompts.includes(n));
  const photoCompleted = (photoCount || 0) > 0;
  const photoUnlocked = allVideoDone;

  const photoCard = document.createElement('div');
  photoCard.className = `card${photoCompleted ? ' completed' : ''}${!photoUnlocked ? ' locked' : ''}`;
  photoCard.innerHTML = `
    <div class="card-icon">${photoCompleted ? '✅' : photoUnlocked ? '📸' : '🔒'}</div>
    <div class="card-content">
      <div class="card-title">Photos with Sharon</div>
      <div class="card-subtitle">Share your favourite moments</div>
      ${photoCompleted ? `<div class="card-meta">${photoCount} photo${photoCount !== 1 ? 's' : ''} uploaded</div>` : ''}
      ${!photoUnlocked ? '<div class="card-meta">Complete all prompts first</div>' : ''}
    </div>
    <div class="card-arrow">${photoUnlocked ? '›' : ''}</div>
  `;

  if (photoUnlocked) {
    photoCard.addEventListener('click', () => showPhotos());
  }

  container.appendChild(photoCard);

  // Show celebration button once all 4 video prompts done
  $('btn-all-done').style.display = allVideoDone ? 'flex' : 'none';
}

function handlePromptCardTap(n, completed) {
  if (completed) {
    state.pendingRetakePrompt = n;
    showOverlay('overlay-retake');
  } else {
    startPromptRecording(n);
  }
}

function confirmRetake() {
  hideOverlay('overlay-retake');
  if (state.pendingRetakePrompt) {
    startPromptRecording(state.pendingRetakePrompt);
    state.pendingRetakePrompt = null;
  }
}

function cancelRetake() {
  hideOverlay('overlay-retake');
  state.pendingRetakePrompt = null;
}

// =============================================
// RECORDING FLOW
// =============================================
async function startPromptRecording(n) {
  state.currentPrompt = PROMPTS.find(p => p.n === n);

  $('recording-prompt-label').textContent = `Prompt ${n} of 4`;
  $('recording-prompt-text').textContent = state.currentPrompt.text;
  $('recording-hint').textContent = 'Tap the button to start recording';

  showScreen('screen-recording');
  await initCamera();
}

async function initCamera() {
  try {
    // Stop any existing stream
    stopMediaStream();

    state.mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 720 },
        height: { ideal: 1280 },
        facingMode: 'user',
        aspectRatio: { ideal: 9 / 16 },
      },
      audio: true,
    });

    const preview = $('camera-preview');
    preview.srcObject = state.mediaStream;
    await preview.play();

    // Reset UI
    $('btn-record').style.display = 'flex';
    $('btn-stop').style.display = 'none';
    $('recording-timer').style.display = 'none';
    $('recording-timer').classList.remove('urgent');

    setupOrientationCheck();
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError' || e.name === 'NotFoundError') {
      stopMediaStream();
      showScreen('screen-camera-denied');
    } else {
      showError('Could not access camera: ' + e.message);
      showDashboard();
    }
  }
}

function setupOrientationCheck() {
  checkOrientation();
  window.addEventListener('resize', checkOrientation);
  if (window.screen && window.screen.orientation) {
    window.screen.orientation.addEventListener('change', checkOrientation);
  }
}

function cleanupOrientationCheck() {
  window.removeEventListener('resize', checkOrientation);
  if (window.screen && window.screen.orientation) {
    window.screen.orientation.removeEventListener('change', checkOrientation);
  }
  hideOverlay('overlay-rotate');
}

function checkOrientation() {
  const isLandscape = window.innerWidth > window.innerHeight;
  if (isLandscape) {
    showOverlay('overlay-rotate');
  } else {
    hideOverlay('overlay-rotate');
  }
}

function startRecording() {
  if (!state.mediaStream) return;

  // Block in landscape
  if (window.innerWidth > window.innerHeight) {
    showOverlay('overlay-rotate');
    return;
  }

  state.recordedChunks = [];

  const mimeType = getSupportedMimeType();
  state.recordedMimeType = mimeType;

  const options = mimeType ? { mimeType } : {};
  state.mediaRecorder = new MediaRecorder(state.mediaStream, options);

  state.mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      state.recordedChunks.push(e.data);
    }
  };

  state.mediaRecorder.onstop = () => {
    const blob = new Blob(state.recordedChunks, { type: mimeType || 'video/webm' });
    state.recordedBlob = blob;
    showPlayback(blob);
  };

  state.mediaRecorder.start(100);

  // UI
  $('btn-record').style.display = 'none';
  $('btn-stop').style.display = 'inline-flex';
  $('recording-hint').textContent = '';

  const timer = $('recording-timer');
  timer.style.display = 'block';
  timer.classList.remove('urgent');

  let remaining = state.currentPrompt.limit;
  updateTimerDisplay(remaining);

  state.timerInterval = setInterval(() => {
    remaining--;
    updateTimerDisplay(remaining);
    if (remaining <= 0) {
      clearInterval(state.timerInterval);
      stopRecording();
    }
  }, 1000);
}

function stopRecording() {
  clearInterval(state.timerInterval);
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
  $('btn-record').style.display = 'none';
  $('btn-stop').style.display = 'none';
}

function updateTimerDisplay(remaining) {
  const el = $('recording-timer');
  el.textContent = remaining + 's';
  el.classList.toggle('urgent', remaining <= 3);
}

function getSupportedMimeType() {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function cancelRecording() {
  clearInterval(state.timerInterval);
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
  cleanupOrientationCheck();
  stopMediaStream();
  showDashboard();
}

// =============================================
// PLAYBACK
// =============================================
function showPlayback(blob) {
  cleanupOrientationCheck();

  if (state.playbackUrl) {
    URL.revokeObjectURL(state.playbackUrl);
  }
  const url = URL.createObjectURL(blob);
  state.playbackUrl = url;

  const video = $('playback-video');
  video.src = url;
  video.play().catch(() => {});

  showScreen('screen-playback');
}

function retakeVideo() {
  if (state.playbackUrl) {
    URL.revokeObjectURL(state.playbackUrl);
    state.playbackUrl = null;
  }
  const video = $('playback-video');
  video.src = '';

  state.recordedBlob = null;
  state.recordedChunks = [];

  startPromptRecording(state.currentPrompt.n);
}

async function confirmVideo() {
  if (!state.recordedBlob) return;

  // Enforce 50MB max
  if (state.recordedBlob.size > 50 * 1024 * 1024) {
    showError('Video is too large (max 50MB). Please record a shorter clip.');
    return;
  }

  // Revoke playback URL
  if (state.playbackUrl) {
    URL.revokeObjectURL(state.playbackUrl);
    state.playbackUrl = null;
  }
  $('playback-video').src = '';

  // Reset upload UI
  $('upload-progress-bar').style.width = '0%';
  $('upload-percent').textContent = '0%';
  $('upload-status').textContent = '';
  showScreen('screen-uploading');

  try {
    // 1. Get presigned URL
    $('upload-status').textContent = 'Preparing upload...';
    const presignData = await apiFetch('/presign', {
      method: 'POST',
      body: JSON.stringify({
        identifier: state.session.identifier,
        prompt: state.currentPrompt.n,
      }),
    });

    // 2. Upload blob to S3
    $('upload-status').textContent = 'Uploading your clip...';
    await uploadToS3(state.recordedBlob, presignData.uploadUrl, (progress) => {
      $('upload-progress-bar').style.width = (progress * 100) + '%';
      $('upload-percent').textContent = Math.round(progress * 100) + '%';
    });

    // 3. Notify backend
    $('upload-status').textContent = 'Saving...';
    const result = await apiFetch('/submit-clip', {
      method: 'POST',
      body: JSON.stringify({
        identifier: state.session.identifier,
        prompt: state.currentPrompt.n,
        s3Key: presignData.s3Key,
      }),
    });

    // 4. Update local session
    state.session.completedPrompts = result.completedPrompts || state.session.completedPrompts;
    if (!state.session.timestamps) state.session.timestamps = {};
    state.session.timestamps[state.currentPrompt.n] = new Date().toISOString();
    localStorage.setItem('sharon_session', JSON.stringify(state.session));

    stopMediaStream();
    cleanupOrientationCheck();
    state.recordedBlob = null;

    showDashboard();
  } catch (e) {
    showError(e.message);
    // Restore playback screen with blob
    if (state.recordedBlob) {
      const url = URL.createObjectURL(state.recordedBlob);
      state.playbackUrl = url;
      $('playback-video').src = url;
      $('playback-video').play().catch(() => {});
    }
    showScreen('screen-playback');
  }
}

async function uploadToS3(blob, uploadUrl, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status}). Please try again.`));
      }
    });
    xhr.addEventListener('error', () =>
      reject(new Error('Upload failed. Please check your connection.'))
    );
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', blob.type || 'video/webm');
    xhr.send(blob);
  });
}

function stopMediaStream() {
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(t => t.stop());
    state.mediaStream = null;
  }
  const preview = $('camera-preview');
  if (preview) preview.srcObject = null;
}

// =============================================
// PHOTO UPLOAD
// =============================================
function showPhotos() {
  $('photos-list').innerHTML = '';
  state.photoFiles = [];
  showScreen('screen-photos');
}

function triggerPhotoInput() {
  $('photo-file-input').click();
}

function handlePhotoSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    showError('Photo is too large (max 10MB).');
    event.target.value = '';
    return;
  }

  addPhotoToList(file);
  event.target.value = '';
}

function addPhotoToList(file) {
  const id = Date.now();
  const blobUrl = URL.createObjectURL(file);

  state.photoFiles.push({ id, file, blobUrl });

  const item = document.createElement('div');
  item.className = 'photo-item';
  item.id = `photo-item-${id}`;
  item.innerHTML = `
    <img src="${blobUrl}" alt="Photo preview" class="photo-thumb">
    <div class="photo-wish-row">
      <input type="text" class="input" id="wish-${id}" placeholder="Add a wish for Sharon (optional)">
    </div>
    <button class="btn btn-primary photo-upload-btn" id="btn-upload-${id}" onclick="uploadPhoto(${id})">
      Upload Photo
    </button>
    <div class="photo-status" id="photo-status-${id}"></div>
  `;

  $('photos-list').appendChild(item);
}

async function uploadPhoto(id) {
  const photoData = state.photoFiles.find(p => p.id === id);
  if (!photoData) return;

  const wish = ($(`wish-${id}`) || {}).value?.trim() || '';
  const statusEl = $(`photo-status-${id}`);
  const btn = $(`btn-upload-${id}`);

  if (btn) btn.disabled = true;
  statusEl.textContent = 'Preparing...';

  try {
    // Get presigned URL
    const presignData = await apiFetch('/presign-photo', {
      method: 'POST',
      body: JSON.stringify({ identifier: state.session.identifier }),
    });

    // Upload to S3
    statusEl.textContent = 'Uploading...';
    await uploadToS3(photoData.file, presignData.uploadUrl, (progress) => {
      statusEl.textContent = `Uploading... ${Math.round(progress * 100)}%`;
    });

    // Notify backend
    await apiFetch('/submit-photo', {
      method: 'POST',
      body: JSON.stringify({
        identifier: state.session.identifier,
        s3Key: presignData.s3Key,
        wish,
      }),
    });

    // Update local state
    state.session.photoCount = (state.session.photoCount || 0) + 1;
    localStorage.setItem('sharon_session', JSON.stringify(state.session));

    URL.revokeObjectURL(photoData.blobUrl);
    statusEl.textContent = '✅ Uploaded!';
    statusEl.style.color = 'var(--success)';
    if (btn) btn.style.display = 'none';
  } catch (e) {
    statusEl.textContent = '❌ ' + e.message;
    if (btn) btn.disabled = false;
  }
}

// =============================================
// THANK YOU
// =============================================
function showThankyou() {
  const { photoCount } = state.session;
  const photos = photoCount || 0;
  $('thankyou-summary').textContent =
    `You recorded 4 clips and uploaded ${photos} photo${photos !== 1 ? 's' : ''} 🎉`;
  showScreen('screen-thankyou');
  launchConfetti();
}

function copyShareText() {
  const text = "I've added my message for Sharon! 🎂";
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showError('Copied! ✅'));
  } else {
    // Fallback
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showError('Copied! ✅');
  }
}

// =============================================
// CONFETTI
// =============================================
function launchConfetti() {
  const container = $('confetti-container');
  const colors = ['#e91e8c', '#7b2d8b', '#fbbf24', '#22c55e', '#60a5fa', '#f97316'];

  for (let i = 0; i < 120; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'confetti-particle';
      const size = Math.random() * 8 + 5;
      p.style.cssText = `
        left: ${Math.random() * 100}vw;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        width: ${size}px;
        height: ${size}px;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation-duration: ${Math.random() * 2 + 1.5}s;
        animation-delay: ${Math.random() * 0.3}s;
        opacity: 1;
      `;
      container.appendChild(p);
      setTimeout(() => p.remove(), 4000);
    }, i * 15);
  }
}

// =============================================
// BOOT
// =============================================
document.addEventListener('DOMContentLoaded', init);
