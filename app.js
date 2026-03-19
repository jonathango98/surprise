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
  selectedFile: null,     // File object chosen for upload
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
  showOverlay('overlay-oath');
}

// =============================================
// OATH
// =============================================
function swear() {
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

    const card = document.createElement('div');
    card.className = `card${completed ? ' completed' : ''}`;

    let metaHtml = '';
    if (completed && timestamps && timestamps[n]) {
      const hrs = Math.floor((Date.now() - new Date(timestamps[n]).getTime()) / 3600000);
      const agoStr = hrs < 1 ? 'just now' : hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
      metaHtml = `<div class="card-meta">Uploaded ${agoStr}</div>`;
    }

    card.innerHTML = `
      <div class="card-icon">${completed ? '✅' : '🎥'}</div>
      <div class="card-content">
        <div class="card-title">Prompt ${n} <span style="font-weight:400;opacity:0.6;font-size:0.85em;">(${prompt.limit}s)</span></div>
        <div class="card-subtitle">${prompt.text}</div>
        ${metaHtml}
      </div>
      <div class="card-arrow">›</div>
    `;

    card.addEventListener('click', () => handlePromptCardTap(n, completed));
    container.appendChild(card);
  });

  // Photo card (always unlocked)
  const photoCompleted = (photoCount || 0) > 0;

  const photoCard = document.createElement('div');
  photoCard.className = `card${photoCompleted ? ' completed' : ''}`;
  photoCard.innerHTML = `
    <div class="card-icon">${photoCompleted ? '✅' : '📸'}</div>
    <div class="card-content">
      <div class="card-title">Photos with Sharon</div>
      <div class="card-subtitle">Share your favourite moments</div>
      ${photoCompleted ? `<div class="card-meta">${photoCount} photo${photoCount !== 1 ? 's' : ''} uploaded</div>` : ''}
    </div>
    <div class="card-arrow">›</div>
  `;

  photoCard.addEventListener('click', () => showPhotos());
  container.appendChild(photoCard);

  // Show celebration button once all 4 video prompts done
  const allVideoDone = [1, 2, 3, 4].every(n => completedPrompts.includes(n));
  $('btn-all-done').style.display = allVideoDone ? 'flex' : 'none';
}

function handlePromptCardTap(n, completed) {
  if (completed) {
    state.pendingRetakePrompt = n;
    showOverlay('overlay-retake');
  } else {
    startPromptUpload(n);
  }
}

function confirmRetake() {
  hideOverlay('overlay-retake');
  if (state.pendingRetakePrompt) {
    startPromptUpload(state.pendingRetakePrompt);
    state.pendingRetakePrompt = null;
  }
}

function cancelRetake() {
  hideOverlay('overlay-retake');
  state.pendingRetakePrompt = null;
}

// =============================================
// VIDEO UPLOAD FLOW
// =============================================
function startPromptUpload(n) {
  state.currentPrompt = PROMPTS.find(p => p.n === n);
  state.selectedFile = null;

  if (state.playbackUrl) {
    URL.revokeObjectURL(state.playbackUrl);
    state.playbackUrl = null;
  }

  $('upload-prompt-label').textContent = `Prompt ${n} of 4`;
  $('upload-prompt-text').textContent = state.currentPrompt.text;
  $('upload-duration-hint').textContent = `Keep it under ${state.currentPrompt.limit}s`;

  // Reset UI
  $('upload-preview-video').style.display = 'none';
  $('upload-preview-video').src = '';
  $('upload-rules').style.display = '';
  $('rules-time-limit').innerHTML = `⏱️ Keep it under <strong style="color:#fff;">${state.currentPrompt.limit} seconds</strong>`;
  $('upload-requirements').style.display = 'none';
  $('btn-confirm-upload').style.display = 'none';
  $('btn-record-video').textContent = '🎥 Record video';
  $('btn-record-video').style.display = '';

  showScreen('screen-upload');
}

function cancelUpload() {
  if (state.playbackUrl) {
    URL.revokeObjectURL(state.playbackUrl);
    state.playbackUrl = null;
  }
  state.selectedFile = null;
  showDashboard();
}

function getVideoMetadata(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve({
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
    });
    video.onerror = () => reject(new Error('Failed to load video'));
    video.src = url;
  });
}

// =============================================
// IN-BROWSER CAMERA RECORDING
// =============================================
let cameraStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recTimerInterval = null;
let recStartTime = 0;
let canvasStream = null;
let canvasAnimFrame = null;

// Landscape orientation warning
function checkLandscapeWarning() {
  const warning = $('landscape-warning');
  if (!warning) return;
  const isRecordingScreen = $('screen-camera-record').classList.contains('active');
  if (!isRecordingScreen) {
    warning.style.display = 'none';
    return;
  }
  const isLandscape = window.innerWidth > window.innerHeight;
  warning.style.display = isLandscape ? 'flex' : 'none';
}
window.addEventListener('orientationchange', () => setTimeout(checkLandscapeWarning, 100));
window.addEventListener('resize', checkLandscapeWarning);

async function startCameraRecording() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true,
    });

    const videoEl = document.createElement('video');
    videoEl.srcObject = cameraStream;
    videoEl.setAttribute('playsinline', '');
    videoEl.muted = true;
    await videoEl.play();

    // Wait for actual dimensions
    await new Promise(resolve => {
      if (videoEl.videoWidth) return resolve();
      videoEl.addEventListener('loadedmetadata', resolve, { once: true });
    });

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    const isLandscape = vw > vh;

    // Canvas dimensions: always portrait
    const canvas = $('camera-canvas');
    const cw = isLandscape ? vh : vw;
    const ch = isLandscape ? vw : vh;
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.display = 'block';
    $('camera-live-preview').style.display = 'none';

    const ctx = canvas.getContext('2d');

    function drawFrame() {
      ctx.save();
      if (isLandscape) {
        // Rotate landscape stream to portrait + mirror for front camera
        ctx.translate(cw / 2, ch / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.scale(-1, 1); // mirror
        ctx.drawImage(videoEl, -ch / 2, -cw / 2, ch, cw);
      } else {
        // Already portrait, just mirror for front camera
        ctx.translate(cw, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoEl, 0, 0, cw, ch);
      }
      ctx.restore();
      canvasAnimFrame = requestAnimationFrame(drawFrame);
    }
    drawFrame();

    // Build a combined stream: canvas video + mic audio
    canvasStream = canvas.captureStream(30);
    const audioTracks = cameraStream.getAudioTracks();
    audioTracks.forEach(t => canvasStream.addTrack(t));

    $('camera-rec-prompt').textContent = state.currentPrompt.text;
    $('camera-rec-timer').style.display = 'none';
    $('camera-rec-hint').textContent = 'Tap to start recording';
    $('camera-rec-inner').style.borderRadius = '50%';
    $('camera-rec-inner').style.width = '28px';
    $('camera-rec-inner').style.height = '28px';
    mediaRecorder = null;
    recordedChunks = [];
    $('screen-camera-record').classList.add('active');
    checkLandscapeWarning();
  } catch (e) {
    alert('Could not access camera. Please allow camera access or use "Choose from library" instead.');
  }
}

function toggleCameraRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    // Start recording from the canvas stream (portrait)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';
    mediaRecorder = new MediaRecorder(canvasStream, { mimeType });
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => finishCameraRecording();
    mediaRecorder.start(100);
    recStartTime = Date.now();
    $('camera-rec-timer').style.display = 'block';
    $('camera-rec-hint').textContent = 'Tap to stop';
    $('camera-rec-inner').style.borderRadius = '4px';
    $('camera-rec-inner').style.width = '24px';
    $('camera-rec-inner').style.height = '24px';
    recTimerInterval = setInterval(updateRecTimer, 500);
  } else {
    // Stop recording
    mediaRecorder.stop();
    clearInterval(recTimerInterval);
  }
}

function updateRecTimer() {
  const elapsed = Math.floor((Date.now() - recStartTime) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  $('camera-rec-timer').textContent = `${m}:${s.toString().padStart(2, '0')}`;

  // Auto-stop if over 120% of the limit
  const maxSec = Math.ceil(state.currentPrompt.limit * 1.2);
  if (elapsed >= maxSec && mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    clearInterval(recTimerInterval);
  }
}

function finishCameraRecording() {
  const recDuration = (Date.now() - recStartTime) / 1000;
  stopCameraStream();
  const blob = new Blob(recordedChunks, { type: recordedChunks[0]?.type || 'video/mp4' });
  const file = new File([blob], 'recording.webm', { type: blob.type });

  // Feed the recorded file into the existing upload flow
  state.selectedFile = file;
  if (state.playbackUrl) URL.revokeObjectURL(state.playbackUrl);
  const url = URL.createObjectURL(blob);
  state.playbackUrl = url;

  $('screen-camera-record').classList.remove('active');

  // Show preview in upload screen
  const previewVideo = $('upload-preview-video');
  previewVideo.src = url;
  previewVideo.style.display = 'block';

  $('upload-rules').style.display = 'none';
  $('upload-requirements').style.display = 'block';
  $('btn-record-video').textContent = '🔄 Re-record';
  $('btn-record-video').style.display = '';

  // Run validation (pass known duration since MediaRecorder blobs often lack it)
  validateRecordedVideo(file, url, recDuration);
}

async function validateRecordedVideo(file, url, knownDuration) {
  $('req-size').textContent = '⏳ Checking size...';
  $('req-portrait').textContent = '⏳ Checking orientation...';
  $('req-duration').textContent = '⏳ Checking duration...';
  $('btn-confirm-upload').style.display = 'none';

  const MAX_BYTES = 50 * 1024 * 1024;
  const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
  const sizeOk = file.size <= MAX_BYTES;
  $('req-size').textContent = sizeOk
    ? `✅ Size: ${sizeMB} MB (under 50 MB)`
    : `❌ Too large: ${sizeMB} MB — max is 50 MB`;

  let portraitOk = false;
  let durationOk = false;
  try {
    const meta = await getVideoMetadata(url);
    const limitSec = state.currentPrompt.limit;
    portraitOk = meta.height >= meta.width;
    $('req-portrait').textContent = portraitOk
      ? `✅ Portrait (${meta.width}×${meta.height})`
      : `❌ Not portrait (${meta.width}×${meta.height})`;
    const duration = (isFinite(meta.duration) && meta.duration > 0) ? meta.duration : knownDuration;
    const maxDuration = Math.ceil(limitSec * 1.2);
    const durSec = Math.ceil(duration);
    durationOk = duration <= maxDuration;
    $('req-duration').textContent = durationOk
      ? `✅ Duration: ${durSec}s (limit ~${limitSec}s)`
      : `❌ Too long: ${durSec}s — keep it under ${limitSec}s`;
  } catch (e) {
    $('req-portrait').textContent = '❌ Could not read video info';
    $('req-duration').textContent = '';
  }

  if (sizeOk && portraitOk && durationOk) {
    $('btn-confirm-upload').style.display = 'flex';
  }
}

function cancelCameraRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  clearInterval(recTimerInterval);
  stopCameraStream();
  recordedChunks = [];
  $('screen-camera-record').classList.remove('active');
}

function stopCameraStream() {
  if (canvasAnimFrame) {
    cancelAnimationFrame(canvasAnimFrame);
    canvasAnimFrame = null;
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  canvasStream = null;
  $('camera-live-preview').srcObject = null;
  $('camera-live-preview').style.display = '';
  $('camera-canvas').style.display = 'none';
}

async function confirmVideo() {
  if (!state.selectedFile) return;

  if (state.selectedFile.size > 50 * 1024 * 1024) {
    showError('Video is too large (max 50 MB). Please choose a smaller file.');
    return;
  }

  if (state.playbackUrl) {
    URL.revokeObjectURL(state.playbackUrl);
    state.playbackUrl = null;
  }
  $('upload-preview-video').src = '';

  // Reset upload progress UI
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

    // 2. Upload file to S3
    $('upload-status').textContent = 'Uploading your clip...';
    await uploadToS3(state.selectedFile, presignData.uploadUrl, (progress) => {
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

    state.selectedFile = null;
    showDashboard();
  } catch (e) {
    showError(e.message);
    // Restore upload screen with preview
    if (state.selectedFile) {
      const url = URL.createObjectURL(state.selectedFile);
      state.playbackUrl = url;
      $('upload-preview-video').src = url;
      $('upload-preview-video').style.display = 'block';
    }
    showScreen('screen-upload');
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
    `You uploaded 4 clips and ${photos} photo${photos !== 1 ? 's' : ''} 🎉`;
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
// LOGOUT
// =============================================
function logout() {
  if (state.playbackUrl) {
    URL.revokeObjectURL(state.playbackUrl);
    state.playbackUrl = null;
  }
  state.session = null;
  state.selectedFile = null;
  localStorage.removeItem('sharon_session');
  showScreen('screen-form');
}

// =============================================
// BOOT
// =============================================
document.addEventListener('DOMContentLoaded', init);
