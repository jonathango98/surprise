# requirements-frontend.md
# Sharon Birthday Surprise — Frontend

## Stack
- Plain HTML/CSS/JS (single page)
- Hosted on Netlify
- Communicates with Railway backend via REST

---

## Environment Variables
```
VITE_BACKEND_URL=https://your-railway-app.up.railway.app
```

---

## Pages / Routes

### `/` — Contributor Flow
### `/admin` — Admin Dashboard

---

## Contributor Flow

### 1. Oath Popup (on first load)
- Appears immediately, blocks all content behind dark overlay
- Stored in `localStorage` — returning visitors skip it
- Copy:
  > 🤫 Before you continue...
  > Do you solemnly swear that you are NOT Sharon, and that you will not, under any circumstances, tell Sharon about this?
- **[ I swear! 🤞 ]** → dismiss popup, proceed
- **[ I am Sharon 😅 ]** → redirect to:
  `https://www.quora.com/What-is-the-best-way-to-act-surprised-when-someone-tells-you-something-you-already-knew-but-were-not-supposed-to-know`

---

### 2. Deadline Check (on load, after oath)
- `GET /deadline` from backend
- If current time > deadline → show full-screen **"Submissions Closed"** message, block all further interaction
- If within deadline → proceed to form

---

### 3. Device Check
- Detect if user is on desktop (via `navigator.userAgent` or screen width > 1024px)
- If desktop → show full-screen message: **"Please open this link on your phone 📱"**
- Block all further interaction on desktop

---

### 4. Intro / Registration Form
- Fields:
  - First Name (required)
  - Last Name (required)
  - Location (required, e.g. "Jakarta, Indonesia")
- On submit:
  - `POST /session` with `{ firstName, lastName, location }`
  - Backend checks MongoDB for existing submission
  - Returns `{ isReturning: true/false, completedPrompts: [1,2,3] }`
  - Save session to `localStorage` (name + location combo as key)
- If returning → skip to dashboard with progress restored

---

### 5. Progress Dashboard (5-Card Tracker)
- All 5 cards visible simultaneously
- Cards:
  1. Prompt 1 — "One word that best describes Sharon" (10s)
  2. Prompt 2 — "What you are most grateful for" (60s)
  3. Prompt 3 — "Wishes to Sharon!" (60s)
  4. Prompt 4 — Say "Happy Birthday Sharon!" (10s)
  5. Upload Photos with Sharon
- Card states:
  - **Incomplete** — default, tappable
  - **Completed** — green checkmark, shows "Uploaded X hrs ago", tappable with re-upload warning
  - Cards unlock sequentially (can't skip ahead)
- Tapping a completed card → show retake warning before entering:
  > ⚠️ Re-uploading this prompt will replace your previous clip. Continue?

---

### 6. Video Upload Screen (Prompts 1–4)

User uploads a pre-recorded vertical video from their camera roll. No in-browser recording.

#### Upload UI
- Shows prompt text and duration guideline (e.g. "Keep it under 10s")
- **"📹 Select a video"** button → opens native file picker (`accept="video/*"`)
- After file selected:
  - Inline video preview (playable)
  - Requirements checklist with live pass/fail status
  - **"Try a different video"** button to pick again
  - **"Upload ✓"** button — only shown when all requirements pass

#### Requirements Checked Client-Side
1. **Size** — file must be ≤ 50 MB
2. **Portrait orientation** — `videoHeight > videoWidth` (checked via HTMLVideoElement metadata)
3. **Duration** — must be ≤ prompt limit + buffer (5s or 15%, whichever is larger)

Each requirement shows ✅ or ❌ with details (actual dimensions, file size, duration).

#### Upload
- `POST /presign` → get S3 presigned PUT URL
- Upload file directly to S3 with progress bar
- On success → `POST /submit-clip` with metadata
- Mark card green, return to dashboard

#### On Error
- Returns to upload screen with preview still visible; user can retry or pick different file

#### S3 Key Format
```
sharon-bday/prompt-{n}/{firstname}-{lastname}-{location}-p{n}.mp4
```
- Re-upload: backend returns new presigned URL with incremented version suffix in DB

---

### 7. Photo Upload Screen (Card 5)

- No time limit, no recording
- **Upload Photo** button → opens camera or gallery (accept="image/*")
- After each photo selected:
  - Thumbnail preview
  - Optional wish text box below thumbnail: "Add a written wish for Sharon (optional)"
  - **Add another photo** button to add more
- Photos accumulate in a scrollable list, each with its own wish
- No delete option
- Card turns green after first photo uploaded, stays green but always re-enterable
- On upload: `POST /presign-photo` → S3 presigned PUT URL
- S3 key: `sharon-bday/photos/{firstname}-{lastname}-{location}-{n}.jpg`
- `POST /submit-photo` with `{ s3Key, wish }`

---

### 8. Thank You Screen
- Shown after all 4 video prompts completed (photos optional)
- Subtle confetti/celebration animation
- Summary: "You recorded 4 clips and uploaded X photos 🎉"
- Shareable copy text: "I've added my message for Sharon! 🎂"

---

## Admin Page `/admin`

### Login
- Password field + submit
- `POST /admin/login` → returns session token stored in `localStorage`
- All admin API calls include `Authorization: Bearer {token}`

### Dashboard
- **Deadline Management**
  - Show current deadline
  - Datetime picker to set/update deadline
  - `POST /admin/deadline`

- **Submission Stats**
  - Per-prompt submission count (e.g. "Prompt 1: 12 submitted")
  - Total unique contributors

- **Submissions List**
  - Table: Name, Location, Submitted At, Completed Prompts, Photos count
  - Expandable row: view clip links (presigned GET URLs), photo thumbnails + wishes

- **Zip Downloads**
  - Download per prompt folder (e.g. "Download Prompt 1 ZIP")
  - Download all as one ZIP
  - `GET /admin/download?prompt=1` or `GET /admin/download?all=true`

---

## Security / UX Notes
- Rate limit awareness: frontend should handle 429 responses gracefully
- Max file size: enforce client-side (50 MB video, 10 MB photo) before upload attempt
- Video requirements enforced client-side before upload: size ≤ 50 MB, portrait orientation, duration within prompt limit
- All API calls include error handling with user-friendly messages
- No form tags — use `onClick` handlers only
