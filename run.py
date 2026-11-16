import os
from api.index import app

if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    print(f"Haul Pro server running on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
