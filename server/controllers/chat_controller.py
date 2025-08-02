import os
import json
from pathlib import Path
from openai import AzureOpenAI
from database.db_postgresql import get_connection

# Get environment variables
endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
api_key = os.getenv("AZURE_OPENAI_API_KEY")
api_version = os.getenv("OPENAI_API_VERSION")
deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")

# Path to the chat history data file
CHAT_DATA_FILE = Path(__file__).parent.parent / 'data' / 'chat-history.json'

# Store chat history with instanceId as the key
chat_histories = {}

def load_chat_histories():
    """Load chat histories from persistent storage"""
    try:
        # Create data directory if it doesn't exist
        data_dir = CHAT_DATA_FILE.parent
        data_dir.mkdir(parents=True, exist_ok=True)
        
        # Check if chat data file exists
        if not CHAT_DATA_FILE.exists():
            print(f"Chat data file does not exist. Creating empty file at: {CHAT_DATA_FILE}")
            with open(CHAT_DATA_FILE, 'w') as f:
                json.dump({}, f)
            return
        
        # Load chat histories
        with open(CHAT_DATA_FILE, 'r') as f:
            chat_data = json.load(f)
        
        # Clear current histories
        chat_histories.clear()
        
        # Restore chat histories
        for instance_id, history in chat_data.items():
            # Remove duplicates before adding to memory
            history = remove_consecutive_duplicates(history)
            chat_histories[instance_id] = history
        
        print(f"Loaded chat histories for {len(chat_histories)} instances")
    except Exception as e:
        print(f"Error loading chat histories: {str(e)}")

def remove_consecutive_duplicates(history):
    """Remove consecutive duplicate messages from history"""
    if not history or len(history) < 2:
        return history
    
    # Create a new list with only non-duplicate consecutive messages
    cleaned_history = []
    prev_message = None
    
    for message in history:
        # Skip if this message is identical to the previous one
        if prev_message and prev_message.get('role') == message.get('role') and prev_message.get('content') == message.get('content'):
            print(f"Removing duplicate message: {message.get('content')[:30]}...")
            continue
        
        cleaned_history.append(message)
        prev_message = message
    
    if len(history) != len(cleaned_history):
        print(f"Removed {len(history) - len(cleaned_history)} duplicate messages")
    
    return cleaned_history

def save_chat_histories():
    """Save chat histories to persistent storage"""
    try:
        # First, clean up any duplicates
        for instance_id in chat_histories:
            chat_histories[instance_id] = remove_consecutive_duplicates(chat_histories[instance_id])
            
        # Save to file
        with open(CHAT_DATA_FILE, 'w') as f:
            json.dump(chat_histories, f, indent=2)
        print(f"Saved chat histories for {len(chat_histories)} instances")
    except Exception as e:
        print(f"Error saving chat histories: {str(e)}")

def get_chat_history(instance_id):
    """Get chat history for a test instance"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            SELECT ch.*, u.name as user_name
            FROM chat_history ch
            LEFT JOIN users u ON ch.user_id = u.id
            WHERE ch.instance_id = %s
            ORDER BY ch.created_at ASC
        ''', (instance_id,))
        messages = [dict(row) for row in cursor.fetchall()]
        return messages
    finally:
        conn.close()

def add_chat_message(instance_id, user_id, message, role='user'):
    """Add a message to the chat history"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO chat_history (instance_id, user_id, message, role, created_at)
            VALUES (%s, %s, %s, %s, NOW())
            RETURNING id
        ''', (instance_id, user_id, message, role))
        
        # Get the inserted message ID from RETURNING clause
        inserted_id = cursor.fetchone()['id']
        conn.commit()
        
        # Get the inserted message with user details
        cursor.execute('''
            SELECT ch.*, u.name as user_name
            FROM chat_history ch
            LEFT JOIN users u ON ch.user_id = u.id
            WHERE ch.id = %s
        ''', (inserted_id,))
        return dict(cursor.fetchone())
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def clear_chat_history(instance_id):
    """Clear chat history for a test instance"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('DELETE FROM chat_history WHERE instance_id = %s', (instance_id,))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

async def get_chat_response_lmql(messages):
    """
    Uses lmql (https://lmql.ai/) along with the Azure OpenAI API to get a chat response.
    Args:
        messages (list): List of message dictionaries.
          Expected format:
            [
              { "role": "system", "content": "<System prompt here>" },
              { "role": "user", "content": "First user message" },
              { "role": "assistant", "content": "First assistant response" },
              ...
            ]
    Returns:
        str: The chat response.
    """
    pass

async def get_chat_response(messages):
    """
    Calls the Azure OpenAI API to get a chat response.
    Args:
        messages (list): List of message dictionaries.
          Expected format:
            [
              { "role": "system", "content": "<System prompt here>" },
              { "role": "user", "content": "First user message" },
              { "role": "assistant", "content": "First assistant response" },
              ...
            ]
    Returns:
        str: The chat response.
    """
    try:
        print(f"Creating OpenAI client with endpoint: {endpoint}, api_version: {api_version}")
        
        # Create an AzureOpenAI client with the given configuration.
        # Use a try-except block to handle both newer and older versions of the API
        try:
            # Newer version API approach
            client = AzureOpenAI(
                api_key=api_key,
                api_version=api_version,
                azure_endpoint=endpoint
            )
        except TypeError as e:
            print(f"TypeError creating OpenAI client: {e}. Trying alternative initialization...")
            # Fallback for older versions
            from openai import OpenAI
            client = OpenAI(
                api_key=api_key
            )

        # Print the model being used for debugging
        print(f"Using deployment model: {deployment}")

        # Call the chat completions API with the provided messages.
        result = client.chat.completions.create(
            model=deployment,
            messages=messages
            # Pass additional parameters such as temperature, top_p, max_tokens if needed
        )

        # Check if the result contains choices and return the first reply.
        if result.choices and len(result.choices) > 0:
            response = result.choices[0].message.content
            print(f"Successfully received response from OpenAI")
            return response
        else:
            raise ValueError("No choices returned from Azure OpenAI")
    except Exception as e:
        print(f"Detailed error from OpenAI: {str(e)}")
        
        # Return a fallback response for development/testing
        if not endpoint or not api_key:
            print("Using fallback response due to missing OpenAI credentials")
            return "I'm a simulated AI response since no valid OpenAI credentials were provided. In a real environment, I would respond to your message based on the content provided."
        
        raise Exception(f"Error calling Azure OpenAI: {str(e)}")

# Load chat histories on module initialization
load_chat_histories() 