# Sharon's Birthday — Frontend

A mobile-only single-page app for collecting video messages and photos from Sharon's friends and family. Hosted on Netlify, backed by a Railway/Express API.

## Stack

- Plain HTML / CSS / JS — no build step
- Netlify (hosting + routing)
- Communicates with Railway backend via REST

## Setup

1. **Set the backend URL**

   Edit [`config.js`](config.js) and replace the placeholder with your Railway URL:

   ```js
   window.BACKEND_URL = 'https://your-app.up.railway.app';
   ```

2. **Deploy to Netlify**

   Push this folder to a GitHub repo and connect it to Netlify. No build command needed — just set the publish directory to the repo root.

## Routes

| URL | File | Description |
|-----|------|-------------|
| `/` | `index.html` | Contributor flow |
| `/admin` | `admin.html` | Admin dashboard |

## Contributor Flow

1. **Oath popup** — confirms the visitor is not Sharon (localStorage-persisted)
2. **Deadline check** — blocks submissions if the deadline has passed
3. **Device check** — blocks desktop visitors with a "use your phone" message
4. **Registration** — collects first name, last name, location
5. **5-card dashboard** — cards unlock sequentially as prompts are completed
   - Prompt 1: "In one word, describe Sharon" (10s)
   - Prompt 2: "What are you most grateful for about Sharon?" (60s)
   - Prompt 3: "Share your wishes for Sharon!" (60s)
   - Prompt 4: "Say Happy Birthday Sharon!" (10s)
   - Card 5: Photo upload (unlocks after all 4 prompts)
6. **Recording screen** — portrait enforcement, live countdown, stop-early button
7. **Playback** — retake or confirm before uploading
8. **Upload** — direct S3 upload via presigned URL with progress bar
9. **Thank you screen** — confetti + shareable message

## Admin Dashboard (`/admin`)

- Password login (JWT stored in `localStorage`)
- View and update the submission deadline
- Stats: contributor count and per-prompt submission counts
- Submissions table with expandable rows showing clip links and photo thumbnails
- ZIP download buttons per prompt, photos, or all

## File Structure

```
video/
├── config.js        # Backend URL — edit before deploying
├── index.html       # Contributor flow
├── admin.html       # Admin dashboard
├── style.css        # All styles
├── app.js           # Contributor flow logic
├── admin.js         # Admin dashboard logic
└── netlify.toml     # Netlify redirect rules
```
