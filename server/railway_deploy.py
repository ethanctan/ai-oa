#!/usr/bin/env python3
"""
Production Flask App for Railway Deployment
"""

from flask import Flask, request
from flask_cors import CORS
import os
from dotenv import load_dotenv
import logging
import sys

# Set up logging for production
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout  # Ensure logs go to stdout for Railway
)
logger = logging.getLogger(__name__)

# Load environment variables (Railway automatically provides them)
load_dotenv()

# Create Flask app
app = Flask(__name__)
app.url_map.strict_slashes = False

# Configure CORS for production (allow frontend domain)
frontend_origins = [
    'http://localhost:5173',  # Local development
    'http://127.0.0.1:5173',  # Local development
    'http://localhost:3000',  # Alternative local port
    'https://*.vercel.app',   # Vercel deployments
    'https://*.railway.app'   # Railway deployments
]

# Get allowed origins from environment (when we deploy frontend)
allowed_origins = os.environ.get('ALLOWED_ORIGINS', ','.join(frontend_origins)).split(',')

# Log CORS configuration
logger.info("🔧 CORS Configuration:")
logger.info(f"   - Allowed origins: {allowed_origins}")

CORS(app, 
     supports_credentials=True,
     origins=allowed_origins,
     allow_headers=['Content-Type', 'Authorization', 'X-User-ID', 'X-Company-ID', 'X-Auth0-User-ID', 'Origin', 'Accept'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     expose_headers=['Content-Type', 'Authorization'])

# Production logging middleware (less verbose)
@app.before_request
def log_request_info():
    logger.info(f"🌐 {request.method} {request.url}")
    logger.info(f"🌐 Origin: {request.headers.get('Origin', 'No Origin')}")
    logger.info(f"🌐 Headers: {dict(request.headers)}")

@app.after_request
def log_response_info(response):
    logger.info(f"🌐 Response: {response.status_code}")
    logger.info(f"🌐 CORS Headers: {dict(response.headers)}")
    return response

# Health check endpoint for Railway
@app.route('/')
def health_check():
    logger.info("✅ Health check endpoint called")
    return {
        'status': 'healthy',
        'service': 'ai-oa-backend',
        'version': '1.0.0',
        'database': 'postgresql'
    }

@app.route('/health')
def detailed_health_check():
    logger.info("🔍 Detailed health check called")
    try:
        # Import here to avoid startup issues
        from database.db_postgresql import test_connection, get_connection
        
        # Test database connection
        result = test_connection()
        logger.info(f"✅ Database connection test: {result}")
        
        return {
            'status': 'healthy',
            'database': 'connected',
            'message': result
        }
    except Exception as e:
        logger.error(f"❌ Health check failed: {str(e)}")
        return {
            'status': 'unhealthy', 
            'database': 'disconnected',
            'error': str(e)
        }, 500

# Simple test endpoint
@app.route('/test')
def test_endpoint():
    logger.info("🧪 Test endpoint called")
    return {
        'message': 'API is working!',
        'timestamp': '2024-01-01T00:00:00Z'
    }

# CORS test endpoint
@app.route('/cors-test')
def cors_test():
    logger.info("🔍 CORS test endpoint called")
    return {
        'message': 'CORS is working!',
        'origin': request.headers.get('Origin', 'No Origin'),
        'method': request.method
    }

# Register routes/blueprints
logger.info("🚀 PRODUCTION: Registering blueprints...")
try:
    from routes.chat import chat_bp
    from routes.candidates import candidates_bp
    from routes.tests import tests_bp
    from routes.instances import instances_bp
    from routes.timer import timer_bp
    from routes.reports import reports_bp
    from routes.auth import auth_bp
    
    app.register_blueprint(chat_bp, url_prefix='/chat')
    app.register_blueprint(candidates_bp, url_prefix='/candidates')
    app.register_blueprint(tests_bp, url_prefix='/tests')
    app.register_blueprint(instances_bp, url_prefix='/instances')
    app.register_blueprint(timer_bp, url_prefix='/timer')
    app.register_blueprint(reports_bp, url_prefix='/reports')
    app.register_blueprint(auth_bp, url_prefix='/auth')
    logger.info("✅ PRODUCTION: All blueprints registered successfully")
except Exception as e:
    logger.error(f"❌ PRODUCTION: Failed to register blueprints: {str(e)}")
    # Don't exit, let the app start with basic endpoints

# Log environment status (safely)
logger.info("🔧 PRODUCTION: Environment configuration:")
logger.info(f"   - PORT: {os.environ.get('PORT', 'NOT SET')}")
logger.info(f"   - DATABASE_URL: {'SET' if os.environ.get('DATABASE_URL') else 'NOT SET'}")
logger.info(f"   - RAILWAY_ENVIRONMENT: {os.environ.get('RAILWAY_ENVIRONMENT', 'NOT SET')}")

# Initialize database on startup (but don't fail if it doesn't work)
try:
    logger.info("🗄️ PRODUCTION: Initializing PostgreSQL database...")
    from database.db_postgresql import init_database, test_connection
    from database.migrations_postgresql import run_migrations
    
    init_database()
    logger.info("✅ PRODUCTION: Database initialized successfully")
    
    logger.info("🔄 PRODUCTION: Running PostgreSQL migrations...")
    run_migrations()
    logger.info("✅ PRODUCTION: Migrations completed successfully")
except Exception as e:
    logger.error(f"❌ PRODUCTION: Database initialization failed: {str(e)}")
    logger.error("💡 App will start but database features may not work")
    # Don't exit in production, let Railway handle restarts

if __name__ == '__main__':
    # Railway sets PORT environment variable
    port = int(os.environ.get('PORT', 3000))
    
    # Check if running on Railway
    is_production = os.environ.get('RAILWAY_ENVIRONMENT') == 'production'
    
    logger.info(f"🚀 PRODUCTION: Starting server on port {port}")
    logger.info(f"🔗 PRODUCTION: Using PostgreSQL database (Supabase)")
    logger.info(f"🌍 PRODUCTION: Environment: {'Railway' if is_production else 'Local'}")
    
    # In production, use production server settings
    app.run(
        host='0.0.0.0', 
        port=port, 
        debug=not is_production,  # Debug off in production
        threaded=True  # Better performance
    ) 