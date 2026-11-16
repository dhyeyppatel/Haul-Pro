# Haul Pro

A modern, high-performance cloud storage and media management platform built with a **Python (Flask) backend**, a **pixel-perfect Google Drive static UI** (HTML5, CSS3, ES6 JavaScript, pure SVG icons, zero emojis), backed by **MongoDB Atlas** for metadata and user isolation, and powered by **CommonThread** (`media-hosting.dhyeyp254.workers.dev`) for serverless cloud file storage.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│             Client Browser (Static Frontend)           │
│    • Google Drive Layout (Sidebar, Topbar, Explorer)   │
│    • Drag & Drop File Uploads                          │
│    • Predictive Prefetching (15-20 items per scroll)   │
│    • In-App Viewers (Images, PDFs, Audio, Video, Code) │
└───────────────────────────┬────────────────────────────┘
                            │ REST APIs / Cookie Auth
┌───────────────────────────▼────────────────────────────┐
│              Vercel Serverless Backend (Python)        │
│    • Multi-User Authentication (JWT + Bcrypt)          │
│    • Paginated File & Folder Controller                │
│    • CommonThread Upload Proxy (ct_dev_... token)      │
└─────────────────┬──────────────────────┬───────────────┘
                  │                      │
┌─────────────────▼────────┐   ┌─────────▼───────────────┐
│     🍃 MongoDB Atlas     │   │   ⚡ CommonThread Edge   │
│  • Users (Storage used)  │   │  • Telegram Cloud (<=20MB)│
│  • Folders (Tree/Path)   │   │  • Cloudflare R2 (>20MB)│
│  • Files (CDN URLs, Meta)│   │  • Edge CDN Delivery    │
└──────────────────────────┘   └─────────────────────────┘
```

---

## ✨ Features

- **Google Drive Aesthetics**: Built with vanilla HTML, CSS, and modern JavaScript using crisp SVG icons—strictly **no emojis**.
- **Unified Mixed-Media Drive**: No arbitrary partitions. Images, wallpapers, PDFs, books, videos, audio, documents, scripts, and archives coexist seamlessly in folders or root.
- **Predictive Prefetching & Lookahead**:
  - Automatically loads 15–20 files per page.
  - While the user browses the top files, the engine transparently prefetches page $N+1$ and pre-warms the browser's image cache so scrolling is instant and stutter-free.
- **In-App Media Viewers**:
  - **Photos & Wallpapers**: High-resolution viewer with pan, zoom in/out, download, and copy link.
  - **eBooks & PDFs**: Embedded in-browser PDF reader with full page navigation, zoom, and print controls.
  - **Videos & Audio**: Custom HTML5 media player with range streaming.
  - **Code & Notes**: Syntax-ready monospace code previewer with copy functionality.
- **Full File Management**:
  - Multi-file drag-and-drop uploader with real-time progress drawer.
  - Folder creation and deep breadcrumb navigation.
  - Context menus: Star/Unstar, Rename, Copy direct link, Download, Move to Trash, and Delete Forever.
  - Switchable Grid View and List View table.
- **Multi-User Authentication**:
  - Secure registration and login using `bcrypt` password hashing and HTTP-only JWT cookies.
  - Complete user isolation: Each user has their own private drive and storage meter (15 GB quota).
- **Zero Egress Storage**:
  - All binary files are uploaded to and streamed directly from the CommonThread Cloudflare edge engine.

---

## ⚙️ Environment Variables

Configure these in `.env` (for local development) and in the **Vercel Dashboard** under **Project Settings > Environment Variables**:

| Variable | Required | Description |
| :--- | :--- | :--- |
| `MONGODB_URI` | **Yes** | MongoDB Atlas connection string (e.g. `mongodb+srv://<user>:<password>@cluster0.mongodb.net/haul_pro?retryWrites=true&w=majority`). |
| `JWT_SECRET` | **Yes** | Strong secret string used to sign user authentication tokens. |
| `MEDIA_HOST_URL` | **Yes** | Your CommonThread Cloudflare Worker URL (`https://media-hosting.dhyeyp254.workers.dev`). |
| `HAUL_MEDIA_API_KEY`| **Yes** | Developer API token (`ct_dev_bbd2ae65abc5464d7965effceccf4fa8`) to authenticate uploads. |
| `PORT` | Optional | Local development port (default: `3000`). |

---

## 🚀 Running Locally

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

## 🌐 Deploying to Vercel

1. Push this repository to GitHub.
2. In the [Vercel Dashboard](https://vercel.com/new), import the repository.
3. In **Environment Variables**, add:
   - `MONGODB_URI`: Your MongoDB Atlas URL
   - `JWT_SECRET`: A secure random secret
   - `MEDIA_HOST_URL`: `https://media-hosting.dhyeyp254.workers.dev`
   - `HAUL_MEDIA_API_KEY`: `ct_dev_bbd2ae65abc5464d7965effceccf4fa8`
4. Click **Deploy**. Vercel will automatically build the Python serverless function and serve the static files at the root!

---

## 📄 License

MIT License.
