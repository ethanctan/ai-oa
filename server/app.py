from flask import Flask, request
from flask_cors import CORS
import os
from dotenv import load_dotenv
from routes.chat import chat_bp
from routes.candidates import candidates_bp
from routes.tests import tests_bp
from routes.instances import instances_bp
from routes.timer import timer_bp
from routes.reports import reports_bp
from routes.auth import auth_bp
from database.db import init_database
from database.migrations import run_migrations
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv('../server/.env')  # Load from existing .env file

# Create Flask app
app = Flask(__name__)
# Configure Flask to be more flexible with trailing slashes
app.url_map.strict_slashes = False

# Configure CORS to support credentials and specific origins
CORS(app, 
     supports_credentials=True,
     origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
     allow_headers=['Content-Type', 'Authorization', 'X-User-ID', 'X-Company-ID', 'X-Auth0-User-ID'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])

# Add request logging middleware
@app.before_request
def log_request_info():
    logger.info(f"🌐 REQUEST: {request.method} {request.url}")
    logger.info(f"🌐 REQUEST: Headers: {dict(request.headers)}")
    if request.method in ['POST', 'PUT', 'PATCH']:
        if request.content_type and 'json' in request.content_type:
            try:
                logger.info(f"🌐 REQUEST: JSON Body: {request.json}")
            except Exception as e:
                logger.info(f"🌐 REQUEST: Could not parse JSON body: {e}")

@app.after_request
def log_response_info(response):
    logger.info(f"🌐 RESPONSE: Status {response.status_code}")
    logger.info(f"🌐 RESPONSE: Headers: {dict(response.headers)}")
    return response

# Register routes/blueprints
logger.info("🚀 STARTUP: Registering blueprints...")
app.register_blueprint(chat_bp, url_prefix='/chat')
app.register_blueprint(candidates_bp, url_prefix='/candidates')
app.register_blueprint(tests_bp, url_prefix='/tests')
app.register_blueprint(instances_bp, url_prefix='/instances')
app.register_blueprint(timer_bp, url_prefix='/timer')
app.register_blueprint(reports_bp, url_prefix='/reports')
app.register_blueprint(auth_bp, url_prefix='/auth')
logger.info("✅ STARTUP: All blueprints registered")

# Log environment variables (safely)
logger.info("🔧 STARTUP: Environment configuration:")
logger.info(f"   - AUTH0_DOMAIN: {os.environ.get('AUTH0_DOMAIN', 'NOT SET')}")
logger.info(f"   - APPROVED_DOMAINS: {os.environ.get('APPROVED_DOMAINS', 'NOT SET')}")
logger.info(f"   - API_BASE_URL: {os.environ.get('API_BASE_URL', 'NOT SET')}")
logger.info(f"   - PORT: {os.environ.get('PORT', 'NOT SET')}")

# Initialize database
try:
    logger.info("🗄️ STARTUP: Initializing database...")
    init_database()
    logger.info("✅ STARTUP: Database initialized successfully")
    
    # Run migrations to update schema
    logger.info("🔄 STARTUP: Running migrations...")
    run_migrations()
    logger.info("✅ STARTUP: Migrations completed successfully")
except Exception as e:
    logger.error(f"❌ STARTUP: Database initialization failed: {str(e)}")
    exit(1)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    logger.info(f"🚀 STARTUP: Server starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=True) 