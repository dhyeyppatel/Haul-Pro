# Shelfie (Haul Pro)

A modern, high-performance cloud storage and media management platform built with a **Python (Flask) backend**, a **Google Drive and Instagram-inspired UI** (HTML5, CSS3, ES6 JavaScript, pure SVG icons, zero emojis), backed by **MongoDB Atlas** for user drives, folders, activity feeds, and public profiles, and powered by **CommonThread** for serverless edge cloud storage.

---

## Architecture

```
+-------------------------------------------------------------------------+
|                    Client Browser (Static Frontend)                     |
|  - Google Drive & Instagram-Inspired UI (Sidebar, Topbar, Explorer)     |
|  - Direct Cloudflare Edge Ingestion (Bypasses Vercel 4.5 MB Limit)      |
|  - Public Profile Vanity URLs (https://shelfie.dhyey.cc/<username>)     |
|  - Private / Public Visibility Tabs & Folder Sharing                    |
|  - Predictive Prefetching & Lookahead Cache (15-20 files per scroll)    |
|  - In-App Viewers (Photos, PDFs, Audio, Video, Code & Notes)            |
+------------------------------------+------------------------------------+
                                     |
                +--------------------+--------------------+
                |                                         |
     REST Metadata & Auth                      Direct Binary Upload
        (JWT Cookies)                            (X-API-Key Header)
                |                                         |
+---------------v-------------------------+ +-------------v------------------------+
|    Vercel Serverless Backend (Python)   | |      CommonThread Edge Storage       |
|  - Multi-User Auth (JWT + Bcrypt)       | |  - Telegram Cloud Storage (<= 20MB)  |
|  - File & Folder Hierarchical Paths     | |  - Cloudflare R2 Storage (> 20MB)    |
|  - Activity Feed & Audit Logging        | |  - Zero Egress Edge Streaming        |
|  - Public Profile Data API (/api/public)| |  - Primary REST Ingestion:           |
|  - SPA Static Fallback Routing          | |    POST /api/upload                  |
+---------------+-------------------------+ +--------------------------------------+
                |
+---------------v-------------------------+
|             MongoDB Atlas               |
|  - Users (Storage used, bio, avatar)    |
|  - Folders (Parent-child tree, public)  |
|  - Files (Hosted CDN URLs, deleteToken) |
|  - Activities (Recent action audit log) |
+-----------------------------------------+
```

---

## Features

- **Google Drive Aesthetics**: Built with vanilla HTML, CSS, and modern JavaScript using crisp SVG icons—strictly **no emojis**.
- **Direct Edge Ingestion**:
  - Binary files upload directly from the user's browser to the CommonThread Cloudflare edge worker (`POST /api/upload`), completely bypassing Vercel serverless request body limits (eliminating the 4.5 MB payload restriction).
  - Accurate upload progress reporting (0% to 90% during edge transfer, 90% to 100% during metadata record).
- **Public Profile Vanity URLs**:
  - Every user has a public profile accessible at `https://shelfie.dhyey.cc/<username>`.
  - Visitors see public files and public folders.
  - When logged in as the owner, an interactive Instagram-style header appears with Private and Public tabs, quick visibility toggles, bio editing, and avatar updates.
- **Folder Management & Sharing**:
  - Create nested folder hierarchies.
  - Move single or multiple files into folders.
  - One-click folder link sharing (`?folderId=...`).
- **Multi-Selection Batch Actions**:
  - Select multiple files or folders simultaneously.
  - Batch make private / make public.
  - Batch move to folders.
  - Batch delete to Trash.
- **Unified Mixed-Media Drive**:
  - Images, wallpapers, PDFs, books, videos, audio, documents, scripts, and archives coexist seamlessly.
- **Predictive Prefetching & Lookahead**:
  - Automatically loads 15 to 20 files per page.
  - Transparently prefetches page N+1 and pre-warms the browser cache for stutter-free scrolling.
- **In-App Media Viewers**:
  - **Photos & Wallpapers**: High-resolution viewer with pan, zoom in/out, download, and copy link.
  - **eBooks & PDFs**: Embedded in-browser PDF reader with full page navigation, zoom, and print controls.
  - **Videos & Audio**: Custom HTML5 media player with range streaming.
  - **Code & Notes**: Syntax-ready monospace code previewer with copy functionality.
- **Activity & Alerts Feed**:
  - Track recent actions (uploads, deletions, moves, visibility changes, folder creation) with timestamps.
- **Settings & Help Center**:
  - Apple-inspired frosted glass modal.
  - Beginner Guide with step-by-step onboarding walkthrough.
  - Help Center FAQ with interactive expandable answers.
  - Storage statistics with visual progress bar.
  - Password change, multilingual preferences, and account deletion.

---

## Environment Variables

Configure these in `.env` (for local development) and in the **Vercel Dashboard** under **Project Settings > Environment Variables**:

| Variable | Required | Description |
| :--- | :--- | :--- |
| `MONGODB_URI` | **Yes** | MongoDB Atlas connection string (e.g. `mongodb+srv://<user>:<password>@cluster0.mongodb.net/haul_pro?retryWrites=true&w=majority`). |
| `JWT_SECRET` | **Yes** | Strong secret string used to sign user authentication tokens. |
| `MEDIA_HOST_URL` | **Yes** | CommonThread Cloudflare Worker URL (`https://media-hosting.dhyeyp254.workers.dev`). |
| `HAUL_MEDIA_API_KEY`| **Yes** | Developer API token (`ct_dev_bbd2ae65abc5464d7965effceccf4fa8`) to authenticate edge uploads. |
| `PORT` | Optional | Local development port (default: `3000`). |

---

## Running Locally

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
2. **Configure your `.env` file**:
   ```bash
   copy .env.example .env
   ```
   Fill in your MongoDB Atlas connection string in `MONGODB_URI`.
3. **Start the server**:
   ```bash
   python run.py
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## Deploying to Vercel

1. Push this repository to GitHub on branch `main`.
2. In the [Vercel Dashboard](https://vercel.com/new), import the repository.
3. In **Environment Variables**, add:
   - `MONGODB_URI`: Your MongoDB Atlas URL
   - `JWT_SECRET`: A secure random secret
   - `MEDIA_HOST_URL`: `https://media-hosting.dhyeyp254.workers.dev`
   - `HAUL_MEDIA_API_KEY`: `Get from media.dhyey.cc`
4. Deploy. Vercel automatically deploys every new commit pushed to `origin/main`.

---

## License

This project is licensed under the [MIT License](LICENSE).
