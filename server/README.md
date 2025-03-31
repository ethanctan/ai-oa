# Python Server for AI OA

This is a Python implementation of the Express.js server, providing the same functionality but using Flask and Python libraries.

## Setup

1. Create a virtual environment (recommended):
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Run the server:
   ```
   python app.py
   ```

The server will run on port 3000 by default, or you can set a different port with the `PORT` environment variable.

## Environment Variables

The server will use the same `.env` file from the Express.js server, which should contain:

```
AZURE_OPENAI_ENDPOINT='your-azure-openai-endpoint'
AZURE_OPENAI_DEPLOYMENT_NAME='your-deployment-name'
OPENAI_API_VERSION='2024-10-21'
AZURE_OPENAI_API_KEY='your-api-key'
AZURE_CLIENT_ID='your-client-id'
AZURE_TENANT_ID='your-tenant-id'
AZURE_CLIENT_SECRET='your-client-secret'
```

## API Endpoints

The server provides the same API endpoints as the Express.js server:

- `/chat` - Chat with the Azure OpenAI API
- `/candidates` - Manage candidates
- `/tests` - Manage tests
- `/instances` - Manage test instances
- `/timer` - Manage timers for test instances

## Database

The server uses SQLite for data storage, with the database file located at `./database/data.sqlite`. 