from pathlib import Path
from flask import Flask, jsonify, render_template
from dotenv import load_dotenv
from .routes import api
from .services.store import init_db

def create_app():
    init_db()
    root = Path(__file__).resolve().parent.parent
    load_dotenv(root / ".env")
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024
    app.register_blueprint(api)

    @app.get("/")
    def home():
        return render_template("index.html")

    @app.errorhandler(413)
    def too_large(_):
        return jsonify({"error": "Request is too large."}), 413

    return app
