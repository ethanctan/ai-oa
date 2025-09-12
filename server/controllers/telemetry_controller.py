from database.db_postgresql import get_connection
from typing import List, Dict, Any


def insert_telemetry_events(instance_id: int, session_id: str, events: List[Dict[str, Any]]):
    """Insert a batch of telemetry events.

    Each event should be a dict with keys:
      - type: str
      - ts: int (ms since epoch)
      - metadata: dict (JSON-serializable)
    """
    if not isinstance(events, list) or not events:
        return 0

    conn = get_connection()
    cursor = conn.cursor()
    try:
        rows = [
            (
                instance_id,
                session_id,
                e.get('type'),
                e.get('ts'),
                e.get('metadata', {})
            )
            for e in events
            if isinstance(e, dict) and e.get('type')
        ]
        if not rows:
            return 0

        cursor.executemany(
            '''
            INSERT INTO telemetry_events (instance_id, session_id, event_type, event_ts_ms, metadata)
            VALUES (%s, %s, %s, %s, %s)
            ''',
            rows
        )
        conn.commit()
        return len(rows)
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


