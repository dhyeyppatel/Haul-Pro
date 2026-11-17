import os
import re
import datetime
import json
import hashlib
import hmac
import secrets
import threading
from bson import ObjectId
from flask import Flask, request, jsonify, send_from_directory, make_response
from flask_cors import CORS
from pymongo import MongoClient
import bcrypt
import jwt
import requests
from werkzeug.exceptions import HTTPException
from dotenv import load_dotenv

# Load environment
load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017/haul_pro")
JWT_SECRET = os.getenv("JWT_SECRET", "haul_pro_secure_jwt_secret_token_key_2026")
MEDIA_HOST_URL = os.getenv("MEDIA_HOST_URL", "https://media-hosting.dhyeyp254.workers.dev").rstrip("/")
HAUL_MEDIA_API_KEY = os.getenv("HAUL_MEDIA_API_KEY", "ct_dev_bbd2ae65abc5464d7965effceccf4fa8")

app = Flask(__name__, static_folder="../public", static_url_path="")
CORS(app, supports_credentials=True)

@app.errorhandler(Exception)
def handle_exception(e):
    if isinstance(e, HTTPException):
        if e.code == 404 and (not request.path.startswith("/api/") or request.path == "/api/index.py"):
            static_dir = os.path.join(os.path.dirname(__file__), "../public")
            return send_from_directory(static_dir, "index.html")
        return jsonify({"success": False, "error": e.description}), e.code
    print("Unhandled Server Exception:", e)
    return jsonify({"success": False, "error": str(e)}), 500

# MongoDB client initialization
mongo_client = None
db = None

def get_db():
    global mongo_client, db
    if db is None:
        mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        try:
            db = mongo_client.get_default_database("haul_pro")
        except Exception:
            db = mongo_client["haul_pro"]

        if db is None or db.name in ("admin", "local", "config"):
            db = mongo_client["haul_pro"]

        # Ensure indexes
        try:
            db.users.create_index("email", unique=True)
            db.folders.create_index([("user_id", 1), ("parent_id", 1)])
            db.files.create_index([("user_id", 1), ("folder_id", 1)])
            db.files.create_index([("user_id", 1), ("is_trashed", 1)])
            db.files.create_index([("user_id", 1), ("is_starred", 1)])
            db.files.create_index([("user_id", 1), ("category", 1)])
            db.activities.create_index([("user_id", 1), ("created_at", -1)])
        except Exception:
            pass
    return db

def record_activity(user_id, action, item_name, details, item_type="file", metadata=None):
    try:
        database = get_db()
        uid = ObjectId(user_id) if isinstance(user_id, str) else user_id
        doc = {
            "user_id": uid,
            "action": action,
            "item_name": str(item_name),
            "item_type": item_type,
            "details": details,
            "metadata": metadata or {},
            "created_at": datetime.datetime.utcnow()
        }
        database.activities.insert_one(doc)
    except Exception as e:
        print("Failed to record activity:", e)

# JWT Helper
def create_token(user_id, email, name):
    payload = {
        "id": str(user_id),
        "email": email,
        "name": name,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=14)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def authenticate():
    token = None
    if "token" in request.cookies:
        token = request.cookies.get("token")
    elif request.headers.get("Authorization", "").startswith("Bearer "):
        token = request.headers.get("Authorization").split(" ")[1]

    if not token:
        return None

    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return decoded
    except Exception:
        return None

def user_id_match(uid):
    try:
        obj_id = ObjectId(uid) if isinstance(uid, str) else uid
        return {"$in": [obj_id, str(obj_id)]}
    except Exception:
        return uid

def detect_category(extension, mime_type=""):
    ext = (extension or "").lower().lstrip(".")
    mime = (mime_type or "").lower()

    image_exts = {"jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "tiff", "avif"}
    video_exts = {"mp4", "webm", "mkv", "avi", "mov", "flv", "wmv"}
    audio_exts = {"mp3", "wav", "ogg", "m4a", "flac", "aac", "opus"}
    book_exts = {"pdf", "epub", "mobi", "azw3", "cbr", "cbz"}
    doc_exts = {"doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "csv", "md"}
    code_exts = {"js", "ts", "jsx", "tsx", "html", "css", "json", "py", "java", "c", "cpp", "cs", "go", "rs", "php", "sh", "bat", "cmd", "ps1", "sql", "xml", "yaml", "yml"}
    archive_exts = {"zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"}

    if ext in image_exts or mime.startswith("image/"):
        return "image"
    if ext in video_exts or mime.startswith("video/"):
        return "video"
    if ext in audio_exts or mime.startswith("audio/"):
        return "audio"
    if ext in book_exts or ext == "pdf":
        return "book"
    if ext in doc_exts or "document" in mime or "sheet" in mime or "presentation" in mime:
        return "document"
    if ext in code_exts:
        return "code"
    if ext in archive_exts or "zip" in mime or "compressed" in mime:
        return "archive"
    return "other"

def serialize_doc(doc):
    if not doc:
        return None
    d = dict(doc)
    if "_id" in d:
        d["id"] = str(d["_id"])
        del d["_id"]
    if "user_id" in d and isinstance(d["user_id"], ObjectId):
        d["user_id"] = str(d["user_id"])
    if "parent_id" in d and isinstance(d["parent_id"], ObjectId):
        d["parent_id"] = str(d["parent_id"])
    if "folder_id" in d and isinstance(d["folder_id"], ObjectId):
        d["folder_id"] = str(d["folder_id"])
    if "created_at" in d and isinstance(d["created_at"], datetime.datetime):
        d["created_at"] = d["created_at"].isoformat()
    if "updated_at" in d and isinstance(d["updated_at"], datetime.datetime):
        d["updated_at"] = d["updated_at"].isoformat()
    return d

def dispatch_single_webhook(wh_url, wh_secret, event_name, payload_data):
    try:
        body = {
            "event": event_name,
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "data": payload_data
        }
        json_str = json.dumps(body)
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Shelfie-Webhook/2.0"
        }
        if wh_secret:
            sig = hmac.new(wh_secret.encode("utf-8"), json_str.encode("utf-8"), hashlib.sha256).hexdigest()
            headers["X-Shelfie-Signature"] = sig

        if "discord.com/api/webhooks" in wh_url or "discordapp.com/api/webhooks" in wh_url:
            desc = f"Shelfie Event: **{event_name}**"
            if event_name == "file.uploaded":
                desc = f"File Uploaded: **{payload_data.get('name', 'file')}** ({payload_data.get('category', 'item')}) - {payload_data.get('size', 0)} bytes"
            elif event_name == "file.deleted":
                desc = f"File Deleted: **{payload_data.get('name', 'file')}**"
            elif event_name == "file.shared":
                desc = f"Secure Share Created: **{payload_data.get('file_name', 'file')}**"
            requests.post(wh_url, json={"content": f"[Shelfie Cloud Drive] {desc}"}, timeout=6)
        elif "hooks.slack.com" in wh_url:
            requests.post(wh_url, json={"text": f"[Shelfie Cloud Drive] Event: {event_name} - {json_str}"}, timeout=6)
        else:
            requests.post(wh_url, data=json_str, headers=headers, timeout=6)
    except Exception as err:
        print("Webhook delivery error:", err)

def trigger_webhooks(user_id, event_name, payload_data):
    def run():
        try:
            database = get_db()
            uid = ObjectId(user_id) if isinstance(user_id, str) else user_id
            webhooks = list(database.webhooks.find({"user_id": uid, "is_active": {"$ne": False}}))
            for wh in webhooks:
                events = wh.get("events", [])
                if not events or event_name in events or "*" in events:
                    dispatch_single_webhook(wh.get("url"), wh.get("secret"), event_name, payload_data)
        except Exception as e:
            print("trigger_webhooks error:", e)

    t = threading.Thread(target=run, daemon=True)
    t.start()

# ==========================================
# AUTH ENDPOINTS
# ==========================================

@app.route("/api/auth/register", methods=["POST"])
def register():
    try:
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not name or not email or not password:
            return jsonify({"success": False, "error": "Name, email, and password are required."}), 400
        if len(password) < 6:
            return jsonify({"success": False, "error": "Password must be at least 6 characters long."}), 400

        database = get_db()
        existing = database.users.find_one({"email": email})
        if existing:
            return jsonify({"success": False, "error": "An account with this email already exists."}), 400

        # Unique username generation / sanitization
        raw_user = (data.get("username") or email.split("@")[0]).strip().lower()
        clean_user = re.sub(r'[^a-z0-9_-]', '', raw_user)
        if not clean_user:
            clean_user = "user" + str(int(datetime.datetime.utcnow().timestamp()))
        
        username = clean_user
        idx = 1
        while database.users.find_one({"username": username}):
            username = f"{clean_user}{idx}"
            idx += 1

        salt = bcrypt.gensalt(10)
        password_hash = bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

        avatar_colors = ["#1a73e8", "#ea4335", "#fbbc04", "#34a853", "#9c27b0", "#0097a7", "#ff6d00"]
        avatar_color = avatar_colors[abs(hash(email)) % len(avatar_colors)]

        now = datetime.datetime.utcnow()
        user_doc = {
            "name": name,
            "username": username,
            "email": email,
            "password_hash": password_hash,
            "avatar_color": avatar_color,
            "avatar_url": None,
            "bio": "",
            "storage_used_bytes": 0,
            "storage_limit_bytes": 15 * 1024 * 1024 * 1024,  # 15 GB
            "created_at": now,
            "updated_at": now
        }
        result = database.users.insert_one(user_doc)
        user_id = result.inserted_id

        token = create_token(user_id, email, name)
        resp = make_response(jsonify({
            "success": True,
            "token": token,
            "user": {
                "id": str(user_id),
                "name": name,
                "username": username,
                "email": email,
                "bio": "",
                "avatar_url": "",
                "avatar_color": avatar_color,
                "storage_used_bytes": 0,
                "storage_limit_bytes": user_doc["storage_limit_bytes"]
            }
        }), 201)
        resp.set_cookie("token", token, httponly=True, samesite="Lax", max_age=14*24*3600)
        return resp
    except Exception as e:
        if isinstance(e, HTTPException):
            return jsonify({"success": False, "error": e.description}), e.code
        print("Register error:", e)
        return jsonify({"success": False, "error": f"Registration failed: {str(e)}"}), 500

@app.route("/api/auth/login", methods=["POST"])
def login():
    try:
        data = request.get_json(silent=True) or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not email or not password:
            return jsonify({"success": False, "error": "Email and password are required."}), 400

        database = get_db()
        user = database.users.find_one({"email": email})
        if not user:
            return jsonify({"success": False, "error": "Invalid email or password."}), 401

        stored_hash = user.get("password_hash") or ""
        if isinstance(stored_hash, str):
            stored_hash = stored_hash.encode("utf-8")
        if not stored_hash or not bcrypt.checkpw(password.encode("utf-8"), stored_hash):
            return jsonify({"success": False, "error": "Invalid email or password."}), 401

        # Backfill username if missing
        username = user.get("username")
        if not username:
            clean_user = re.sub(r'[^a-z0-9_-]', '', user["email"].split("@")[0].lower()) or "user"
            username = clean_user
            idx = 1
            while database.users.find_one({"username": username, "_id": {"$ne": user["_id"]}}):
                username = f"{clean_user}{idx}"
                idx += 1
            database.users.update_one({"_id": user["_id"]}, {"$set": {"username": username}})

        token = create_token(user["_id"], user["email"], user["name"])
        resp = make_response(jsonify({
            "success": True,
            "token": token,
            "user": {
                "id": str(user["_id"]),
                "name": user["name"],
                "username": username,
                "email": user["email"],
                "bio": user.get("bio", ""),
                "avatar_url": user.get("avatar_url", ""),
                "avatar_color": user.get("avatar_color", "#1a73e8"),
                "storage_used_bytes": user.get("storage_used_bytes", 0),
                "storage_limit_bytes": user.get("storage_limit_bytes", 15 * 1024 * 1024 * 1024)
            }
        }))
        resp.set_cookie("token", token, httponly=True, samesite="Lax", max_age=14*24*3600)
        return resp
    except Exception as e:
        if isinstance(e, HTTPException):
            return jsonify({"success": False, "error": e.description}), e.code
        print("Login error:", e)
        return jsonify({"success": False, "error": f"Login failed: {str(e)}"}), 500

@app.route("/api/auth/logout", methods=["POST"])
def logout():
    resp = make_response(jsonify({"success": True, "message": "Logged out successfully."}))
    resp.set_cookie("token", "", expires=0)
    return resp

@app.route("/api/auth/me", methods=["GET"])
def get_me():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    database = get_db()
    user = database.users.find_one({"_id": ObjectId(auth_user["id"])})
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    username = user.get("username")
    if not username:
        username = re.sub(r'[^a-z0-9_-]', '', user["email"].split("@")[0].lower()) or "user"
        database.users.update_one({"_id": user["_id"]}, {"$set": {"username": username}})

    # Recalculate true active storage consumption
    storage_used = int(user.get("storage_used_bytes", 0) or 0)
    try:
        active_files = list(database.files.find({"user_id": user_id_match(user["_id"]), "is_trashed": {"$ne": True}}))
        calculated = 0
        for f in active_files:
            try:
                calculated += int(float(f.get("size", 0) or 0))
            except Exception:
                pass
        storage_used = calculated
        if storage_used != user.get("storage_used_bytes"):
            database.users.update_one({"_id": user["_id"]}, {"$set": {"storage_used_bytes": storage_used}})
    except Exception:
        pass

    return jsonify({
        "success": True,
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "username": username,
            "email": user["email"],
            "bio": user.get("bio", ""),
            "avatar_url": user.get("avatar_url", ""),
            "avatar_color": user.get("avatar_color", "#1a73e8"),
            "storage_used_bytes": storage_used,
            "storage_limit_bytes": user.get("storage_limit_bytes", 15 * 1024 * 1024 * 1024)
        }
    })

@app.route("/api/auth/profile", methods=["PATCH"])
def update_profile():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    database = get_db()
    user_id = ObjectId(auth_user["id"])

    updates = {}
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"success": False, "error": "Name cannot be empty."}), 400
        updates["name"] = name

    if "username" in data:
        raw_uname = (data["username"] or "").strip().lower()
        clean_uname = re.sub(r'[^a-z0-9_-]', '', raw_uname)
        if len(clean_uname) < 2 or len(clean_uname) > 30:
            return jsonify({"success": False, "error": "Username must be between 2 and 30 characters (alphanumeric, underscores, hyphens)."}), 400
        
        # Check uniqueness if changed
        existing = database.users.find_one({"username": clean_uname, "_id": {"$ne": user_id}})
        if existing:
            return jsonify({"success": False, "error": f"Username '@{clean_uname}' is already taken. Please choose another."}), 400
        updates["username"] = clean_uname

    if "bio" in data:
        bio = str(data["bio"] or "").strip()[:200]
        updates["bio"] = bio

    if "avatar_url" in data:
        updates["avatar_url"] = str(data["avatar_url"] or "").strip()

    if not updates:
        return jsonify({"success": False, "error": "No updates provided."}), 400

    updates["updated_at"] = datetime.datetime.utcnow()
    user = database.users.find_one_and_update(
        {"_id": user_id},
        {"$set": updates},
        return_document=True
    )

    return jsonify({
        "success": True,
        "message": "Profile updated successfully.",
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "username": user.get("username", ""),
            "email": user["email"],
            "bio": user.get("bio", ""),
            "avatar_url": user.get("avatar_url", ""),
            "avatar_color": user.get("avatar_color", "#1a73e8"),
            "storage_used_bytes": user.get("storage_used_bytes", 0),
            "storage_limit_bytes": user.get("storage_limit_bytes", 15 * 1024 * 1024 * 1024)
        }
    })

@app.route("/api/auth/profile/avatar", methods=["POST"])
def upload_avatar():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    if "avatar" not in request.files:
        return jsonify({"success": False, "error": "No avatar file provided."}), 400

    avatar_file = request.files["avatar"]
    if not avatar_file.filename:
        return jsonify({"success": False, "error": "No file selected."}), 400

    filename = avatar_file.filename
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("jpg", "jpeg", "png", "webp", "gif", "svg", "avif"):
        return jsonify({"success": False, "error": "Profile picture must be an image (JPG, PNG, WEBP, GIF, SVG)."}), 400

    file_bytes = avatar_file.read()
    mime_type = avatar_file.mimetype or "image/jpeg"

    try:
        target_url = f"{MEDIA_HOST_URL}/api/upload"
        files_payload = {"file": (filename, file_bytes, mime_type)}
        headers = {"X-API-Key": HAUL_MEDIA_API_KEY}
        resp = requests.post(target_url, headers=headers, files=files_payload, timeout=60)
        if not resp.ok:
            return jsonify({"success": False, "error": f"Upload rejected: {resp.text}"}), 502
        res_json = resp.json()
        hosted_url = res_json.get("url") or res_json.get("display_url")
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to upload avatar: {str(e)}"}), 502

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    database.users.update_one(
        {"_id": user_id},
        {"$set": {"avatar_url": hosted_url, "updated_at": datetime.datetime.utcnow()}}
    )

    user = database.users.find_one({"_id": user_id})
    return jsonify({
        "success": True,
        "avatar_url": hosted_url,
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "username": user.get("username", ""),
            "email": user["email"],
            "bio": user.get("bio", ""),
            "avatar_url": hosted_url,
            "avatar_color": user.get("avatar_color", "#1a73e8"),
            "storage_used_bytes": user.get("storage_used_bytes", 0),
            "storage_limit_bytes": user.get("storage_limit_bytes", 15 * 1024 * 1024 * 1024)
        }
    })



# ==========================================
# SETTINGS & ACCOUNT ENDPOINTS
# ==========================================

@app.route("/api/auth/change-password", methods=["POST"])
def change_password():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""

    if not current_password or not new_password:
        return jsonify({"success": False, "error": "Both current and new password are required."}), 400
    if len(new_password) < 6:
        return jsonify({"success": False, "error": "New password must be at least 6 characters."}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    user = database.users.find_one({"_id": user_id})
    if not user or not bcrypt.checkpw(current_password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        return jsonify({"success": False, "error": "Current password is incorrect."}), 400

    salt = bcrypt.gensalt(10)
    new_hash = bcrypt.hashpw(new_password.encode("utf-8"), salt).decode("utf-8")
    database.users.update_one({"_id": user_id}, {"$set": {"password_hash": new_hash, "updated_at": datetime.datetime.utcnow()}})
    return jsonify({"success": True, "message": "Password updated successfully."})

@app.route("/api/auth/delete-account", methods=["POST"])
def delete_account():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    password = data.get("password") or ""
    if not password:
        return jsonify({"success": False, "error": "Password confirmation is required to delete your account."}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    user = database.users.find_one({"_id": user_id})
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    if not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        return jsonify({"success": False, "error": "Incorrect password. Account deletion aborted."}), 400

    # Purge all files on media engine if delete_token exists
    all_files = list(database.files.find({"user_id": user_id}))
    for f in all_files:
        if f.get("delete_token"):
            try:
                requests.post(f"{MEDIA_HOST_URL}/delete/{f['delete_token']}", timeout=3)
            except Exception:
                pass

    # Delete all database records for this user
    database.files.delete_many({"user_id": user_id_match(user_id)})
    database.folders.delete_many({"user_id": user_id_match(user_id)})
    database.activities.delete_many({"user_id": user_id_match(user_id)})
    database.users.delete_one({"_id": user_id})

    # Clear auth cookie
    resp = jsonify({"success": True, "message": "Account and all associated files deleted successfully."})
    resp.set_cookie("auth_token", "", expires=0, httponly=True, samesite="Lax")
    return resp

@app.route("/api/user/storage-stats", methods=["GET"])
@app.route("/api/storage/info", methods=["GET"])
def get_storage_stats():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    database = get_db()
    uid = ObjectId(auth_user["id"])
    files = list(database.files.find({"user_id": user_id_match(uid)}))

    breakdown = {"image": 0, "video": 0, "audio": 0, "document": 0, "archive": 0, "code": 0, "other": 0}
    trashed_bytes = 0
    trashed_count = 0
    total_active_bytes = 0

    for f in files:
        try:
            sz = int(float(f.get("size", 0) or 0))
        except Exception:
            sz = 0
        if f.get("is_trashed"):
            trashed_bytes += sz
            trashed_count += 1
        else:
            total_active_bytes += sz
            cat = f.get("category", "other")
            if cat in breakdown:
                breakdown[cat] += sz
            else:
                breakdown["other"] += sz

    database.users.update_one({"_id": uid}, {"$set": {"storage_used_bytes": total_active_bytes}})
    user = database.users.find_one({"_id": uid}) or {}

    return jsonify({
        "success": True,
        "storage_used": total_active_bytes,
        "storage_limit": user.get("storage_limit_bytes", 15 * 1024 * 1024 * 1024),
        "breakdown": breakdown,
        "trashed_bytes": trashed_bytes,
        "trashed_count": trashed_count
    })

@app.route("/api/files/empty-trash", methods=["POST"])
def empty_trash():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    database = get_db()
    uid = ObjectId(auth_user["id"])
    trashed_files = list(database.files.find({"user_id": user_id_match(uid), "is_trashed": True}))

    for f in trashed_files:
        if f.get("delete_token"):
            try:
                requests.post(f"{MEDIA_HOST_URL}/delete/{f['delete_token']}", timeout=4)
            except Exception:
                pass

    database.files.delete_many({"user_id": user_id_match(uid), "is_trashed": True})

    # Recalculate storage used
    active_files = list(database.files.find({"user_id": user_id_match(uid), "is_trashed": False}))
    new_used = sum(int(f.get("size", 0) or 0) for f in active_files)
    database.users.update_one({"_id": uid}, {"$set": {"storage_used_bytes": new_used}})

    record_activity(uid, "empty_trash", "Trash", f"Emptied trash ({len(trashed_files)} item(s) permanently removed)", "system")

    return jsonify({"success": True, "deleted_count": len(trashed_files), "new_storage_used": new_used})

# ==========================================
# ACTIVITY & ALERTS ENDPOINTS
# ==========================================

@app.route("/api/activities", methods=["GET"])
def get_activities():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    cursor = database.activities.find({"user_id": user_id}).sort("created_at", -1).limit(50)
    activities = [serialize_doc(doc) for doc in cursor]
    return jsonify({"success": True, "activities": activities})

@app.route("/api/activities/clear", methods=["POST"])
def clear_activities():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    database.activities.delete_many({"user_id": user_id})
    return jsonify({"success": True, "message": "Activity history cleared."})

@app.route("/api/activities/log", methods=["POST"])
def client_log_activity():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    action = data.get("action") or "custom"
    item_name = data.get("item_name") or "Item"
    details = data.get("details") or ""
    item_type = data.get("item_type") or "file"
    metadata = data.get("metadata") or {}

    record_activity(auth_user["id"], action, item_name, details, item_type, metadata)
    return jsonify({"success": True})



# ==========================================
# FOLDER ENDPOINTS
# ==========================================

@app.route("/api/folders", methods=["GET"])
def list_folders():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    parent_param = request.args.get("parentId")
    is_starred = request.args.get("starred") == "true"
    is_trashed = request.args.get("trashed") == "true"

    parent_id = None
    if parent_param and parent_param not in ("root", "null"):
        try:
            parent_id = ObjectId(parent_param)
        except Exception:
            parent_id = None

    query = {"user_id": user_id_match(user_id), "is_trashed": {"$eq": True} if is_trashed else {"$ne": True}}
    if is_starred:
        query["is_starred"] = True
    elif not is_trashed:
        query["parent_id"] = parent_id

    folders_cursor = database.folders.find(query).sort("name", 1)
    folders = [serialize_doc(f) for f in folders_cursor]

    # Breadcrumbs
    breadcrumbs = [{"id": None, "name": "My Drive"}]
    if parent_id:
        path = []
        curr = database.folders.find_one({"_id": parent_id, "user_id": user_id})
        while curr:
            path.insert(0, {"id": str(curr["_id"]), "name": curr["name"]})
            if curr.get("parent_id"):
                curr = database.folders.find_one({"_id": curr["parent_id"], "user_id": user_id})
            else:
                curr = None
        breadcrumbs.extend(path)

    return jsonify({"success": True, "folders": folders, "breadcrumbs": breadcrumbs})

@app.route("/api/folders", methods=["POST"])
def create_folder():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"success": False, "error": "Folder name is required."}), 400

    parent_param = data.get("parentId")
    parent_id = ObjectId(parent_param) if parent_param and parent_param not in ("root", "null") else None
    color = data.get("color") or "#5f6368"

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    now = datetime.datetime.utcnow()

    folder_doc = {
        "name": name,
        "user_id": user_id,
        "parent_id": parent_id,
        "color": color,
        "is_public": False,
        "is_starred": False,
        "is_trashed": False,
        "created_at": now,
        "updated_at": now
    }
    res = database.folders.insert_one(folder_doc)
    folder_doc["_id"] = res.inserted_id

    record_activity(user_id, "create_folder", name, f"Created folder '{name}'", "folder")

    return jsonify({"success": True, "folder": serialize_doc(folder_doc)}), 201

@app.route("/api/folders/<folder_id>", methods=["PATCH"])
def update_folder(folder_id):
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    try:
        fid = ObjectId(folder_id)
    except Exception:
        return jsonify({"success": False, "error": "Invalid folder ID"}), 400

    data = request.get_json() or {}
    database = get_db()
    user_id = ObjectId(auth_user["id"])

    updates = {"updated_at": datetime.datetime.utcnow()}
    if "name" in data and data["name"].strip():
        updates["name"] = data["name"].strip()
    if "color" in data:
        updates["color"] = data["color"]
    if "isStarred" in data:
        updates["is_starred"] = bool(data["isStarred"])
    if "isTrashed" in data:
        updates["is_trashed"] = bool(data["isTrashed"])
    if "parentId" in data:
        pid = data["parentId"]
        updates["parent_id"] = ObjectId(pid) if pid and pid not in ("root", "null") else None

    result = database.folders.find_one_and_update(
        {"_id": fid, "user_id": user_id},
        {"$set": updates},
        return_document=True
    )
    if not result:
        return jsonify({"success": False, "error": "Folder not found"}), 404

    return jsonify({"success": True, "folder": serialize_doc(result)})

@app.route("/api/folders/<folder_id>", methods=["DELETE"])
def delete_folder(folder_id):
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    try:
        fid = ObjectId(folder_id)
    except Exception:
        return jsonify({"success": False, "error": "Invalid folder ID"}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])

    # Remove folder and soft-trash children
    database.folders.delete_one({"_id": fid, "user_id": user_id})
    database.files.update_many({"folder_id": fid, "user_id": user_id}, {"$set": {"is_trashed": True}})

    return jsonify({"success": True, "message": "Folder deleted."})

@app.route("/api/folders/move", methods=["POST"])
def move_folder():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    folder_id = data.get("folderId")
    target_param = data.get("targetParentId")

    if not folder_id:
        return jsonify({"success": False, "error": "Folder ID is required."}), 400

    try:
        fid = ObjectId(folder_id)
        target_pid = ObjectId(target_param) if target_param and target_param not in ("root", "null") else None
    except Exception:
        return jsonify({"success": False, "error": "Invalid folder ID format."}), 400

    if target_pid and target_pid == fid:
        return jsonify({"success": False, "error": "Cannot move a folder into itself."}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])

    database.folders.update_one(
        {"_id": fid, "user_id": user_id},
        {"$set": {"parent_id": target_pid, "updated_at": datetime.datetime.utcnow()}}
    )
    return jsonify({"success": True, "message": "Folder moved successfully."})

@app.route("/api/folders/<folder_id>/visibility", methods=["PATCH"])
def toggle_folder_visibility(folder_id):
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    is_public = bool(data.get("isPublic", True))

    try:
        fid = ObjectId(folder_id)
    except Exception:
        return jsonify({"success": False, "error": "Invalid folder ID"}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])

    res = database.folders.find_one_and_update(
        {"_id": fid, "user_id": user_id},
        {"$set": {"is_public": is_public, "updated_at": datetime.datetime.utcnow()}},
        return_document=True
    )
    if not res:
        return jsonify({"success": False, "error": "Folder not found."}), 404

    database.files.update_many(
        {"folder_id": fid, "user_id": user_id},
        {"$set": {"is_public": is_public}}
    )
    record_activity(user_id, "visibility", res.get("name", "Folder"), f"Changed folder '{res.get('name')}' to {'Public' if is_public else 'Private'}", "folder", {"visibility": "public" if is_public else "private"})
    return jsonify({"success": True, "folder": serialize_doc(res)})

# ==========================================
# FILE ENDPOINTS (DIRECT CLOUDFLARE UPLOADS & METADATA RECORDING)
# ==========================================

@app.route("/api/config", methods=["GET"])
def get_config():
    auth_user = authenticate()
    data = {
        "success": True,
        "media_host_url": MEDIA_HOST_URL,
        "upload_url": f"{MEDIA_HOST_URL}/api/upload",
        "hosturl_url": f"{MEDIA_HOST_URL}/hosturl"
    }
    if auth_user:
        data["api_key"] = HAUL_MEDIA_API_KEY
    return jsonify(data)

@app.route("/api/files/record", methods=["POST"])
def record_file():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    hosted_url = (data.get("hosted_url") or data.get("url") or data.get("data") or "").strip()
    if not hosted_url:
        return jsonify({"success": False, "error": "File hosted URL is required."}), 400

    filename = (data.get("name") or data.get("filename") or "file.bin").strip()
    file_size = int(data.get("size") or 0)
    mime_type = (data.get("mime_type") or data.get("media_type") or "application/octet-stream").strip()
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    category = detect_category(ext, mime_type)

    folder_param = data.get("folder_id") or data.get("folderId")
    folder_id = ObjectId(folder_param) if folder_param and str(folder_param) not in ("root", "null", "undefined") else None
    is_public = bool(data.get("is_public", False))
    is_encrypted = bool(data.get("is_encrypted", False))
    encryption_meta = data.get("encryption_meta") or {}
    delete_token = data.get("delete_token") or ""

    database = get_db()
    user_id = ObjectId(auth_user["id"])

    now = datetime.datetime.utcnow()
    file_doc = {
        "name": filename,
        "user_id": user_id,
        "folder_id": folder_id,
        "size": file_size,
        "mime_type": mime_type,
        "extension": ext,
        "category": category,
        "hosted_url": hosted_url,
        "delete_token": delete_token,
        "is_public": is_public,
        "is_encrypted": is_encrypted,
        "encryption_meta": encryption_meta,
        "is_starred": False,
        "is_trashed": False,
        "tags": [],
        "views": 0,
        "downloads": 0,
        "created_at": now,
        "updated_at": now
    }
    ins_res = database.files.insert_one(file_doc)
    file_doc["_id"] = ins_res.inserted_id

    # Increment user storage consumption
    if file_size > 0:
        database.users.update_one({"_id": user_id}, {"$inc": {"storage_used_bytes": file_size}})

    # Log activity
    act_msg = f"Uploaded encrypted '{filename}' ({category.capitalize()})" if is_encrypted else f"Uploaded '{filename}' ({category.capitalize()})"
    record_activity(user_id, "upload", filename, act_msg, "file", {"size": file_size, "category": category, "encrypted": is_encrypted})

    serialized = serialize_doc(file_doc)
    trigger_webhooks(user_id, "file.uploaded", serialized)
    return jsonify({"success": True, "file": serialized, "files": [serialized]}), 201

@app.route("/api/files/upload", methods=["POST"])
def upload_files():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    if "files" not in request.files:
        return jsonify({"success": False, "error": "No files provided."}), 400

    files = request.files.getlist("files")
    if not files or len(files) == 0:
        return jsonify({"success": False, "error": "No files provided."}), 400

    folder_param = request.form.get("folderId")
    folder_id = ObjectId(folder_param) if folder_param and folder_param not in ("root", "null") else None
    is_public_pref = request.form.get("is_public") == "true"

    database = get_db()
    user_id = ObjectId(auth_user["id"])

    uploaded_items = []
    total_bytes = 0

    for file_obj in files:
        if not file_obj.filename:
            continue

        filename = file_obj.filename
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        mime_type = file_obj.mimetype or "application/octet-stream"
        category = detect_category(ext, mime_type)

        file_bytes = file_obj.read()
        file_size = len(file_bytes)

        # Upload directly to CommonThread storage engine
        try:
            target_url = f"{MEDIA_HOST_URL}/api/upload"
            files_payload = {"file": (filename, file_bytes, mime_type)}
            headers = {"X-API-Key": HAUL_MEDIA_API_KEY}
            
            resp = requests.post(target_url, headers=headers, files=files_payload, timeout=60)
            if not resp.ok:
                return jsonify({"success": False, "error": f"Storage engine rejected upload ({resp.status_code}): {resp.text}"}), 502

            res_json = resp.json()
            hosted_url = res_json.get("url") or res_json.get("display_url")
            delete_token = res_json.get("delete_token", "")
            final_size = res_json.get("size", file_size)

        except Exception as e:
            return jsonify({"success": False, "error": f"Failed to upload {filename} to media storage: {str(e)}"}), 502

        now = datetime.datetime.utcnow()
        file_doc = {
            "name": filename,
            "user_id": user_id,
            "folder_id": folder_id,
            "size": final_size,
            "mime_type": mime_type,
            "extension": ext,
            "category": category,
            "hosted_url": hosted_url,
            "delete_token": delete_token,
            "is_public": is_public_pref,
            "is_starred": False,
            "is_trashed": False,
            "tags": [],
            "views": 0,
            "downloads": 0,
            "created_at": now,
            "updated_at": now
        }
        ins_res = database.files.insert_one(file_doc)
        file_doc["_id"] = ins_res.inserted_id

        uploaded_items.append(serialize_doc(file_doc))
        total_bytes += final_size
        record_activity(user_id, "upload", filename, f"Uploaded '{filename}' ({detect_category(ext).capitalize()})", "file", {"size": final_size, "category": category})

    # Increment user's storage consumption
    if total_bytes > 0:
        database.users.update_one({"_id": user_id}, {"$inc": {"storage_used_bytes": total_bytes}})

    return jsonify({"success": True, "files": uploaded_items}), 201

@app.route("/api/files", methods=["GET"])
def list_files():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    database = get_db()
    user_id = ObjectId(auth_user["id"])

    # Pagination: 15-20 per page as specified
    try:
        page = max(1, int(request.args.get("page", 1)))
        limit = max(1, min(50, int(request.args.get("limit", 20))))
    except ValueError:
        page, limit = 1, 20
    skip = (page - 1) * limit

    folder_param = request.args.get("folderId")
    category = request.args.get("category")
    is_starred = request.args.get("starred") == "true"
    is_trashed = request.args.get("trashed") == "true"
    search = (request.args.get("search") or "").strip()

    query = {"user_id": user_id_match(user_id), "is_trashed": {"$eq": True} if is_trashed else {"$ne": True}}

    if search:
        query["$or"] = [
            {"name": {"$regex": re.escape(search), "$options": "i"}},
            {"extension": {"$regex": re.escape(search), "$options": "i"}}
        ]
    elif is_starred:
        query["is_starred"] = True
    elif category and category != "all":
        query["category"] = category
    elif not is_trashed:
        parent_id = ObjectId(folder_param) if folder_param and folder_param not in ("root", "null") else None
        query["folder_id"] = parent_id

    # Sorting
    sort_param = request.args.get("sort", "newest")
    sort_rule = [("created_at", -1)]
    if sort_param == "name_asc":
        sort_rule = [("name", 1)]
    elif sort_param == "name_desc":
        sort_rule = [("name", -1)]
    elif sort_param == "size_asc":
        sort_rule = [("size", 1)]
    elif sort_param == "size_desc":
        sort_rule = [("size", -1)]
    elif sort_param == "oldest":
        sort_rule = [("created_at", 1)]

    total_count = database.files.count_documents(query)
    cursor = database.files.find(query).sort(sort_rule).skip(skip).limit(limit)
    files = [serialize_doc(f) for f in cursor]

    has_more = (skip + len(files)) < total_count

    resp = make_response(jsonify({
        "success": True,
        "files": files,
        "page": page,
        "limit": limit,
        "total_count": total_count,
        "has_more": has_more
    }))
    # Cache headers for fast prefetching
    resp.headers["Cache-Control"] = "private, max-age=5"
    return resp

@app.route("/api/files/<file_id>", methods=["PATCH"])
def update_file(file_id):
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    try:
        fid = ObjectId(file_id)
    except Exception:
        return jsonify({"success": False, "error": "Invalid file ID"}), 400

    data = request.get_json() or {}
    database = get_db()
    user_id = ObjectId(auth_user["id"])

    updates = {"updated_at": datetime.datetime.utcnow()}
    if "name" in data and data["name"].strip():
        name = data["name"].strip()
        updates["name"] = name
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        updates["extension"] = ext
        updates["category"] = detect_category(ext)
    if "folderId" in data:
        pid = data["folderId"]
        updates["folder_id"] = ObjectId(pid) if pid and pid not in ("root", "null") else None
    if "isStarred" in data:
        updates["is_starred"] = bool(data["isStarred"])
    if "isTrashed" in data:
        updates["is_trashed"] = bool(data["isTrashed"])

    res = database.files.find_one_and_update(
        {"_id": fid, "user_id": user_id},
        {"$set": updates},
        return_document=True
    )
    if not res:
        return jsonify({"success": False, "error": "File not found"}), 404

    return jsonify({"success": True, "file": serialize_doc(res)})

@app.route("/api/files/<file_id>", methods=["DELETE"])
def delete_file(file_id):
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    try:
        fid = ObjectId(file_id)
    except Exception:
        return jsonify({"success": False, "error": "Invalid file ID"}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    permanent = request.args.get("permanent") == "true"

    file_doc = database.files.find_one({"_id": fid, "user_id": user_id})
    if not file_doc:
        return jsonify({"success": False, "error": "File not found"}), 404

    if not permanent and not file_doc.get("is_trashed"):
        database.files.update_one({"_id": fid}, {"$set": {"is_trashed": True, "updated_at": datetime.datetime.utcnow()}})
        record_activity(user_id, "delete", file_doc.get("name", "File"), f"Moved '{file_doc.get('name')}' to Trash", "file")
        return jsonify({"success": True, "message": "Moved to trash."})

    # Permanent delete
    database.files.delete_one({"_id": fid, "user_id": user_id})
    database.users.update_one({"_id": user_id}, {"$inc": {"storage_used_bytes": -file_doc.get("size", 0)}})
    record_activity(user_id, "delete", file_doc.get("name", "File"), f"Permanently deleted '{file_doc.get('name')}'", "file")

    # Clean up on media engine if deleteToken exists
    if file_doc.get("delete_token"):
        try:
            requests.post(f"{MEDIA_HOST_URL}/delete/{file_doc['delete_token']}", timeout=5)
        except Exception:
            pass

    return jsonify({"success": True, "message": "Permanently deleted."})

@app.route("/api/files/move", methods=["POST"])
def move_files():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    file_ids = data.get("fileIds") or []
    target_param = data.get("targetFolderId")
    target_fid = ObjectId(target_param) if target_param and target_param not in ("root", "null") else None

    if not file_ids:
        return jsonify({"success": False, "error": "No files selected to move."}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    obj_ids = [ObjectId(f) for f in file_ids if f]

    database.files.update_many(
        {"_id": {"$in": obj_ids}, "user_id": user_id},
        {"$set": {"folder_id": target_fid, "updated_at": datetime.datetime.utcnow()}}
    )
    record_activity(user_id, "move", f"{len(obj_ids)} files", f"Moved {len(obj_ids)} item(s) to another folder", "file", {"count": len(obj_ids)})
    return jsonify({"success": True, "message": f"Successfully moved {len(obj_ids)} file(s)."})

@app.route("/api/files/<file_id>/visibility", methods=["PATCH"])
def toggle_file_visibility(file_id):
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    is_public = bool(data.get("isPublic", True))

    try:
        fid = ObjectId(file_id)
    except Exception:
        return jsonify({"success": False, "error": "Invalid file ID"}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])

    res = database.files.find_one_and_update(
        {"_id": fid, "user_id": user_id},
        {"$set": {"is_public": is_public, "updated_at": datetime.datetime.utcnow()}},
        return_document=True
    )
    if not res:
        return jsonify({"success": False, "error": "File not found."}), 404

    record_activity(user_id, "visibility", res.get("name", "File"), f"Changed '{res.get('name')}' to {'Public' if is_public else 'Private'}", "file", {"visibility": "public" if is_public else "private"})
    return jsonify({"success": True, "file": serialize_doc(res)})

@app.route("/api/files/bulk-visibility", methods=["POST"])
def bulk_file_visibility():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    file_ids = data.get("fileIds", [])
    is_public = bool(data.get("isPublic", False))

    if not file_ids:
        return jsonify({"success": False, "error": "No files selected."}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    obj_ids = [ObjectId(f) for f in file_ids if f]

    database.files.update_many(
        {"_id": {"$in": obj_ids}, "user_id": user_id},
        {"$set": {"is_public": is_public, "updated_at": datetime.datetime.utcnow()}}
    )
    record_activity(user_id, "visibility", f"{len(obj_ids)} files", f"Changed {len(obj_ids)} file(s) to {'Public' if is_public else 'Private'}", "file", {"count": len(obj_ids), "visibility": "public" if is_public else "private"})
    return jsonify({"success": True, "message": f"Updated visibility for {len(obj_ids)} file(s)."})

@app.route("/api/files/bulk-delete", methods=["POST"])
def bulk_delete_files():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    file_ids = data.get("fileIds", [])
    permanent = bool(data.get("permanent", False))

    if not file_ids:
        return jsonify({"success": False, "error": "No files selected."}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    obj_ids = [ObjectId(f) for f in file_ids if f]

    if permanent:
        files_to_del = list(database.files.find({"_id": {"$in": obj_ids}, "user_id": user_id}))
        total_size = sum(f.get("size", 0) for f in files_to_del)
        database.files.delete_many({"_id": {"$in": obj_ids}, "user_id": user_id})
        if total_size > 0:
            database.users.update_one({"_id": user_id}, {"$inc": {"storage_used_bytes": -total_size}})
        record_activity(user_id, "delete", f"{len(obj_ids)} files", f"Permanently deleted {len(obj_ids)} file(s)", "file", {"count": len(obj_ids)})
    else:
        database.files.update_many(
            {"_id": {"$in": obj_ids}, "user_id": user_id},
            {"$set": {"is_trashed": True, "updated_at": datetime.datetime.utcnow()}}
        )
        record_activity(user_id, "delete", f"{len(obj_ids)} files", f"Moved {len(obj_ids)} file(s) to Trash", "file", {"count": len(obj_ids)})

    trigger_webhooks(user_id, "file.deleted", {"count": len(obj_ids), "permanent": permanent})
    return jsonify({"success": True, "message": f"Processed {len(obj_ids)} file(s)."})

@app.route("/api/files/bulk-move", methods=["POST"])
def bulk_move_files():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    file_ids = data.get("fileIds", [])
    folder_param = data.get("folderId")
    folder_id = ObjectId(folder_param) if folder_param and str(folder_param) not in ("root", "null", "undefined") else None

    if not file_ids:
        return jsonify({"success": False, "error": "No files selected."}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    obj_ids = [ObjectId(f) for f in file_ids if f]

    database.files.update_many(
        {"_id": {"$in": obj_ids}, "user_id": user_id},
        {"$set": {"folder_id": folder_id, "updated_at": datetime.datetime.utcnow()}}
    )
    record_activity(user_id, "move", f"{len(obj_ids)} files", f"Moved {len(obj_ids)} file(s)", "file", {"count": len(obj_ids)})
    return jsonify({"success": True, "message": f"Moved {len(obj_ids)} file(s)."})

@app.route("/api/files/bulk-restore", methods=["POST"])
def bulk_restore_files():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    file_ids = data.get("fileIds", [])
    if not file_ids:
        return jsonify({"success": False, "error": "No files selected."}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    obj_ids = [ObjectId(f) for f in file_ids if f]

    database.files.update_many(
        {"_id": {"$in": obj_ids}, "user_id": user_id},
        {"$set": {"is_trashed": False, "updated_at": datetime.datetime.utcnow()}}
    )
    record_activity(user_id, "restore", f"{len(obj_ids)} files", f"Restored {len(obj_ids)} file(s) from Trash", "file", {"count": len(obj_ids)})
    return jsonify({"success": True, "message": f"Restored {len(obj_ids)} file(s)."})

# ==========================================
# INLINE FILE EDITING / CONTENT SAVE
# ==========================================

@app.route("/api/files/save-content", methods=["POST"])
def save_file_content():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    file_id = data.get("file_id") or data.get("fileId")
    content = data.get("content", "")

    if not file_id:
        return jsonify({"success": False, "error": "file_id is required."}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    obj_id = ObjectId(file_id)

    file_doc = database.files.find_one({"_id": obj_id, "user_id": user_id})
    if not file_doc:
        return jsonify({"success": False, "error": "File not found or access denied."}), 404

    content_bytes = content.encode("utf-8")
    new_size = len(content_bytes)
    old_size = file_doc.get("size", 0)
    size_diff = new_size - old_size

    new_url = file_doc.get("hosted_url")
    filename = file_doc.get("name", "document.txt")
    mime_type = file_doc.get("mime_type", "text/plain")

    try:
        files = {"file": (filename, content_bytes, mime_type)}
        headers = {"X-Api-Key": HAUL_MEDIA_API_KEY}
        resp = requests.post(f"{MEDIA_HOST_URL}/upload", files=files, headers=headers, timeout=15)
        if resp.status_code == 200:
            res_data = resp.json()
            new_url = res_data.get("url") or res_data.get("data") or new_url
    except Exception as e:
        print("Worker re-upload notice:", e)

    now = datetime.datetime.utcnow()
    database.files.update_one(
        {"_id": obj_id},
        {
            "$set": {
                "size": new_size,
                "hosted_url": new_url,
                "updated_at": now
            }
        }
    )

    if size_diff != 0:
        database.users.update_one({"_id": user_id}, {"$inc": {"storage_used_bytes": size_diff}})

    record_activity(user_id, "edit", filename, f"Edited content of '{filename}' ({new_size} bytes)", "file", {"size": new_size})
    
    updated_doc = database.files.find_one({"_id": obj_id})
    serialized = serialize_doc(updated_doc)
    trigger_webhooks(user_id, "file.updated", serialized)

    return jsonify({"success": True, "file": serialized})

# ==========================================
# EXPIRING & PASSWORD PROTECTED SHARE LINKS
# ==========================================

@app.route("/api/shares/create", methods=["POST"])
def create_share():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    file_id = data.get("file_id") or data.get("fileId")
    if not file_id:
        return jsonify({"success": False, "error": "file_id is required."}), 400

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    file_doc = database.files.find_one({"_id": ObjectId(file_id), "user_id": user_id})
    if not file_doc:
        return jsonify({"success": False, "error": "File not found."}), 404

    expires_in_hours = data.get("expires_in_hours")
    burn_after_reading = bool(data.get("burn_after_reading", False))
    password = (data.get("password") or "").strip()

    expires_at = None
    if expires_in_hours and float(expires_in_hours) > 0:
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(hours=float(expires_in_hours))

    password_hash = None
    if password:
        password_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()

    token = secrets.token_urlsafe(12)
    share_doc = {
        "token": token,
        "file_id": ObjectId(file_id),
        "user_id": user_id,
        "password_hash": password_hash,
        "expires_at": expires_at,
        "burn_after_reading": burn_after_reading,
        "is_burned": False,
        "view_count": 0,
        "created_at": datetime.datetime.utcnow()
    }
    database.shares.insert_one(share_doc)

    record_activity(user_id, "share", file_doc["name"], f"Created secure link for '{file_doc['name']}'", "file", {"burn": burn_after_reading, "has_password": bool(password)})
    trigger_webhooks(user_id, "file.shared", {"file_name": file_doc["name"], "token": token, "burn": burn_after_reading})

    forwarded_proto = request.headers.get("X-Forwarded-Proto", "https")
    forwarded_host = request.headers.get("X-Forwarded-Host") or request.host
    origin = f"{forwarded_proto}://{forwarded_host}" if forwarded_host else request.host_url.rstrip("/")

    return jsonify({
        "success": True,
        "token": token,
        "share_url": f"{origin}/s/{token}",
        "expires_at": expires_at.isoformat() if expires_at else None,
        "burn_after_reading": burn_after_reading,
        "has_password": bool(password)
    })

@app.route("/api/shares/<token>", methods=["GET"])
def get_share_meta(token):
    database = get_db()
    share = database.shares.find_one({"token": token})
    if not share:
        return jsonify({"success": False, "error": "Share link not found or invalid."}), 404

    if share.get("is_burned"):
        return jsonify({"success": False, "error": "This file was set to burn after reading and has already been viewed.", "burned": True}), 410

    if share.get("expires_at") and share["expires_at"] < datetime.datetime.utcnow():
        return jsonify({"success": False, "error": "This secure link has expired.", "expired": True}), 410

    file_doc = database.files.find_one({"_id": share["file_id"]})
    if not file_doc:
        return jsonify({"success": False, "error": "The shared file no longer exists."}), 404

    return jsonify({
        "success": True,
        "token": token,
        "requires_password": bool(share.get("password_hash")),
        "burn_after_reading": bool(share.get("burn_after_reading")),
        "expires_at": share["expires_at"].isoformat() if share.get("expires_at") else None,
        "file_name": file_doc["name"],
        "file_size": file_doc["size"],
        "category": file_doc.get("category", "document"),
        "extension": file_doc.get("extension", ""),
        "created_at": share["created_at"].isoformat() if isinstance(share.get("created_at"), datetime.datetime) else None
    })

@app.route("/api/shares/<token>/access", methods=["POST"])
def access_share(token):
    database = get_db()
    share = database.shares.find_one({"token": token})
    if not share:
        return jsonify({"success": False, "error": "Share link not found or invalid."}), 404

    if share.get("is_burned"):
        return jsonify({"success": False, "error": "This file has already self-destructed.", "burned": True}), 410

    if share.get("expires_at") and share["expires_at"] < datetime.datetime.utcnow():
        return jsonify({"success": False, "error": "This secure link has expired.", "expired": True}), 410

    if share.get("password_hash"):
        data = request.get_json() or {}
        entered_password = (data.get("password") or "").strip()
        entered_hash = hashlib.sha256(entered_password.encode("utf-8")).hexdigest()
        if entered_hash != share["password_hash"]:
            return jsonify({"success": False, "error": "Incorrect password for this secure link."}), 403

    file_doc = database.files.find_one({"_id": share["file_id"]})
    if not file_doc:
        return jsonify({"success": False, "error": "The shared file no longer exists."}), 404

    if share.get("burn_after_reading"):
        database.shares.update_one({"_id": share["_id"]}, {"$set": {"is_burned": True, "burned_at": datetime.datetime.utcnow()}, "$inc": {"view_count": 1}})
    else:
        database.shares.update_one({"_id": share["_id"]}, {"$inc": {"view_count": 1}})

    return jsonify({
        "success": True,
        "file": serialize_doc(file_doc)
    })

# ==========================================
# WEBHOOKS ENDPOINTS
# ==========================================

@app.route("/api/webhooks", methods=["GET"])
def get_webhooks():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    webhooks = list(database.webhooks.find({"user_id": user_id}).sort("created_at", -1))
    return jsonify({"success": True, "webhooks": [serialize_doc(w) for w in webhooks]})

@app.route("/api/webhooks", methods=["POST"])
def create_webhook():
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json() or {}
    url = (data.get("url") or "").strip()
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        return jsonify({"success": False, "error": "A valid HTTP/HTTPS webhook URL is required."}), 400

    name = (data.get("name") or "Webhook").strip()
    secret = (data.get("secret") or "").strip() or secrets.token_hex(16)
    events = data.get("events") or ["file.uploaded", "file.deleted", "file.shared"]

    database = get_db()
    user_id = ObjectId(auth_user["id"])

    wh_doc = {
        "user_id": user_id,
        "name": name,
        "url": url,
        "secret": secret,
        "events": events,
        "is_active": True,
        "created_at": datetime.datetime.utcnow()
    }
    res = database.webhooks.insert_one(wh_doc)
    wh_doc["_id"] = res.inserted_id

    return jsonify({"success": True, "webhook": serialize_doc(wh_doc)})

@app.route("/api/webhooks/<webhook_id>", methods=["DELETE"])
def delete_webhook(webhook_id):
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    database.webhooks.delete_one({"_id": ObjectId(webhook_id), "user_id": user_id})
    return jsonify({"success": True, "message": "Webhook deleted."})

@app.route("/api/webhooks/<webhook_id>/test", methods=["POST"])
def test_webhook(webhook_id):
    auth_user = authenticate()
    if not auth_user:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    database = get_db()
    user_id = ObjectId(auth_user["id"])
    wh = database.webhooks.find_one({"_id": ObjectId(webhook_id), "user_id": user_id})
    if not wh:
        return jsonify({"success": False, "error": "Webhook not found."}), 404

    try:
        dispatch_single_webhook(wh["url"], wh.get("secret"), "ping.test", {
            "message": "Shelfie Webhook Test Connection Succeeded!",
            "triggered_by": auth_user["name"],
            "timestamp": datetime.datetime.utcnow().isoformat()
        })
        return jsonify({"success": True, "message": "Test ping dispatched successfully!"})
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to deliver ping: {str(e)}"}), 500

# ==========================================
# PUBLIC PROFILE ENDPOINT (/<username>)
# ==========================================

@app.route("/api/public/<username>", methods=["GET"])
@app.route("/api/public/profile/<username>", methods=["GET"])
def get_public_profile(username):
    uname = (username or "").strip().lower()
    database = get_db()

    user = database.users.find_one({"username": uname})
    if not user:
        # Fallback check if user email prefix matches
        user = database.users.find_one({"email": {"$regex": f"^{re.escape(uname)}@", "$options": "i"}})

    if not user:
        return jsonify({"success": False, "error": f"User '@{uname}' was not found."}), 404

    auth_user = authenticate()
    is_owner = auth_user is not None and str(user["_id"]) == auth_user.get("id")

    parent_param = request.args.get("parentId")
    parent_id = ObjectId(parent_param) if parent_param and parent_param not in ("root", "null") else None

    # Tab handling: "public" vs "private" (Owner only can view private)
    tab = (request.args.get("tab") or "public").lower()
    if not is_owner or tab not in ("public", "private"):
        tab = "public"

    # Folder query
    folder_query = {"user_id": user["_id"], "is_trashed": False, "parent_id": parent_id}
    if tab == "private":
        folder_query["is_public"] = {"$ne": True}
    else:
        folder_query["is_public"] = True

    folders_cursor = database.folders.find(folder_query).sort("name", 1)
    folders = [serialize_doc(f) for f in folders_cursor]

    # Files query with pagination (15-20 per page)
    try:
        page = max(1, int(request.args.get("page", 1)))
        limit = max(1, min(50, int(request.args.get("limit", 20))))
    except ValueError:
        page, limit = 1, 20
    skip = (page - 1) * limit

    file_query = {"user_id": user["_id"], "is_trashed": False, "folder_id": parent_id}
    if tab == "private":
        file_query["is_public"] = {"$ne": True}
    else:
        file_query["is_public"] = True

    category = request.args.get("category")
    if category and category != "all":
        file_query["category"] = category

    search = (request.args.get("search") or "").strip()
    if search:
        file_query["$or"] = [
            {"name": {"$regex": re.escape(search), "$options": "i"}},
            {"extension": {"$regex": re.escape(search), "$options": "i"}}
        ]

    total_count = database.files.count_documents(file_query)
    files_cursor = database.files.find(file_query).sort("created_at", -1).skip(skip).limit(limit)
    files = [serialize_doc(f) for f in files_cursor]

    total_public_count = database.files.count_documents({"user_id": user["_id"], "is_trashed": False, "is_public": True})
    total_private_count = database.files.count_documents({"user_id": user["_id"], "is_trashed": False, "is_public": {"$ne": True}})

    breadcrumbs = [{"id": None, "name": f"{user['name']}'s Drive"}]
    if parent_id:
        path = []
        curr = database.folders.find_one({"_id": parent_id, "user_id": user["_id"]})
        while curr:
            path.insert(0, {"id": str(curr["_id"]), "name": curr["name"]})
            if curr.get("parent_id"):
                curr = database.folders.find_one({"_id": curr["parent_id"], "user_id": user["_id"]})
            else:
                curr = None
        breadcrumbs.extend(path)

    return jsonify({
        "success": True,
        "profile": {
            "name": user["name"],
            "username": user.get("username", uname),
            "bio": user.get("bio", ""),
            "avatar_url": user.get("avatar_url", ""),
            "avatar_color": user.get("avatar_color", "#1a73e8"),
            "created_at": user.get("created_at").isoformat() if isinstance(user.get("created_at"), datetime.datetime) else None,
            "total_public_files": total_public_count,
            "total_private_files": total_private_count
        },
        "is_owner": is_owner,
        "tab": tab,
        "folders": folders,
        "files": files,
        "breadcrumbs": breadcrumbs,
        "page": page,
        "limit": limit,
        "total_count": total_count,
        "has_more": (skip + len(files)) < total_count
    })

# ==========================================
# STATIC FRONTEND ROUTES (FOR LOCAL DEV & DIRECT VERCEL SERVING)
# ==========================================

@app.route("/api/index.py")
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_static(path=""):
    static_dir = os.path.join(os.path.dirname(__file__), "../public")
    if path and path != "api/index.py" and os.path.exists(os.path.join(static_dir, path)):
        return send_from_directory(static_dir, path)
    return send_from_directory(static_dir, "index.html")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    app.run(host="0.0.0.0", port=port, debug=True)
