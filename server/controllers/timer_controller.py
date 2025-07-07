import time
import json
from pathlib import Path
from datetime import datetime, timedelta
from database.db_postgresql import get_connection

# Path to the timers data file
TIMERS_DATA_FILE = Path(__file__).parent.parent / 'data' / 'timers.json'

# Initialize timers dictionary
timers = {}

def load_timers():
    """Load timers from persistent storage"""
    try:
        # Create data directory if it doesn't exist
        data_dir = TIMERS_DATA_FILE.parent
        data_dir.mkdir(parents=True, exist_ok=True)
        
        # Check if timers data file exists
        if not TIMERS_DATA_FILE.exists():
            print(f"Timers data file does not exist. Creating empty file at: {TIMERS_DATA_FILE}")
            with open(TIMERS_DATA_FILE, 'w') as f:
                json.dump({}, f)
            return
        
        # Load timers
        with open(TIMERS_DATA_FILE, 'r') as f:
            timer_data = json.load(f)
        
        # Clear current timers
        timers.clear()
        
        # Restore timers with string keys
        for instance_id, timer_info in timer_data.items():
            timers[instance_id] = timer_info
        
        print(f"Loaded timers for {len(timers)} instances")
    except Exception as e:
        print(f"Error loading timers: {str(e)}")

def save_timers():
    """Save timers to persistent storage"""
    try:
        # Convert to JSON-compatible format
        timer_data = {}
        for instance_id, timer_info in timers.items():
            timer_data[instance_id] = timer_info
        
        # Save to file
        with open(TIMERS_DATA_FILE, 'w') as f:
            json.dump(timer_data, f, indent=2)
        print(f"Saved timers for {len(timers)} instances")
    except Exception as e:
        print(f"Error saving timers: {str(e)}")

def start_instance_timer(instance_id, duration=600, timer_type='initial'):
    """
    Start a timer for an instance
    
    Args:
        instance_id (int): The instance ID
        duration (int, optional): Duration in seconds. Defaults to 600 (10 minutes).
                                 If set to 0, timer will be created but marked as inactive.
        timer_type (str, optional): Type of timer. 'initial' or 'project'. Defaults to 'initial'.
    
    Returns:
        dict: Timer information
    """
    # Convert instance_id to string for JSON serialization
    instance_id = str(instance_id)
    
    # Set the timer
    current_time = int(time.time())
    end_time = current_time + (duration if duration > 0 else 0)
    
    # Check if timer should be active (duration of 0 means timer is disabled)
    is_active = duration > 0
    
    timer_info = {
        'instanceId': instance_id,
        'startTime': current_time,
        'endTime': end_time,
        'duration': duration,
        'active': is_active,
        'interviewStarted': False,  # Default to not started
        'timerType': timer_type,    # Add timer type field
        'currentTimeMs': current_time * 1000,  # For frontend
        'endTimeMs': end_time * 1000,  # For frontend
        'timeRemaining': duration,
        'timeRemainingMs': duration * 1000  # For frontend
    }
    
    if timer_type == 'project':
        timer_info['projectStarted'] = True
        timer_info['finalInterviewStarted'] = False
    
    timers[instance_id] = timer_info
    
    # Save to persistent storage
    save_timers()
    
    return timer_info

def start_project_timer(instance_id, duration=3600):
    """
    Start a project timer for an instance after the initial interview is completed
    
    Args:
        instance_id (int): The instance ID
        duration (int, optional): Duration in seconds. Defaults to 3600 (60 minutes).
                                 If set to 0, timer will be created but marked as inactive.
    
    Returns:
        dict: Timer information
    """
    return start_instance_timer(instance_id, duration, timer_type='project')

def get_timer_status(instance_id):
    """
    Get status of a timer
    
    Args:
        instance_id (str): The instance ID
    
    Returns:
        dict: Timer status or None if no timer exists
    """
    # Convert instance_id to string for dictionary lookup
    instance_id = str(instance_id)
    
    timer = timers.get(instance_id)
    if not timer:
        return None
    
    # Update timer status
    current_time = int(time.time())
    current_time_ms = current_time * 1000  # Convert to milliseconds for frontend
    time_remaining = max(0, timer['endTime'] - current_time)
    time_remaining_ms = time_remaining * 1000  # Convert to milliseconds for frontend
    is_expired = time_remaining <= 0
    
    # Make sure all required fields exist in the timer
    if 'interviewStarted' not in timer:
        timer['interviewStarted'] = False
    
    if 'timerType' not in timer:
        timer['timerType'] = 'initial'  # Default to initial for backward compatibility
    
    if timer['timerType'] == 'project' and 'finalInterviewStarted' not in timer:
        timer['finalInterviewStarted'] = False
    
    timer_status = {
        'instanceId': instance_id,
        'startTime': timer['startTime'],
        'startTimeMs': timer['startTime'] * 1000,  # For frontend
        'endTime': timer['endTime'],
        'endTimeMs': timer['endTime'] * 1000,  # For frontend
        'currentTimeMs': current_time_ms,  # For frontend
        'duration': timer['duration'],
        'active': timer['active'],
        'timeRemaining': time_remaining,
        'timeRemainingMs': time_remaining_ms,  # For frontend
        'isExpired': is_expired,
        'interviewStarted': timer.get('interviewStarted', False),  # Return the interview started status
        'timerType': timer.get('timerType', 'initial')  # Return the timer type
    }
    
    # Add project-specific fields if this is a project timer
    if timer['timerType'] == 'project':
        timer_status['projectStarted'] = timer.get('projectStarted', True)
        timer_status['finalInterviewStarted'] = timer.get('finalInterviewStarted', False)
    
    return timer_status

def reset_timer(instance_id, duration=3600, timer_type=None):
    """
    Reset a timer for an instance
    
    Args:
        instance_id (str): The instance ID
        duration (int, optional): New duration in seconds. Defaults to 1 hour.
        timer_type (str, optional): Type of timer. If None, preserves the current type.
    
    Returns:
        dict: Updated timer information
    """
    # Convert instance_id to string for dictionary lookup
    instance_id = str(instance_id)
    
    # Check if timer exists
    if instance_id not in timers:
        if timer_type:
            return start_instance_timer(instance_id, duration, timer_type)
        else:
            return start_instance_timer(instance_id, duration)
    
    # Set the timer
    current_time = int(time.time())
    end_time = current_time + duration
    
    # Preserve the interview started flag and timer type
    interview_started = timers[instance_id].get('interviewStarted', False)
    current_timer_type = timers[instance_id].get('timerType', 'initial')
    
    # Use provided timer_type if specified, otherwise keep the current one
    timer_type = timer_type or current_timer_type
    
    # Update existing timer
    timers[instance_id].update({
        'startTime': current_time,
        'endTime': end_time,
        'duration': duration,
        'active': True,
        'timerType': timer_type,
        'currentTimeMs': current_time * 1000,  # For frontend
        'endTimeMs': end_time * 1000,  # For frontend
        'timeRemaining': duration,
        'timeRemainingMs': duration * 1000,  # For frontend
        'interviewStarted': interview_started  # Preserve the interview started status
    })
    
    # Add project-specific fields if this is a project timer
    if timer_type == 'project':
        timers[instance_id]['projectStarted'] = True
        timers[instance_id]['finalInterviewStarted'] = timers[instance_id].get('finalInterviewStarted', False)
    
    # Save to persistent storage
    save_timers()
    
    return timers[instance_id]

def set_interview_started(instance_id, started=True):
    """
    Mark an interview as started for an instance
    
    Args:
        instance_id (str): The instance ID
        started (bool, optional): Whether to mark as started. Defaults to True.
    
    Returns:
        dict: Updated timer information or None if no timer exists
    """
    # Convert instance_id to string for dictionary lookup
    instance_id = str(instance_id)
    
    # Check if timer exists
    if instance_id not in timers:
        return None
    
    # Update the timer
    timers[instance_id]['interviewStarted'] = started
    
    # Save to persistent storage
    save_timers()
    
    return get_timer_status(instance_id)

def set_final_interview_started(instance_id, started=True):
    """
    Mark the final interview as started for an instance
    
    Args:
        instance_id (str): The instance ID
        started (bool, optional): Whether to mark as started. Defaults to True.
    
    Returns:
        dict: Updated timer information or None if no timer exists
    """
    # Convert instance_id to string for dictionary lookup
    instance_id = str(instance_id)
    
    # Check if timer exists
    if instance_id not in timers:
        return None
    
    # Update the timer
    timers[instance_id]['finalInterviewStarted'] = started
    
    # Save to persistent storage
    save_timers()
    
    return get_timer_status(instance_id)

# Load timers on module initialization
load_timers()

def start_instance_timer(instance_id, duration_seconds):
    """Start a timer for a test instance"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Check if instance exists
        cursor.execute('SELECT * FROM test_instances WHERE id = %s', (instance_id,))
        instance = cursor.fetchone()
        if not instance:
            raise ValueError('Instance not found')
        
        # Calculate end time
        end_time = datetime.now() + timedelta(seconds=duration_seconds)
        
        # Create or update timer
        cursor.execute('''
            INSERT INTO timers (instance_id, end_time, created_at, updated_at)
            VALUES (%s, %s, NOW(), NOW())
            ON CONFLICT (instance_id) DO UPDATE
            SET end_time = %s, updated_at = NOW()
        ''', (instance_id, end_time, end_time))
        conn.commit()
        
        return True
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def get_instance_timer(instance_id):
    """Get the timer for a test instance"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT * FROM timers WHERE instance_id = %s', (instance_id,))
        timer = cursor.fetchone()
        if not timer:
            return None
        
        # Calculate remaining time
        now = datetime.now()
        end_time = timer['end_time']
        remaining_seconds = max(0, int((end_time - now).total_seconds()))
        
        return {
            'instance_id': timer['instance_id'],
            'end_time': end_time.isoformat(),
            'remaining_seconds': remaining_seconds,
            'is_expired': remaining_seconds == 0
        }
    finally:
        conn.close()

def stop_instance_timer(instance_id):
    """Stop the timer for a test instance"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('DELETE FROM timers WHERE instance_id = %s', (instance_id,))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close() 