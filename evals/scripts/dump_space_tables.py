#!/usr/bin/env python3
"""Dump all intent-space SQLite tables under a trial runDir to a markdown snapshot."""
from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TIMESTAMP_COLUMNS = {"timestamp", "created_at", "updated_at", "started_at", "ended_at"}
JSON_COLUMNS = {"payload", "detail"}
JSON_TRUNCATE = 120


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Dump intent-space DB tables to markdown")
    parser.add_argument("rundir", help="Trial runDir path")
    return parser.parse_args()


def find_databases(data_dir: Path) -> list[tuple[str, Path]]:
    """Return (label, path) pairs for all intent-space.db files found."""
    dbs: list[tuple[str, Path]] = []
    commons = data_dir / "commons" / "intent-space.db"
    if commons.exists():
        dbs.append(("Commons", commons))
    spaces_dir = data_dir / "spaces"
    if spaces_dir.is_dir():
        for space in sorted(spaces_dir.iterdir()):
            db = space / "intent-space.db"
            if db.exists():
                dbs.append((f"Space `{space.name}`", db))
    return dbs


def list_tables(conn: sqlite3.Connection) -> list[str]:
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    return [row[0] for row in cursor.fetchall()]


def format_cell(value: Any, column: str, table: str) -> str:
    if value is None:
        return ""
    truncate = table != "messages"
    if column.lower() in TIMESTAMP_COLUMNS and isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
        except (OSError, ValueError, OverflowError):
            return str(value)
    if column.lower() in JSON_COLUMNS and isinstance(value, str):
        try:
            parsed = json.loads(value)
            pretty = json.dumps(parsed, ensure_ascii=False)
        except (json.JSONDecodeError, TypeError):
            pretty = value
        if truncate and len(pretty) > JSON_TRUNCATE:
            return pretty[:JSON_TRUNCATE] + "..."
        return pretty
    text = str(value)
    if truncate and len(text) > JSON_TRUNCATE:
        return text[:JSON_TRUNCATE] + "..."
    return text


def render_table(conn: sqlite3.Connection, table: str) -> str:
    if table == "monitoring_events":
        cursor = conn.execute(f"SELECT * FROM [{table}] WHERE stage NOT IN ('scan', 'parse')")  # noqa: S608
    else:
        cursor = conn.execute(f"SELECT * FROM [{table}]")  # noqa: S608
    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    if not rows:
        return "_No rows._"

    # Build cell strings
    cell_rows = [[format_cell(val, col, table) for val, col in zip(row, columns)] for row in rows]

    # Escape pipes in cell values
    for r in cell_rows:
        for i, c in enumerate(r):
            r[i] = c.replace("|", "\\|")

    header = "| " + " | ".join(columns) + " |"
    separator = "| " + " | ".join("---" for _ in columns) + " |"
    body_lines = ["| " + " | ".join(cells) + " |" for cells in cell_rows]
    return "\n".join([header, separator, *body_lines])


def main() -> int:
    args = parse_args()
    run_dir = Path(args.rundir).resolve()
    data_dir = run_dir / "headwaters" / "data"
    output_path = run_dir / "db-snapshot.md"

    databases = find_databases(data_dir)

    lines: list[str] = ["# Intent-Space Database Snapshot", ""]

    if not databases:
        lines.append("_No databases found._")
    else:
        for label, db_path in databases:
            uri = f"{db_path.as_uri()}?mode=ro&immutable=1"
            try:
                conn = sqlite3.connect(uri, uri=True)
            except sqlite3.OperationalError as exc:
                lines.append(f"## {label}")
                lines.append("")
                lines.append(f"_Could not open database: {exc}_")
                lines.append("")
                continue

            try:
                tables = list_tables(conn)
                if not tables:
                    lines.append(f"## {label}")
                    lines.append("")
                    lines.append("_No user tables._")
                    lines.append("")
                else:
                    for table in tables:
                        try:
                            content = render_table(conn, table)
                        except sqlite3.OperationalError as exc:
                            content = f"_Error reading table: {exc}_"
                        lines.append(f"<details>")
                        lines.append(f"<summary><strong>{label} — <code>{table}</code></strong></summary>")
                        lines.append("")
                        lines.append(content)
                        lines.append("")
                        lines.append("</details>")
                        lines.append("")
            finally:
                conn.close()

    output_path.write_text("\n".join(lines), encoding="utf-8")
    print(str(output_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
