"""Yandex Metrika Logs API Loader — FastAPI backend."""

from __future__ import annotations

import ast
import asyncio
import csv
import io
import logging
import os
import re
import threading
import time
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

import httpx
import psycopg
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from psycopg.rows import dict_row

from fields import (
    HITS_FIELD_CHUNKS,
    HITS_FIELDS,
    VISITS_FIELD_CHUNKS,
    VISITS_FIELDS,
    get_hits_schema,
    get_visits_schema,
    quote_column,
)

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://analytics:analytics@localhost:5432/analytics")
METRIKA_API = "https://api-metrika.yandex.net/management/v1"
POLL_INTERVAL_FAST_SEC = 5
POLL_INTERVAL_SLOW_SEC = 10
POLL_FAST_PHASE_SEC = 30
POLL_TIMEOUT_SEC = 30 * 60
BATCH_SIZE = 1000

app = FastAPI(title="Metrika Logs Loader")
jobs: dict[str, dict[str, Any]] = {}
jobs_lock = threading.Lock()

VISITS_SCHEMA = get_visits_schema()
HITS_SCHEMA = get_hits_schema()

TABLE_CONFIG = {
    "visits": {
        "source": "visits",
        "field_chunks": VISITS_FIELD_CHUNKS,
        "fields": VISITS_FIELDS,
        "schema": VISITS_SCHEMA,
        "table": "raw_metrika.visits",
        "pk_cols": ("visit_id", "counter_id"),
        "pk_api": ("ym:s:visitID", "ym:s:counterID"),
        "date_api": "ym:s:date",
    },
    "hits": {
        "source": "hits",
        "field_chunks": HITS_FIELD_CHUNKS,
        "fields": HITS_FIELDS,
        "schema": HITS_SCHEMA,
        "table": "raw_metrika.hits",
        "pk_cols": ("watch_id", "counter_id"),
        "pk_api": ("ym:pv:watchID", "ym:pv:counterID"),
        "date_api": "ym:pv:date",
    },
}


class ExportRequest(BaseModel):
    token: str
    counter_id: int
    date_from: date
    date_to: date


def get_connection() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL)


def update_job(job_id: str, **kwargs: Any) -> None:
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id].update(kwargs)


def update_source_job(
    job_id: str,
    table_key: str,
    *,
    line: str | None = None,
    progress: int | None = None,
    **job_fields: Any,
) -> None:
    with jobs_lock:
        if job_id not in jobs:
            return
        job = jobs[job_id]
        source_state = job.setdefault("source_state", {})
        state = source_state.setdefault(table_key, {"line": "", "progress": 0})
        if line is not None:
            state["line"] = line
        if progress is not None:
            state["progress"] = progress
        if job_fields:
            job.update(job_fields)

        visits_line = source_state.get("visits", {}).get("line", "")
        hits_line = source_state.get("hits", {}).get("line", "")
        lines = [part for part in (visits_line, hits_line) if part]
        if lines:
            job["message"] = " | ".join(lines)

        visits_progress = source_state.get("visits", {}).get("progress", 0)
        hits_progress = source_state.get("hits", {}).get("progress", 0)
        if source_state:
            job["progress"] = (visits_progress + hits_progress) // 2


def build_upsert_sql(table_key: str) -> str:
    cfg = TABLE_CONFIG[table_key]
    cols = [col for _, col, _ in cfg["schema"]]
    cols.extend(["date_from", "date_to"])
    col_list = ", ".join(quote_column(c) for c in cols)
    placeholders = ", ".join(f"%({c})s" for c in cols)
    pk = ", ".join(quote_column(c) for c in cfg["pk_cols"])
    table = cfg["table"]
    update_set = ", ".join(
        f"{quote_column(c)} = COALESCE(EXCLUDED.{quote_column(c)}, {table}.{quote_column(c)})"
        for c in cols
    )
    return (
        f"INSERT INTO {table} ({col_list}, loaded_at) "
        f"VALUES ({placeholders}, NOW()) "
        f"ON CONFLICT ({pk}) DO UPDATE SET {update_set}, loaded_at = NOW()"
    )


UPSERT_SQL = {
    "visits": build_upsert_sql("visits"),
    "hits": build_upsert_sql("hits"),
}


def parse_array_value(raw: str) -> list[str] | None:
    if raw is None or raw == "" or raw == "[]":
        return None
    raw = raw.strip()
    if raw.startswith("[") and raw.endswith("]"):
        try:
            parsed = ast.literal_eval(raw)
            if isinstance(parsed, list):
                return [str(x) if x is not None else "" for x in parsed]
        except (ValueError, SyntaxError):
            pass
        inner = raw[1:-1].strip()
        if not inner:
            return None
        return [part.strip().strip("'\"") for part in re.split(r",(?=(?:[^'\"]*['\"][^'\"]*['\"])*[^'\"]*$)", inner) if part.strip()]
    if "," in raw:
        return [part.strip() for part in raw.split(",") if part.strip()]
    return [raw]


def parse_numeric_value(raw: str) -> int | None:
    try:
        return int(raw)
    except ValueError:
        try:
            return int(float(raw))
        except ValueError:
            return None


def parse_field_value(raw: str, pg_type: str) -> Any:
    if raw is None or raw == "":
        return None
    raw = raw.strip()
    if pg_type == "TEXT[]":
        return parse_array_value(raw)
    if pg_type == "NUMERIC(20,0)[]":
        items = parse_array_value(raw)
        if items is None:
            return None
        parsed = [parse_numeric_value(item) for item in items]
        return [value for value in parsed if value is not None] or None
    if pg_type == "DATE":
        return raw[:10]
    if pg_type == "TIMESTAMPTZ":
        try:
            return datetime.fromisoformat(raw)
        except ValueError:
            try:
                return datetime.strptime(raw.replace("T", " ")[:19], "%Y-%m-%d %H:%M:%S")
            except ValueError:
                return raw
    if pg_type == "INTEGER":
        try:
            return int(float(raw))
        except ValueError:
            return None
    if pg_type == "BIGINT":
        return parse_numeric_value(raw)
    if pg_type == "NUMERIC(20,0)":
        return parse_numeric_value(raw)
    if pg_type == "DOUBLE PRECISION":
        try:
            return float(raw)
        except ValueError:
            return None
    return raw


def row_to_record(
    headers: list[str],
    values: list[str],
    schema_map: dict[str, tuple[str, str]],
    date_from: date,
    date_to: date,
) -> dict[str, Any]:
    record: dict[str, Any] = {
        col: None for col in {col for col, _ in schema_map.values()}
    }
    record["date_from"] = date_from
    record["date_to"] = date_to
    for header, value in zip(headers, values, strict=False):
        if header not in schema_map:
            continue
        col, pg_type = schema_map[header]
        record[col] = parse_field_value(value, pg_type)
    return record


def prepare_record_for_insert(record: dict[str, Any], table_key: str) -> dict[str, Any]:
    if table_key == "visits":
        if record.get("watch_ids"):
            record["watch_ids"] = [str(x) for x in record["watch_ids"]]
        if record.get("counter_user_id_hash") is not None:
            record["counter_user_id_hash"] = str(record["counter_user_id_hash"])
    elif table_key == "hits":
        if record.get("watch_id") is not None:
            record["watch_id"] = str(record["watch_id"])
        if record.get("visit_id") is not None:
            record["visit_id"] = str(record["visit_id"])
        if record.get("counter_user_id_hash") is not None:
            record["counter_user_id_hash"] = str(record["counter_user_id_hash"])
    return record


def metrika_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"OAuth {token}"}


def extract_api_error(response: httpx.Response) -> str:
    try:
        data = response.json()
        if "message" in data:
            return str(data["message"])
        if "errors" in data:
            return "; ".join(str(e) for e in data["errors"])
        if "log_request" in data and "errors" in data["log_request"]:
            return "; ".join(str(e) for e in data["log_request"]["errors"])
    except Exception:
        pass
    return response.text or f"HTTP {response.status_code}"


async def create_log_request(
    client: httpx.AsyncClient,
    token: str,
    counter_id: int,
    source: str,
    date_from: date,
    date_to: date,
    fields: str,
) -> int:
    url = f"{METRIKA_API}/counter/{counter_id}/logrequests"
    params = {
        "date1": date_from.isoformat(),
        "date2": date_to.isoformat(),
        "source": source,
        "fields": fields,
    }
    response = await client.post(url, params=params, headers=metrika_headers(token), timeout=60)
    if response.status_code == 403:
        raise RuntimeError("Счётчик недоступен для этого токена")
    if response.status_code >= 400:
        raise RuntimeError(extract_api_error(response))
    data = response.json()
    return int(data["log_request"]["request_id"])


async def poll_log_request(
    client: httpx.AsyncClient,
    token: str,
    counter_id: int,
    request_id: int,
    job_id: str,
    table_key: str,
    chunk_label: str,
) -> dict[str, Any]:
    url = f"{METRIKA_API}/counter/{counter_id}/logrequest/{request_id}"
    deadline = time.time() + POLL_TIMEOUT_SEC
    started_at = time.time()
    while time.time() < deadline:
        response = await client.get(url, headers=metrika_headers(token), timeout=60)
        if response.status_code >= 400:
            raise RuntimeError(extract_api_error(response))
        log_request = response.json()["log_request"]
        status = log_request.get("status", "")
        update_source_job(
            job_id,
            table_key,
            line=f"{chunk_label}: статус выгрузки — {status}",
        )
        if status == "processed":
            return log_request
        if status in ("canceled", "processing_failed", "cleaned_by_user", "cleaned_automatically_as_too_old"):
            raise RuntimeError(f"Выгрузка {chunk_label} завершилась со статусом: {status}")
        elapsed = time.time() - started_at
        interval = POLL_INTERVAL_FAST_SEC if elapsed < POLL_FAST_PHASE_SEC else POLL_INTERVAL_SLOW_SEC
        await asyncio.sleep(interval)
    raise RuntimeError("Яндекс долго обрабатывает запрос, попробуйте меньший диапазон дат")


async def download_part(
    client: httpx.AsyncClient,
    token: str,
    counter_id: int,
    request_id: int,
    part_number: int,
) -> str:
    url = f"{METRIKA_API}/counter/{counter_id}/logrequest/{request_id}/part/{part_number}/download"
    response = await client.get(url, headers=metrika_headers(token), timeout=300)
    if response.status_code >= 400:
        raise RuntimeError(extract_api_error(response))
    return response.text


async def clean_log_request(
    client: httpx.AsyncClient, token: str, counter_id: int, request_id: int
) -> None:
    url = f"{METRIKA_API}/counter/{counter_id}/logrequest/{request_id}/clean"
    response = await client.post(url, headers=metrika_headers(token), timeout=60)
    if response.status_code >= 400:
        logger.warning("Clean request failed: %s", extract_api_error(response))


FIELD_ERROR_PATTERNS = (
    re.compile(r"Unknown field[^:]*:\s*(ym:[^\s,]+)", re.IGNORECASE),
    re.compile(r"doesn't allow to export field\s+(ym:[^\s,]+)", re.IGNORECASE),
    re.compile(r"Unknown field in the request:\s*(ym:[^\s,]+)", re.IGNORECASE),
)


def is_field_access_error(error_text: str) -> bool:
    lower = error_text.lower()
    return "unknown field" in lower or "doesn't allow" in lower


def parse_invalid_field(error_text: str) -> str | None:
    for pattern in FIELD_ERROR_PATTERNS:
        match = pattern.search(error_text)
        if match:
            return match.group(1).rstrip(".,;")
    return None


async def validate_fields(
    client: httpx.AsyncClient,
    token: str,
    counter_id: int,
    fields_chunk: str,
    source: str,
) -> tuple[str, list[str]]:
    yesterday = date.today() - timedelta(days=1)
    fields_list = [field.strip() for field in fields_chunk.split(",") if field.strip()]
    excluded: list[str] = []

    while fields_list:
        fields_str = ",".join(fields_list)
        url = f"{METRIKA_API}/counter/{counter_id}/logrequests"
        params = {
            "date1": yesterday.isoformat(),
            "date2": yesterday.isoformat(),
            "source": source,
            "fields": fields_str,
        }
        response = await client.post(url, params=params, headers=metrika_headers(token), timeout=60)

        if response.status_code < 400:
            request_id = int(response.json()["log_request"]["request_id"])
            await clean_log_request(client, token, counter_id, request_id)
            return fields_str, excluded

        error_text = extract_api_error(response)
        if response.status_code == 403 and not is_field_access_error(error_text):
            raise RuntimeError("Счётчик недоступен для этого токена")
        if not is_field_access_error(error_text):
            raise RuntimeError(error_text)

        bad_field = parse_invalid_field(error_text)
        if bad_field and bad_field in fields_list:
            fields_list.remove(bad_field)
            excluded.append(bad_field)
            logger.info("Excluded unavailable field (%s): %s", source, bad_field)
            continue

        raise RuntimeError(error_text)

    return "", excluded


def load_tsv_into_db(
    tsv_text: str,
    table_key: str,
    date_from: date,
    date_to: date,
    job_id: str,
    status_label: str | None = None,
) -> tuple[int, int]:
    cfg = TABLE_CONFIG[table_key]
    schema_map = {api: (col, pg_type) for api, col, pg_type in cfg["schema"]}
    reader = csv.reader(io.StringIO(tsv_text), delimiter="\t")
    headers = next(reader, None)
    if not headers:
        return 0, 0

    label = status_label or cfg["source"]

    inserted = 0
    skipped = 0
    batch: list[dict[str, Any]] = []

    def flush_batch(cur: psycopg.Cursor, conn: psycopg.Connection, records: list[dict[str, Any]]) -> None:
        nonlocal inserted, skipped
        if not records:
            return
        try:
            cur.executemany(UPSERT_SQL[table_key], records)
            conn.commit()
            inserted += len(records)
        except Exception:
            conn.rollback()
            for rec in records:
                try:
                    cur.execute(UPSERT_SQL[table_key], rec)
                    conn.commit()
                    inserted += 1
                except Exception as exc:
                    conn.rollback()
                    skipped += 1
                    logger.error("Row insert error (%s): %s | %s", table_key, exc, rec)
        update_source_job(
            job_id,
            table_key,
            line=f"{label}: загружено {inserted} строк",
            **{f"rows_{table_key}": inserted},
        )

    with get_connection() as conn:
        with conn.cursor() as cur:
            for row in reader:
                if not row or all(not cell.strip() for cell in row):
                    continue
                try:
                    record = prepare_record_for_insert(
                        row_to_record(headers, row, schema_map, date_from, date_to),
                        table_key,
                    )
                    batch.append(record)
                    if len(batch) >= BATCH_SIZE:
                        flush_batch(cur, conn, batch)
                        batch.clear()
                except Exception as exc:
                    skipped += 1
                    logger.error("Row parse error (%s): %s | %s", table_key, exc, row)

            flush_batch(cur, conn, batch)

    return inserted, skipped


async def process_source(
    client: httpx.AsyncClient,
    token: str,
    counter_id: int,
    date_from: date,
    date_to: date,
    table_key: str,
    job_id: str,
    progress_base: int,
    progress_span: int,
) -> tuple[int, int]:
    cfg = TABLE_CONFIG[table_key]
    source_label = "Визиты" if table_key == "visits" else "События"
    field_chunks = cfg["field_chunks"]
    total_inserted = 0
    total_skipped = 0

    update_source_job(
        job_id,
        table_key,
        line=f"{source_label}: Проверка доступных полей…",
        progress=progress_base,
    )
    validated_chunks: list[str] = []
    excluded_fields: list[str] = []
    for chunk in field_chunks:
        validated_chunk, excluded = await validate_fields(
            client, token, counter_id, chunk, cfg["source"]
        )
        excluded_fields.extend(excluded)
        if validated_chunk:
            validated_chunks.append(validated_chunk)

    if excluded_fields:
        excluded_text = ", ".join(excluded_fields)
        logger.info("%s: excluded unavailable fields: %s", source_label, excluded_text)
        update_source_job(
            job_id,
            table_key,
            line=f"{source_label}: Недоступные поля исключены: {excluded_text}",
        )

    field_chunks = validated_chunks
    total_chunks = len(field_chunks)
    if total_chunks == 0:
        raise RuntimeError(f"{source_label}: нет доступных полей для выгрузки")

    for chunk_idx, fields_chunk in enumerate(field_chunks, start=1):
        chunk_label = f"{source_label}: чанк {chunk_idx}/{total_chunks}"
        chunk_base = progress_base + int((chunk_idx - 1) * progress_span / total_chunks)
        chunk_end = progress_base + int(chunk_idx * progress_span / total_chunks)

        update_source_job(
            job_id,
            table_key,
            line=f"{chunk_label}: создание задачи выгрузки…",
            progress=chunk_base,
        )
        request_id = await create_log_request(
            client, token, counter_id, cfg["source"], date_from, date_to, fields_chunk
        )

        update_source_job(
            job_id,
            table_key,
            line=f"{chunk_label}: ожидание обработки Яндексом…",
            progress=chunk_base + max(1, (chunk_end - chunk_base) // 10),
        )
        log_request = await poll_log_request(
            client, token, counter_id, request_id, job_id, table_key, chunk_label
        )

        parts = log_request.get("parts") or []
        part_span = max(1, chunk_end - chunk_base - 10)

        for idx, part in enumerate(parts, start=1):
            part_number = part["part_number"]
            update_source_job(
                job_id,
                table_key,
                line=f"{chunk_label}: скачивание части {idx}/{len(parts)}…",
                progress=chunk_base + 10 + int(part_span * idx / max(len(parts), 1)),
            )
            tsv_text = await download_part(client, token, counter_id, request_id, part_number)
            update_source_job(
                job_id,
                table_key,
                line=f"{chunk_label}: запись части {idx}/{len(parts)} в БД…",
            )
            inserted, skipped = await asyncio.to_thread(
                load_tsv_into_db,
                tsv_text,
                table_key,
                date_from,
                date_to,
                job_id,
                chunk_label,
            )
            total_inserted += inserted
            total_skipped += skipped

        update_source_job(
            job_id,
            table_key,
            line=f"{chunk_label}: очистка задачи на стороне Яндекса…",
        )
        await clean_log_request(client, token, counter_id, request_id)

    update_source_job(
        job_id,
        table_key,
        line=f"{source_label}: готово",
        progress=progress_base + progress_span,
    )
    return total_inserted, total_skipped


async def run_export(job_id: str, token: str, counter_id: int, date_from: date, date_to: date) -> None:
    try:
        update_job(
            job_id,
            status="running",
            progress=0,
            message="Старт выгрузки…",
            source_state={},
        )

        async with httpx.AsyncClient() as client:
            (visits_inserted, visits_skipped), (hits_inserted, hits_skipped) = await asyncio.gather(
                process_source(
                    client, token, counter_id, date_from, date_to, "visits", job_id,
                    progress_base=0, progress_span=50,
                ),
                process_source(
                    client, token, counter_id, date_from, date_to, "hits", job_id,
                    progress_base=50, progress_span=50,
                ),
            )

        total_skipped = visits_skipped + hits_skipped
        message = (
            f"Готово: визиты {visits_inserted}, события {hits_inserted}"
            if total_skipped == 0
            else f"Загружено визитов {visits_inserted}, событий {hits_inserted}, пропущено {total_skipped} с ошибками"
        )
        update_job(
            job_id,
            status="done",
            progress=100,
            message=message,
            rows_visits=visits_inserted,
            rows_hits=hits_inserted,
        )
    except Exception as exc:
        logger.exception("Export failed")
        update_job(job_id, status="error", message=str(exc))


@app.get("/api/counters")
def get_counters(token: str = Query(..., min_length=1)):
    url = f"{METRIKA_API}/counters"
    try:
        with httpx.Client() as client:
            response = client.get(
                url,
                params={"oauth_token": token},
                headers=metrika_headers(token),
                timeout=30,
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка соединения с API Метрики: {exc}") from exc

    if response.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="Токен недействителен, проверьте права приложения")
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=extract_api_error(response))

    counters = response.json().get("counters", [])
    return [{"id": c["id"], "name": c.get("name", ""), "site": c.get("site", "")} for c in counters]


@app.post("/api/export")
def start_export(body: ExportRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    with jobs_lock:
        jobs[job_id] = {
            "status": "pending",
            "message": "Задача поставлена в очередь",
            "progress": 0,
            "rows_visits": 0,
            "rows_hits": 0,
        }
    background_tasks.add_task(
        run_export,
        job_id,
        body.token,
        body.counter_id,
        body.date_from,
        body.date_to,
    )
    return {"job_id": job_id}


@app.get("/api/status/{job_id}")
def get_status(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return {
        "status": job.get("status", "pending"),
        "message": job.get("message", ""),
        "progress": job.get("progress", 0),
        "rows_visits": job.get("rows_visits", 0),
        "rows_hits": job.get("rows_hits", 0),
    }


@app.get("/api/preview")
def preview_data(
    counter_id: int = Query(...),
    table: str = Query(..., pattern="^(visits|hits)$"),
    date_from: date = Query(...),
    date_to: date = Query(...),
):
    cfg = TABLE_CONFIG[table]
    cols = [col for _, col, _ in cfg["schema"]]
    col_list = ", ".join(quote_column(c) for c in cols)

    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM {cfg['table']}
                WHERE counter_id = %s AND date >= %s AND date <= %s
                """,
                (counter_id, date_from, date_to),
            )
            total = cur.fetchone()["total"]

            cur.execute(
                f"""
                SELECT {col_list}
                FROM {cfg['table']}
                WHERE counter_id = %s AND date >= %s AND date <= %s
                ORDER BY date DESC
                LIMIT 10
                """,
                (counter_id, date_from, date_to),
            )
            rows = cur.fetchall()

    array_cols = {col for _, col, pg_type in cfg["schema"] if pg_type.endswith("[]")}
    serialized = []
    for row in rows:
        item = {}
        for key, value in row.items():
            if key in array_cols and value is not None:
                item[key] = [int(v) if isinstance(v, Decimal) else v for v in value]
            elif isinstance(value, Decimal):
                item[key] = int(value)
            elif isinstance(value, (date, datetime)):
                item[key] = value.isoformat()
            else:
                item[key] = value
        serialized.append(item)

    return {"total": total, "rows": serialized, "columns": cols}


@app.get("/")
def index():
    return FileResponse("static/index.html")


app.mount("/static", StaticFiles(directory="static"), name="static")
