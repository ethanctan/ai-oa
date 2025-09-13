from database.db_postgresql import get_connection
from typing import List, Dict, Any
from psycopg2.extras import Json


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
        rows = []
        for e in events:
            if not isinstance(e, dict) or not e.get('type'):
                continue
            ts_val = e.get('ts')
            try:
                ts_val = int(ts_val) if ts_val is not None else None
            except Exception:
                ts_val = None
            metadata = e.get('metadata') or {}
            rows.append(
                (
                    instance_id,
                    session_id,
                    e.get('type'),
                    ts_val,
                    Json(metadata)
                )
            )
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


