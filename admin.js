'use strict';

// =============================================
// CONFIG
// =============================================
const BACKEND_URL = (typeof window !== 'undefined' && window.BACKEND_URL)
  || 'https://your-railway-app.up.railway.app';

// =============================================
// STATE
// =============================================
let adminToken = null;
let submissions = [];
let expandedRow = null;
let sortKey = 'submittedAt';
let sortDir = 'desc';

// =============================================
// UTILITIES
// =============================================
function $(id) { return document.getElementById(id); }

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
  const headers = {
    'Content-Type': 'application/json',
    ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${BACKEND_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    adminLogout();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return res.json();
}

function formatDatetime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function toLocalDatetimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  // Format: YYYY-MM-DDTHH:MM
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('sharon_admin_token');
  if (saved) {
    adminToken = saved;
    showDashboard();
  } else {
    showLogin();
  }
});

// =============================================
// LOGIN / LOGOUT
// =============================================
function showLogin() {
  $('view-login').style.display = 'flex';
  $('view-dashboard').style.display = 'none';
}

async function adminLogin() {
  const password = $('admin-password').value;
  if (!password) return;

  try {
    showLoading(true, 'Logging in...');
    const data = await apiFetch('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    showLoading(false);
    adminToken = data.token;
    localStorage.setItem('sharon_admin_token', adminToken);
    showDashboard();
  } catch (e) {
    showLoading(false);
    showError(e.message);
  }
}

function adminLogout() {
  adminToken = null;
  localStorage.removeItem('sharon_admin_token');
  showLogin();
}

// =============================================
// DASHBOARD
// =============================================
async function showDashboard() {
  $('view-login').style.display = 'none';
  $('view-dashboard').style.display = 'block';

  try {
    showLoading(true, 'Loading dashboard...');
    await Promise.all([
      loadDeadline(),
      loadSubmissions(),
    ]);
    showLoading(false);
  } catch (e) {
    showLoading(false);
    showError(e.message);
  }
}

// =============================================
// DEADLINE
// =============================================
async function loadDeadline() {
  const data = await apiFetch('/admin/deadline');
  const deadline = data.deadline;
  $('current-deadline').textContent = deadline ? formatDatetime(deadline) : 'Not set';
  $('deadline-input').value = toLocalDatetimeInput(deadline);
}

async function setDeadline() {
  const val = $('deadline-input').value;
  if (!val) {
    showError('Please select a date and time.');
    return;
  }
  const iso = new Date(val).toISOString();
  try {
    showLoading(true, 'Updating...');
    await apiFetch('/admin/deadline', {
      method: 'POST',
      body: JSON.stringify({ deadline: iso }),
    });
    showLoading(false);
    $('current-deadline').textContent = formatDatetime(iso);
    showError('✅ Deadline updated!');
  } catch (e) {
    showLoading(false);
    showError(e.message);
  }
}

// =============================================
// SUBMISSIONS
// =============================================
async function loadSubmissions() {
  const data = await apiFetch('/admin/submissions');
  submissions = data;
  renderStats(submissions);
  renderSubmissions(submissions);
}

function renderStats(subs) {
  $('stat-contributors').textContent = subs.length;
  $('stat-p1').textContent = subs.filter(s => s.completedPrompts?.includes(1)).length;
  $('stat-p2').textContent = subs.filter(s => s.completedPrompts?.includes(2)).length;
  $('stat-p3').textContent = subs.filter(s => s.completedPrompts?.includes(3)).length;
  $('stat-p4').textContent = subs.filter(s => s.completedPrompts?.includes(4)).length;
  $('stat-photos').textContent = subs.reduce((acc, s) => acc + (s.photoCount || 0), 0);
}

function sortedSubmissions(subs) {
  return [...subs].sort((a, b) => {
    let va, vb;
    if (sortKey === 'name') {
      va = `${a.firstName} ${a.lastName}`.toLowerCase();
      vb = `${b.firstName} ${b.lastName}`.toLowerCase();
    } else if (sortKey === 'submittedAt') {
      va = new Date(a.submittedAt).getTime();
      vb = new Date(b.submittedAt).getTime();
    } else if (sortKey === 'photos') {
      va = a.photoCount || 0;
      vb = b.photoCount || 0;
    } else {
      return 0;
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
}

function setSort(key) {
  if (sortKey === key) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey = key;
    sortDir = key === 'submittedAt' ? 'desc' : 'asc';
  }
  renderSubmissions(submissions);
}

function populateUploadDropdown(subs) {
  const select = $('upload-identifier');
  const current = select.value;
  select.innerHTML = '<option value="">Select account...</option>';
  sortedSubmissions(subs).forEach(sub => {
    const opt = document.createElement('option');
    opt.value = sub.identifier;
    opt.textContent = `${sub.firstName} ${sub.lastName} (${sub.identifier})`;
    select.appendChild(opt);
  });
  if (current) select.value = current;
}

function renderSubmissions(subs) {
  populateUploadDropdown(subs);
  const tbody = $('submissions-tbody');
  tbody.innerHTML = '';

  // Update header sort indicators
  ['name', 'submittedAt', 'photos'].forEach(key => {
    const th = $(`th-${key}`);
    if (!th) return;
    const arrow = th.querySelector('.sort-arrow');
    if (sortKey === key) {
      arrow.textContent = sortDir === 'asc' ? ' ▲' : ' ▼';
    } else {
      arrow.textContent = ' ⇅';
    }
  });

  if (!subs.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">No submissions yet</td></tr>';
    return;
  }

  sortedSubmissions(subs).forEach((sub) => {
    const completed = sub.completedPrompts || [];

    // Main row
    const tr = document.createElement('tr');
    tr.className = 'expandable';
    tr.dataset.identifier = sub.identifier;

    const dotsHtml = [1, 2, 3, 4].map(n =>
      `<div class="prompt-dot${completed.includes(n) ? ' done' : ''}">${n}</div>`
    ).join('');

    tr.innerHTML = `
      <td><strong>${sub.firstName} ${sub.lastName}</strong></td>
      <td style="white-space:nowrap;">${formatDatetime(sub.submittedAt)}</td>
      <td><div class="prompt-dots">${dotsHtml}</div></td>
      <td>${sub.photoCount || 0}</td>
      <td><button class="btn btn-danger btn-sm" style="padding:0.2rem 0.5rem;font-size:0.75rem;min-width:auto;" onclick="event.stopPropagation(); deleteSubmission('${sub.identifier}', '${sub.firstName} ${sub.lastName}')">Delete</button></td>
    `;

    tr.addEventListener('click', () => toggleExpanded(sub.identifier, tr));
    tbody.appendChild(tr);

    // Expanded row (hidden by default)
    const expandTr = document.createElement('tr');
    expandTr.id = `expand-${sub.identifier}`;
    expandTr.style.display = 'none';
    expandTr.innerHTML = '<td colspan="6"><div class="expanded-row-inner" style="padding:1rem 0;color:var(--text-muted);font-size:0.85rem;">Loading details...</div></td>';
    tbody.appendChild(expandTr);
  });
}

async function toggleExpanded(identifier, triggerRow) {
  const expandTr = $(`expand-${identifier}`);
  if (!expandTr) return;

  const isOpen = expandTr.style.display !== 'none';

  // Close all
  document.querySelectorAll('[id^="expand-"]').forEach(el => {
    el.style.display = 'none';
  });

  if (isOpen) return;

  // Open this one
  expandTr.style.display = '';
  const inner = expandTr.querySelector('.expanded-row-inner');

  try {
    const data = await apiFetch(`/admin/submission/${identifier}`);
    renderExpandedRow(inner, data);
  } catch (e) {
    inner.textContent = 'Failed to load: ' + e.message;
  }
}

function renderExpandedRow(container, data) {
  const clips = data.clips || {};
  const photos = data.photos || [];
  const identifier = data.identifier;

  let html = '<div style="padding:0 0.75rem;">';

  // Clip links
  html += '<div style="margin-bottom:0.75rem;"><strong style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Video Clips</strong><div class="clip-links" style="margin-top:0.4rem;">';
  [1, 2, 3, 4].forEach(n => {
    if (clips[`p${n}`]) {
      html += `<div style="display:inline-flex;align-items:center;gap:0.3rem;margin-right:0.5rem;">`;
      html += `<a class="clip-link" href="${clips[`p${n}`]}" target="_blank" rel="noopener">Prompt ${n} ▶</a>`;
      html += `<button class="btn btn-danger btn-sm" style="padding:0.15rem 0.4rem;font-size:0.7rem;min-width:auto;" onclick="event.stopPropagation(); deleteClip('${identifier}', ${n})">✕</button>`;
      html += `</div>`;
    } else {
      html += `<span class="badge badge-muted">Prompt ${n} not recorded</span>`;
    }
  });
  html += '</div></div>';

  // Photos
  if (photos.length) {
    html += '<div><strong style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Photos</strong><div class="photo-thumbs" style="margin-top:0.4rem;">';
    photos.forEach((photo, index) => {
      html += `
        <div style="position:relative;">
          <a href="${photo.url}" target="_blank" rel="noopener">
            <img src="${photo.url}" alt="Photo" class="photo-thumb-admin">
          </a>
          <button class="btn btn-danger btn-sm" style="position:absolute;top:2px;right:2px;padding:0.1rem 0.35rem;font-size:0.65rem;min-width:auto;opacity:0.85;" onclick="event.stopPropagation(); deletePhoto('${identifier}', ${index})">✕</button>
          ${photo.wish ? `<div style="font-size:0.75rem;max-width:80px;margin-top:0.25rem;color:var(--text-muted);word-break:break-word;">"${photo.wish}"</div>` : ''}
        </div>
      `;
    });
    html += '</div></div>';
  } else {
    html += '<p style="color:var(--text-muted);font-size:0.82rem;">No photos uploaded</p>';
  }

  html += '</div>';
  container.innerHTML = html;
}

// =============================================
// DELETE CLIP
// =============================================
async function deleteClip(identifier, prompt) {
  if (!confirm(`Delete prompt ${prompt} clip for this submission?`)) return;

  try {
    showLoading(true, 'Deleting clip...');
    await apiFetch(`/admin/submission/${identifier}/clip/${prompt}`, {
      method: 'DELETE',
    });
    showLoading(false);

    // Update local state
    const sub = submissions.find(s => s.identifier === identifier);
    if (sub) {
      sub.completedPrompts = (sub.completedPrompts || []).filter(n => n !== prompt);
    }
    renderStats(submissions);
    renderSubmissions(submissions);

    // Re-open the expanded row to refresh it
    const mainRow = document.querySelector(`tr[data-identifier="${identifier}"]`);
    if (mainRow) toggleExpanded(identifier, mainRow);

    showError('✅ Clip deleted.');
  } catch (e) {
    showLoading(false);
    showError(e.message);
  }
}

// =============================================
// DELETE PHOTO
// =============================================
async function deletePhoto(identifier, index) {
  if (!confirm(`Delete photo #${index + 1} from this submission?`)) return;

  try {
    showLoading(true, 'Deleting photo...');
    await apiFetch(`/admin/submission/${identifier}/photo/${index}`, {
      method: 'DELETE',
    });
    showLoading(false);

    // Update local photoCount
    const sub = submissions.find(s => s.identifier === identifier);
    if (sub && sub.photoCount > 0) sub.photoCount--;
    renderStats(submissions);
    renderSubmissions(submissions);

    // Re-open the expanded row to refresh it
    const mainRow = document.querySelector(`tr[data-identifier="${identifier}"]`);
    if (mainRow) toggleExpanded(identifier, mainRow);

    showError('✅ Photo deleted.');
  } catch (e) {
    showLoading(false);
    showError(e.message);
  }
}

// =============================================
// DELETE SUBMISSION
// =============================================
async function deleteSubmission(identifier, name) {
  if (!confirm(`Delete entire submission for "${name}"?\n\nThis will permanently remove all clips and photos from storage.`)) return;

  try {
    showLoading(true, 'Deleting submission...');
    await apiFetch(`/admin/submission/${identifier}`, {
      method: 'DELETE',
    });
    showLoading(false);

    submissions = submissions.filter(s => s.identifier !== identifier);
    renderStats(submissions);
    renderSubmissions(submissions);

    showError('✅ Submission deleted.');
  } catch (e) {
    showLoading(false);
    showError(e.message);
  }
}

// =============================================
// BUCKET EXPLORER
// =============================================
let bucketObjects = [];

async function loadBucket() {
  const treeEl = $('bucket-tree');
  const summaryEl = $('bucket-summary');
  treeEl.innerHTML = '<p class="muted" style="font-size:0.85rem;">Loading...</p>';
  summaryEl.textContent = '';
  try {
    const data = await apiFetch('/admin/bucket');
    bucketObjects = data.objects || [];
    summaryEl.textContent = `${bucketObjects.length} file${bucketObjects.length !== 1 ? 's' : ''}`;
    renderBucketTree(bucketObjects);
  } catch (e) {
    treeEl.innerHTML = `<p class="muted" style="font-size:0.85rem;">Error: ${escapeHtml(e.message)}</p>`;
    summaryEl.textContent = '';
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildBucketTree(objects) {
  const root = { _files: [], _dirs: {} };
  for (const obj of objects) {
    const parts = obj.key.split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!node._dirs[dir]) node._dirs[dir] = { _files: [], _dirs: {} };
      node = node._dirs[dir];
    }
    const fileName = parts[parts.length - 1];
    if (fileName) node._files.push({ name: fileName, ...obj });
  }
  return root;
}

function countBucketFiles(node) {
  let n = node._files.length;
  for (const child of Object.values(node._dirs)) n += countBucketFiles(child);
  return n;
}

function formatFileSize(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function renderBucketNode(node, depth) {
  let html = '';

  const dirs = Object.entries(node._dirs).sort(([a], [b]) => a.localeCompare(b));
  for (const [name, child] of dirs) {
    const count = countBucketFiles(child);
    const id = 'bdir_' + Math.random().toString(36).slice(2);
    const open = depth > 0 && count <= 10;
    html += `
      <div class="bkt-dir">
        <div class="bkt-dir-hd" onclick="toggleBucketDir('${id}')">
          <span class="bkt-arrow" id="${id}_arr">${open ? '▼' : '▶'}</span>
          <span class="bkt-icon">📁</span>
          <span class="bkt-dir-name">${escapeHtml(name)}</span>
          <span class="bkt-count">${count} file${count !== 1 ? 's' : ''}</span>
        </div>
        <div class="bkt-dir-children" id="${id}" style="display:${open ? 'block' : 'none'};">
          ${renderBucketNode(child, depth + 1)}
        </div>
      </div>`;
  }

  const files = [...node._files].sort((a, b) => a.name.localeCompare(b.name));
  for (const file of files) {
    const isVideo = /\.(mp4|webm|mov|avi)$/i.test(file.name);
    const isImage = /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(file.name);
    const icon = isVideo ? '🎬' : isImage ? '🖼️' : '📄';
    const safeKey = file.key.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    html += `
      <div class="bkt-file">
        <span class="bkt-icon">${icon}</span>
        <span class="bkt-file-name" title="${escapeHtml(file.key)}">${escapeHtml(file.name)}</span>
        <span class="bkt-file-size">${formatFileSize(file.size)}</span>
        <div class="bkt-file-actions">
          <button class="btn btn-secondary btn-sm bkt-btn" onclick="openBucketFile('${safeKey}')">Open</button>
          <button class="btn btn-danger btn-sm bkt-btn" onclick="deleteBucketFile('${safeKey}')">✕</button>
        </div>
      </div>`;
  }

  return html;
}

function renderBucketTree(objects) {
  const treeEl = $('bucket-tree');
  if (!objects.length) {
    treeEl.innerHTML = '<p class="muted" style="font-size:0.85rem;">Bucket is empty.</p>';
    return;
  }
  const tree = buildBucketTree(objects);
  treeEl.innerHTML = `<div class="bkt-root">${renderBucketNode(tree, 0)}</div>`;
}

function toggleBucketDir(id) {
  const el = $(id);
  const arr = $(`${id}_arr`);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  if (arr) arr.textContent = open ? '▶' : '▼';
}

function openBucketFile(key) {
  const obj = bucketObjects.find(o => o.key === key);
  if (!obj) return;
  const isVideo = /\.(mp4|webm|mov|avi)$/i.test(key);
  const isImage = /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(key);

  if (!isVideo && !isImage) {
    window.open(obj.url, '_blank', 'noopener');
    return;
  }

  $('bucket-preview-label').textContent = obj.key;
  $('bucket-preview-link').href = obj.url;
  const mediaEl = $('bucket-preview-media');
  if (isVideo) {
    mediaEl.innerHTML = `<video src="${obj.url}" controls style="max-width:100%;max-height:60vh;border-radius:8px;"></video>`;
  } else {
    mediaEl.innerHTML = `<img src="${obj.url}" style="max-width:100%;max-height:60vh;border-radius:8px;object-fit:contain;">`;
  }
  $('bucket-preview-overlay').classList.add('active');
}

function closeBucketPreview() {
  $('bucket-preview-overlay').classList.remove('active');
  $('bucket-preview-media').innerHTML = '';
}

async function deleteBucketFile(key) {
  const fileName = key.split('/').pop();
  if (!confirm(`Delete "${fileName}" from the bucket?\n\n${key}\n\nThis cannot be undone.`)) return;

  try {
    showLoading(true, 'Deleting...');
    await apiFetch('/admin/bucket/file', {
      method: 'DELETE',
      body: JSON.stringify({ key }),
    });
    showLoading(false);
    bucketObjects = bucketObjects.filter(o => o.key !== key);
    $('bucket-summary').textContent = `${bucketObjects.length} file${bucketObjects.length !== 1 ? 's' : ''}`;
    renderBucketTree(bucketObjects);
    showError('✅ File deleted.');
  } catch (e) {
    showLoading(false);
    showError(e.message);
  }
}

// =============================================
// UPLOAD CLIP
// =============================================
async function uploadClip() {
  const identifier = $('upload-identifier').value;
  const prompt = $('upload-prompt').value;
  const fileInput = $('upload-file');
  const file = fileInput.files[0];

  if (!identifier) { showError('Please select an account.'); return; }
  if (!file) { showError('Please select a video file.'); return; }

  const progressWrap = $('upload-progress');
  const progressBar = $('upload-progress-bar');
  const progressLabel = $('upload-progress-label');

  progressWrap.style.display = 'block';
  progressBar.style.width = '0%';
  progressLabel.textContent = 'Uploading...';

  const formData = new FormData();
  formData.append('identifier', identifier);
  formData.append('prompt', prompt);
  formData.append('file', file);

  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BACKEND_URL}/admin/upload-clip`);
      xhr.setRequestHeader('Authorization', `Bearer ${adminToken}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 50);
          progressBar.style.width = `${pct}%`;
          progressLabel.textContent = `Uploading… ${pct * 2}%`;
        }
      };

      xhr.upload.onload = () => {
        progressBar.style.width = '60%';
        progressLabel.textContent = 'Converting to WebM… this may take a moment';
      };

      xhr.onload = () => {
        if (xhr.status === 401) { adminLogout(); reject(new Error('Session expired.')); return; }
        if (xhr.status >= 200 && xhr.status < 300) {
          progressBar.style.width = '100%';
          progressLabel.textContent = 'Done!';
          resolve();
        } else {
          try { reject(new Error(JSON.parse(xhr.responseText).error || `Upload failed (${xhr.status})`)); }
          catch { reject(new Error(`Upload failed (${xhr.status})`)); }
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(formData);
    });

    await loadSubmissions();
    fileInput.value = '';
    setTimeout(() => { progressWrap.style.display = 'none'; }, 3000);
    showError('✅ Clip uploaded and converted successfully!');
  } catch (e) {
    progressWrap.style.display = 'none';
    showError(e.message);
  }
}

// =============================================
// DOWNLOADS
// =============================================
function downloadZip(prompt) {
  if (!adminToken) return;
  let url;
  if (prompt === 'all') {
    url = `${BACKEND_URL}/admin/download?all=true`;
  } else if (prompt === 'photos') {
    url = `${BACKEND_URL}/admin/download?prompt=photos`;
  } else {
    url = `${BACKEND_URL}/admin/download?prompt=${prompt}`;
  }

  // Trigger download via a temporary anchor (includes auth header via query param workaround)
  // Since the browser handles the download, we open in new tab.
  // For proper auth, the backend should accept token as query param for this endpoint.
  const a = document.createElement('a');
  a.href = url + `&token=${encodeURIComponent(adminToken)}`;
  a.download = '';
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
