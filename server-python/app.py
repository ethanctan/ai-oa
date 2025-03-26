import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from routes.instances import instances_bp
from routes.candidates import candidates_bp
from routes.tests import tests_bp
from database.db import init_database

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Register blueprints
app.register_blueprint(instances_bp, url_prefix='/instances')
app.register_blueprint(candidates_bp, url_prefix='/candidates')
app.register_blueprint(tests_bp, url_prefix='/tests')

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# Initialize database on startup
try:
    init_database()
    print("Database initialized successfully")
except Exception as e:
    print(f"Database initialization failed: {str(e)}")

if __name__ == '__main__':
    port = int(os.getenv('PORT', 3000))
    app.run(host='0.0.0.0', port=port, debug=True) 