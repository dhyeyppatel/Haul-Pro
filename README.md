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
- **Multi-Selection Batch Actions & ZIP Download**:
  - Select multiple files or folders simultaneously with card/row checkboxes or "Select All" in table view.
  - Floating action bar: Download all selected files as a pure client-side uncompressed ZIP archive (bypassing server processing limits).
  - Batch make private / make public.
  - Batch move to folders.
  - Batch delete to Trash.
- **Client-Side Zero-Knowledge Encryption (E2EE)**:
  - Encrypt sensitive files in the browser using the Web Crypto API (`AES-GCM-256` with `PBKDF2` key derivation, 100,000 SHA-256 iterations).
  - Encrypted files are stored on edge nodes as ciphertext; plaintext is decrypted only in client memory when the secret passkey is provided.
- **Expiring & Burn-After-Reading Secure Shares**:
  - Generate temporary share links with customizable expiration (1 hour, 24 hours, 7 days, 30 days, or never).
  - Optional **Burn-After-Reading**: Link automatically self-destructs immediately after 1 view.
  - Optional password / PIN protection: Requires passphrase verification before decrypting or accessing the underlying file.
- **3D Pop-Out Coin Flip Profile with Google Lens QR Code**:
  - Interactive 3D flip card animation (`rotateY(180deg)`) on user avatar.
  - Clicking the avatar or "QR Code" action button pops out a smooth, centered Apple-style 3D presentation card with a high-contrast standard vector QR code (ISO/IEC 18004 compliant with 4-module quiet zone margin and BCH format information) linking to `https://shelfie.dhyey.cc/<username>` for instant scanning with Google Lens or Camera.
- **Floating Audio Waveform Mini Player**:
  - Persistent floating bottom-right mini player with dancing equalizer waveform bars (`waveDance` animation).
  - Progress timeline scrubber, skip +/-10 seconds, play/pause, volume control, and continuous background playback while browsing folders.
- **Monaco-Style Inline Document & Code Editor**:
  - In-app text and code editor for `.md`, `.py`, `.js`, `.ts`, `.json`, `.txt`, `.html`, `.css`, and `.sh`.
  - Line numbers gutter, Tab key indentation, and `Ctrl+S` / `Cmd+S` keyboard shortcuts.
  - Direct integration with `POST /api/files/save-content` to update MongoDB metadata, CommonThread storage, and fire webhook events.
- **Navbar Quick Theme Switch**:
  - One-click Sun/Moon toggle in the top navigation bar to seamlessly alternate between Light and Dark modes.
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

## Webhook Integrations Guide

Shelfie includes a real-time Webhook Notification Engine. When events occur in your cloud storage drive, Shelfie automatically dispatches asynchronous HTTP POST requests to your configured endpoints.

### Supported Event Triggers

| Event Name | Description | Trigger Moment |
| :--- | :--- | :--- |
| `file.uploaded` | Triggered when a new file is uploaded or hosted via URL. | Dispatched after edge storage ingestion and metadata indexation. |
| `file.deleted` | Triggered when one or more files are trashed or permanently purged. | Dispatched upon file trash or deletion. |
| `file.shared` | Triggered when an expiring or password-protected share link is created. | Dispatched upon secure share link generation. |
| `file.updated` | Triggered when file content is edited and saved via the inline editor. | Dispatched after content write to edge storage. |

---

### How to Configure Webhooks in Shelfie

1. Open **Settings** (gear icon in sidebar or profile dropdown).
2. Click the **Webhooks** tab.
3. Fill in the configuration form:
   - **Webhook Name**: A friendly label (e.g. `Discord Notifications`, `Slack Channel`, `Sync Worker`).
   - **Payload URL**: The destination endpoint (`https://...`).
   - **Secret Key (Optional)**: A custom passphrase for HMAC-SHA256 signature verification. Leave empty to auto-generate.
   - **Event Triggers**: Check the events you want delivered (`File Uploaded`, `File Deleted`, `File Shared`).
4. Click **Save Webhook**.
5. Click **Test Ping** on any active webhook card to verify connectivity in real-time.

---

### Integration Examples

#### Example 1: Discord Webhooks

Shelfie automatically detects Discord webhook URLs (`discord.com/api/webhooks/...` or `discordapp.com/api/webhooks/...`) and formats the outgoing payload as rich Discord embeds.

1. In Discord, go to **Server Settings > Integrations > Webhooks**.
2. Click **New Webhook**, select the target channel, and click **Copy Webhook URL**.
3. In Shelfie **Settings > Webhooks**, paste the Discord URL into **Payload URL** and click **Save Webhook**.

**Sample Discord Embed Output Sent by Shelfie:**
```json
{
  "embeds": [
    {
      "title": "New File Uploaded: report.pdf",
      "description": "Shelfie Event: file.uploaded",
      "color": 1732968,
      "fields": [
        { "name": "File Name", "value": "report.pdf", "inline": true },
        { "name": "Size", "value": "1.2 MB", "inline": true },
        { "name": "Category", "value": "Document", "inline": true },
        { "name": "Direct URL", "value": "https://media.dhyey.cc/1794888054.pdf" }
      ],
      "timestamp": "2026-11-17T14:00:00.000Z"
    }
  ]
}
```

---

#### Example 2: Slack Incoming Webhooks

Shelfie recognizes Slack webhook URLs (`hooks.slack.com/services/...`) and transforms the event into Slack-compatible text blocks.

1. In Slack, create an **Incoming Webhook** through your Slack App directory.
2. Copy the Webhook URL (e.g. `https://hooks.slack.com/services/T00/B00/XXXX`).
3. In Shelfie, paste the Slack URL into **Payload URL** and save.

**Sample Slack Payload Sent by Shelfie:**
```json
{
  "text": "Shelfie Event: *file.uploaded*\n*File:* photo.jpg (2.4 MB)\n*Link:* https://media.dhyey.cc/1794888054.jpg"
}
```

---

#### Example 3: Custom Node.js / Express Server (with HMAC Verification)

When sending to custom servers, Shelfie delivers standard JSON accompanied by an HMAC-SHA256 signature header:
* `X-Shelfie-Signature`: `sha256=<hex_digest>`
* `X-Shelfie-Event`: Event name (`file.uploaded`, `file.deleted`, etc.)

**Server Implementation in Node.js:**
```javascript
const express = require('express');
const crypto = require('crypto');

const app = express();
const WEBHOOK_SECRET = 'your-webhook-secret-key';

// Capture raw body for signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.post('/api/shelfie-webhook', (req, res) => {
  const signature = req.headers['x-shelfie-signature'];
  const event = req.headers['x-shelfie-event'];

  if (WEBHOOK_SECRET && signature) {
    const expected = 'sha256=' + crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(req.rawBody)
      .digest('hex');

    if (signature !== expected) {
      console.error('Invalid webhook signature!');
      return res.status(401).json({ error: 'Signature mismatch' });
    }
  }

  console.log(`Received Shelfie event [${event}]:`, req.body);

  switch (event) {
    case 'file.uploaded':
      console.log('File hosted at:', req.body.data.hosted_url);
      break;
    case 'file.deleted':
      console.log('Items removed:', req.body.data.count);
      break;
    case 'file.shared':
      console.log('Secure share created for token:', req.body.data.token);
      break;
  }

  res.status(200).json({ received: true });
});

app.listen(4000, () => console.log('Webhook listener running on port 4000'));
```

---

#### Example 4: Custom Python (Flask / FastAPI) Server (with HMAC Verification)

**Server Implementation in Python (Flask):**
```python
from flask import Flask, request, jsonify
import hmac
import hashlib

app = Flask(__name__)
WEBHOOK_SECRET = "your-webhook-secret-key"

@app.route("/api/shelfie-webhook", methods=["POST"])
def shelfie_webhook():
    signature = request.headers.get("X-Shelfie-Signature", "")
    event = request.headers.get("X-Shelfie-Event", "")

    if WEBHOOK_SECRET and signature:
        expected = "sha256=" + hmac.new(
            WEBHOOK_SECRET.encode("utf-8"),
            request.get_data(),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, expected):
            return jsonify({"error": "Signature mismatch"}), 401

    payload = request.get_json() or {}
    print(f"Shelfie Event: {event}")
    print(f"Payload Data: {payload.get('data')}")

    return jsonify({"status": "received"}), 200

if __name__ == "__main__":
    app.run(port=5000)
```

---

### Standard JSON Payload Schema

When dispatching to a custom endpoint, the request body adheres to the following structure:

```json
{
  "event": "file.uploaded",
  "timestamp": 1794888054,
  "data": {
    "id": "673752e50529d841b80c102a",
    "name": "project_notes.md",
    "size": 14250,
    "mime_type": "text/markdown",
    "extension": "md",
    "category": "document",
    "hosted_url": "https://media.dhyey.cc/1794888054.md",
    "is_public": false,
    "is_encrypted": false,
    "created_at": "2026-11-17T14:00:00.000Z"
  }
}
```
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
