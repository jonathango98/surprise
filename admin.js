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

function renderSubmissions(subs) {
  const tbody = $('submissions-tbody');
  tbody.innerHTML = '';

  if (!subs.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">No submissions yet</td></tr>';
    return;
  }

  subs.forEach((sub) => {
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
      <td>${sub.location || '—'}</td>
      <td style="white-space:nowrap;">${formatDatetime(sub.submittedAt)}</td>
      <td><div class="prompt-dots">${dotsHtml}</div></td>
      <td>${sub.photoCount || 0}</td>
    `;

    tr.addEventListener('click', () => toggleExpanded(sub.identifier, tr));
    tbody.appendChild(tr);

    // Expanded row (hidden by default)
    const expandTr = document.createElement('tr');
    expandTr.id = `expand-${sub.identifier}`;
    expandTr.style.display = 'none';
    expandTr.innerHTML = '<td colspan="5"><div class="expanded-row-inner" style="padding:1rem 0;color:var(--text-muted);font-size:0.85rem;">Loading details...</div></td>';
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

  let html = '<div style="padding:0 0.75rem;">';

  // Clip links
  html += '<div style="margin-bottom:0.75rem;"><strong style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Video Clips</strong><div class="clip-links" style="margin-top:0.4rem;">';
  [1, 2, 3, 4].forEach(n => {
    if (clips[`p${n}`]) {
      html += `<a class="clip-link" href="${clips[`p${n}`]}" target="_blank" rel="noopener">Prompt ${n} ▶</a>`;
    } else {
      html += `<span class="badge badge-muted">Prompt ${n} not recorded</span>`;
    }
  });
  html += '</div></div>';

  // Photos
  if (photos.length) {
    html += '<div><strong style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Photos</strong><div class="photo-thumbs" style="margin-top:0.4rem;">';
    photos.forEach(photo => {
      html += `
        <div style="position:relative;">
          <a href="${photo.url}" target="_blank" rel="noopener">
            <img src="${photo.url}" alt="Photo" class="photo-thumb-admin">
          </a>
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
