import os
import re
import datetime
from bson import ObjectId
from flask import Flask, request, jsonify, send_from_directory, make_response
from flask_cors import CORS
from pymongo import MongoClient
import bcrypt
import jwt
import requests
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
        except Exception:
            pass
    return db

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

# ==========================================
# AUTH ENDPOINTS
# ==========================================

@app.route("/api/auth/register", methods=["POST"])
def register():
    try:
        data = request.get_json() or {}
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
                "avatar_color": avatar_color,
                "storage_used_bytes": 0,
                "storage_limit_bytes": user_doc["storage_limit_bytes"]
            }
        }), 201)
        resp.set_cookie("token", token, httponly=True, samesite="Lax", max_age=14*24*3600)
        return resp
    except Exception as e:
        print("Register error:", e)
        return jsonify({"success": False, "error": f"Registration failed: {str(e)}"}), 500

@app.route("/api/auth/login", methods=["POST"])
def login():
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not email or not password:
            return jsonify({"success": False, "error": "Email and password are required."}), 400

        database = get_db()
        user = database.users.find_one({"email": email})
        if not user:
            return jsonify({"success": False, "error": "Invalid email or password."}), 401

        if not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
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
                "avatar_color": user.get("avatar_color", "#1a73e8"),
                "storage_used_bytes": user.get("storage_used_bytes", 0),
                "storage_limit_bytes": user.get("storage_limit_bytes", 15 * 1024 * 1024 * 1024)
            }
        }))
        resp.set_cookie("token", token, httponly=True, samesite="Lax", max_age=14*24*3600)
        return resp
    except Exception as e:
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

    return jsonify({
        "success": True,
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "username": username,
            "email": user["email"],
            "avatar_color": user.get("avatar_color", "#1a73e8"),
            "storage_used_bytes": user.get("storage_used_bytes", 0),
            "storage_limit_bytes": user.get("storage_limit_bytes", 15 * 1024 * 1024 * 1024)
        }
    })

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

    query = {"user_id": user_id, "is_trashed": is_trashed}
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
        "is_public": True,
        "is_starred": False,
        "is_trashed": False,
        "created_at": now,
        "updated_at": now
    }
    res = database.folders.insert_one(folder_doc)
    folder_doc["_id"] = res.inserted_id

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
    return jsonify({"success": True, "folder": serialize_doc(res)})

# ==========================================
# FILE ENDPOINTS (UPLOAD VIA COMMONTHREAD ENGINE, PRE-LOAD PAGINATION)
# ==========================================

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
            "is_public": True,
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

    query = {"user_id": user_id, "is_trashed": is_trashed}

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
        return jsonify({"success": True, "message": "Moved to trash."})

    # Permanent delete
    database.files.delete_one({"_id": fid, "user_id": user_id})
    database.users.update_one({"_id": user_id}, {"$inc": {"storage_used_bytes": -file_doc.get("size", 0)}})

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

    return jsonify({"success": True, "file": serialize_doc(res)})

# ==========================================
# PUBLIC PROFILE ENDPOINT (/<username>)
# ==========================================

@app.route("/api/public/<username>", methods=["GET"])
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

    # Folder query
    folder_query = {"user_id": user["_id"], "is_trashed": False, "parent_id": parent_id}
    if not is_owner:
        folder_query["is_public"] = {"$ne": False}

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
    if not is_owner:
        file_query["is_public"] = {"$ne": False}

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
            "avatar_color": user.get("avatar_color", "#1a73e8"),
            "created_at": user.get("created_at").isoformat() if isinstance(user.get("created_at"), datetime.datetime) else None,
            "total_public_files": total_count
        },
        "is_owner": is_owner,
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

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_static(path):
    static_dir = os.path.join(os.path.dirname(__file__), "../public")
    if path != "" and os.path.exists(os.path.join(static_dir, path)):
        return send_from_directory(static_dir, path)
    return send_from_directory(static_dir, "index.html")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    app.run(host="0.0.0.0", port=port, debug=True)
