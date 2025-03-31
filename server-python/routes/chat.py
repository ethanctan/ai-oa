from flask import Blueprint, request, jsonify
import asyncio
from controllers.chat_controller import get_chat_response, get_chat_history, add_chat_message

# Create a Blueprint for chat routes
chat_bp = Blueprint('chat', __name__)

# POST /chat - Get a chat response from the OpenAI API
@chat_bp.route('/', methods=['POST'])
def chat():
    try:
        data = request.json
        print(f'Received chat request: {data}')
        
        # Handle different payload formats:
        # 1. { payload: { messages: [...] } } - from extension
        # 2. { payload: { payload: { messages: [...] } } } - double wrapped
        # 3. { messages: [...] } - direct format
        messages = None
        instance_id = data.get('instanceId') or request.args.get('instanceId')
        
        # Check if we should skip history save
        skip_history_save = data.get('skipHistorySave', False)
        if skip_history_save:
            print(f'Skipping history save for this request as requested')
        
        # Try all possible payload formats
        if data.get('payload') and isinstance(data.get('payload'), dict):
            # Format 1: { payload: { messages: [...] } }
            if data.get('payload').get('messages'):
                messages = data.get('payload').get('messages')
                print("Found messages in payload.messages")
            # Format 2: { payload: { payload: { messages: [...] } } }
            elif data.get('payload').get('payload') and isinstance(data.get('payload').get('payload'), dict):
                if data.get('payload').get('payload').get('messages'):
                    messages = data.get('payload').get('payload').get('messages')
                    print("Found messages in payload.payload.messages")
        # Format 3: { messages: [...] }
        elif data.get('messages'):
            messages = data.get('messages')
            print("Found messages directly in root object")
        
        # Handle text and instance_id in the payload as well
        if data.get('text') and not instance_id:
            instance_id = data.get('instanceId')
            
        if not messages:
            # One more attempt - check if we have a valid message in a different format
            if data.get('text') and instance_id:
                # Create a simple message array with just this message
                messages = [
                    {"role": "system", "content": "You are a technical interviewer assessing a software engineering candidate."},
                    {"role": "user", "content": data.get('text')}
                ]
                print(f"Created messages from text: {data.get('text')}")
            else:
                raise ValueError('No messages array found in request payload. Please check payload format.')
        
        print(f'Processing chat with {len(messages)} messages for instance {instance_id or "unknown"}')
        
        # Use asyncio to run the async function
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        reply = loop.run_until_complete(get_chat_response(messages))
        loop.close()
        
        # If we have an instance ID and should not skip history save, save the messages to history
        if instance_id and not skip_history_save:
            # First, add the user's last message (if any)
            user_messages = [m for m in messages if m.get('role') == 'user']
            if user_messages:
                last_user_message = user_messages[-1]
                add_chat_message(instance_id, {'role': 'user', 'content': last_user_message.get('content')})
            
            # Then add the AI response
            add_chat_message(instance_id, {'role': 'assistant', 'content': reply})
            print(f'Saved messages to history for instance {instance_id}')
        else:
            if not instance_id:
                print('Skipping history save: No instance ID provided')
            elif skip_history_save:
                print('Skipping history save: skipHistorySave flag set to true')
        
        return jsonify({'reply': reply})
    except Exception as e:
        print(f'Error in chat route: {str(e)}')
        return jsonify({'error': str(e)}), 500

# GET /chat/history - Get chat history for an instance
@chat_bp.route('/history', methods=['GET'])
def history():
    try:
        instance_id = request.args.get('instanceId')
        
        if not instance_id:
            return jsonify({
                'success': False,
                'error': 'Instance ID is required'
            }), 400
        
        print(f'Getting chat history for instance {instance_id}')
        history = get_chat_history(instance_id)
        
        return jsonify({
            'success': True,
            'instanceId': instance_id,
            'history': history
        })
    except Exception as e:
        print(f'Error getting chat history: {str(e)}')
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# POST /chat/message - Add a message to chat history
@chat_bp.route('/message', methods=['POST'])
def message():
    try:
        data = request.json
        instance_id = data.get('instanceId')
        message = data.get('message')
        
        if not instance_id:
            return jsonify({
                'success': False,
                'error': 'Instance ID is required'
            }), 400
        
        if not message or 'role' not in message or 'content' not in message:
            return jsonify({
                'success': False,
                'error': 'Valid message with role and content is required'
            }), 400
        
        print(f'Adding message to chat history for instance {instance_id}')
        history = add_chat_message(instance_id, message)
        
        return jsonify({
            'success': True,
            'instanceId': instance_id,
            'history': history
        })
    except Exception as e:
        print(f'Error adding chat message: {str(e)}')
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500 