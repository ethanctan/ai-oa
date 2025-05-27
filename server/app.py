from flask import Flask
from flask_cors import CORS
import os
from dotenv import load_dotenv
from routes.chat import chat_bp
from routes.candidates import candidates_bp
from routes.tests import tests_bp
from routes.instances import instances_bp
from routes.timer import timer_bp
from database.db import init_database
from database.migrations import run_migrations

# Load environment variables
load_dotenv('../server/.env')  # Load from existing .env file

# Create Flask app
app = Flask(__name__)
# Configure Flask to be more flexible with trailing slashes
app.url_map.strict_slashes = False
CORS(app)  # Enable CORS for frontend access

# Register routes/blueprints
app.register_blueprint(chat_bp, url_prefix='/chat')
app.register_blueprint(candidates_bp, url_prefix='/candidates')
app.register_blueprint(tests_bp, url_prefix='/tests')
app.register_blueprint(instances_bp, url_prefix='/instances')
app.register_blueprint(timer_bp, url_prefix='/timer')

# Initialize database
try:
    init_database()
    print("Database initialized successfully")
    # Run migrations to update schema
    run_migrations()
except Exception as e:
    print(f"Database initialization failed: {str(e)}")
    exit(1)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print(f"Server starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=True) 