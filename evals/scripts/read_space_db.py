#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    parser.add_argument("--from-ts", dest="from_ts", required=True, type=int)
    parser.add_argument("--to-ts", dest="to_ts", required=True, type=int)
    parser.add_argument("--actor-id", dest="actor_id")
    return parser.parse_args()


def rows_to_dicts(cursor: sqlite3.Cursor) -> list[dict[str, Any]]:
    columns = [description[0] for description in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def parse_json_field(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except Exception:
        return value


def main() -> int:
    args = parse_args()
    db_path = Path(args.db).resolve()
    uri = f"{db_path.as_uri()}?mode=ro&immutable=1"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    try:
        try:
            messages_sql = """
                SELECT seq, type, message_id, intent_ref, parent_id, sender_id, payload, timestamp
                FROM messages
                WHERE timestamp BETWEEN ? AND ?
            """
            messages_params: list[Any] = [args.from_ts, args.to_ts]
            if args.actor_id:
                messages_sql += " AND sender_id = ?"
                messages_params.append(args.actor_id)
            messages_sql += " ORDER BY seq ASC"
            messages_cursor = connection.execute(messages_sql, messages_params)
            monitoring_sql = """
                SELECT id, timestamp, stage, outcome, event_type, connection_id, session_id, actor_id, space_id, message_type, detail
                FROM monitoring_events
                WHERE timestamp BETWEEN ? AND ?
            """
            monitoring_params: list[Any] = [args.from_ts, args.to_ts]
            if args.actor_id:
                monitoring_sql += " AND actor_id = ?"
                monitoring_params.append(args.actor_id)
            monitoring_sql += " ORDER BY id ASC"
            monitoring_cursor = connection.execute(monitoring_sql, monitoring_params)
        except sqlite3.OperationalError as exc:
            if "no such table" not in str(exc):
                raise
            print(json.dumps({"messages": [], "monitoringEvents": []}))
            return 0

        messages = rows_to_dicts(messages_cursor)
        monitoring = rows_to_dicts(monitoring_cursor)
        for row in messages:
            row["payload"] = parse_json_field(row.get("payload"))
        for row in monitoring:
            row["detail"] = parse_json_field(row.get("detail"))

        print(json.dumps({"messages": messages, "monitoringEvents": monitoring}))
        return 0
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
