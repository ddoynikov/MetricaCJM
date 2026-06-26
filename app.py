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
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from psycopg.rows import dict_row
from starlette.middleware.sessions import SessionMiddleware

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
METRIKA_TOKEN = os.getenv("METRIKA_TOKEN", "").strip()
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
SESSION_TOKEN_KEY = "metrika_token"
SESSION_LOGOUT_KEY = "auth_cleared"
METRIKA_API = "https://api-metrika.yandex.net/management/v1"
POLL_INTERVAL_FAST_SEC = 5
POLL_INTERVAL_SLOW_SEC = 10
POLL_FAST_PHASE_SEC = 30
POLL_TIMEOUT_SEC = 30 * 60
BATCH_SIZE = 1000

app = FastAPI(title="Metrika Logs Loader")
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)
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
    counter_id: int
    date_from: date
    date_to: date


class AuthRequest(BaseModel):
    token: str


def token_hint(token: str) -> str:
    if len(token) <= 3:
        return "****"
    return f"{token[:3]}...****"


def get_session_token(request: Request) -> str | None:
    value = request.session.get(SESSION_TOKEN_KEY)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def ensure_session_token(request: Request) -> str | None:
    token = get_session_token(request)
    if token:
        return token
    if request.session.get(SESSION_LOGOUT_KEY):
        return None
    if METRIKA_TOKEN:
        request.session[SESSION_TOKEN_KEY] = METRIKA_TOKEN
        return METRIKA_TOKEN
    return None


def resolve_token(request: Request) -> str:
    token = ensure_session_token(request)
    if token:
        return token
    raise HTTPException(status_code=401, detail="Токен не задан")


def fetch_counters(auth_token: str) -> list[dict[str, Any]]:
    url = f"{METRIKA_API}/counters"
    try:
        with httpx.Client() as client:
            response = client.get(
                url,
                params={"oauth_token": auth_token},
                headers=metrika_headers(auth_token),
                timeout=30,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502, detail=f"Ошибка соединения с API Метрики: {exc}"
        ) from exc

    if response.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="Токен недействителен, проверьте права приложения")
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=extract_api_error(response))

    counters = response.json().get("counters", [])
    return [{"id": c["id"], "name": c.get("name", ""), "site": c.get("site", "")} for c in counters]


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


@app.get("/api/auth/status")
def auth_status(request: Request):
    token = ensure_session_token(request)
    if not token:
        return {"authorized": False, "token_hint": None}
    return {"authorized": True, "token_hint": token_hint(token)}


@app.post("/api/auth")
def auth_login(body: AuthRequest, request: Request):
    token = body.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Токен не задан")
    fetch_counters(token)
    request.session[SESSION_TOKEN_KEY] = token
    request.session.pop(SESSION_LOGOUT_KEY, None)
    return {"ok": True}


@app.post("/api/auth/logout")
def auth_logout(request: Request):
    request.session.pop(SESSION_TOKEN_KEY, None)
    request.session[SESSION_LOGOUT_KEY] = True
    return {"ok": True}


@app.get("/api/stats")
def get_stats():
    try:
        counters = fetch_all_counters_stats()
        last_updated = fetch_last_updated()
    except Exception as exc:
        logger.exception("Stats fetch failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        "counters": counters,
        "last_updated": last_updated,
    }


@app.get("/api/counters")
def get_counters(request: Request):
    auth_token = resolve_token(request)
    return fetch_counters(auth_token)


@app.post("/api/export")
def start_export(body: ExportRequest, request: Request, background_tasks: BackgroundTasks):
    auth_token = resolve_token(request)
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
        auth_token,
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


def serialize_row_value(value: Any, is_array: bool) -> Any:
    if is_array and value is not None:
        return [int(v) if isinstance(v, Decimal) else v for v in value]
    if isinstance(value, Decimal):
        return int(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


@app.get("/api/table-preview")
def table_preview(
    table: str = Query(..., pattern="^(visits|hits)$"),
    counter_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    cfg = TABLE_CONFIG[table]
    cols = [col for _, col, _ in cfg["schema"]]
    col_list = ", ".join(quote_column(c) for c in cols)
    array_cols = {col for _, col, pg_type in cfg["schema"] if pg_type.endswith("[]")}

    where_clauses: list[str] = []
    params: list[Any] = []
    if counter_id is not None:
        where_clauses.append("counter_id = %s")
        params.append(counter_id)

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"SELECT COUNT(*) AS total FROM {cfg['table']} {where_sql}",
                params,
            )
            total = int(cur.fetchone()["total"])

            cur.execute(
                f"""
                SELECT {col_list}
                FROM {cfg['table']}
                {where_sql}
                ORDER BY date DESC
                LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            rows = cur.fetchall()

    serialized_rows = []
    for row in rows:
        serialized_rows.append(
            [serialize_row_value(row[col], col in array_cols) for col in cols]
        )

    return {"columns": cols, "rows": serialized_rows, "total": total}


@app.get("/api/project-status")
async def get_project_status():
    try:
        with open("PROJECT_STATUS.md", "r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content}
    except FileNotFoundError:
        return {"content": "PROJECT_STATUS.md не найден"}


CJM_SCHEMA_SQL = os.path.join(os.path.dirname(__file__), "sql", "004_cjm_schema.sql")
CJM_DEVICES = frozenset({"all", "desktop", "mobile", "tablet"})


def build_cjm_filter(
    device: str,
    utm_medium: str | None,
    counter_id: int | None = None,
    user_id_type: str | None = None,
    user_id_value: str | None = None,
) -> tuple[str, list[Any], str | None]:
    clauses: list[str] = []
    params: list[Any] = []
    warning: str | None = None
    if counter_id is not None:
        clauses.append("counter_id = %s")
        params.append(counter_id)
    if device != "all":
        clauses.append("device_category = %s")
        params.append(device)
    if utm_medium:
        clauses.append("utm_medium = %s")
        params.append(utm_medium)
    if user_id_type and user_id_value:
        if user_id_type == "counter_user_id_hash":
            clauses.append(
                "visit_id IN ("
                "SELECT visit_id FROM raw_metrika.hits "
                "WHERE counter_user_id_hash = %s"
                ")"
            )
            params.append(user_id_value)
        elif user_id_type == "user_id":
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT EXISTS (
                          SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'raw_metrika'
                            AND table_name = 'hits'
                            AND column_name = 'user_id'
                        )
                        """
                    )
                    has_user_id = bool(cur.fetchone()[0])
            if not has_user_id:
                warning = (
                    "UserID не найден в загруженных данных. "
                    "Возможно, сайт не передаёт UserID в Метрику."
                )
                clauses.append("FALSE")
            else:
                clauses.append(
                    "visit_id IN ("
                    "SELECT visit_id FROM raw_metrika.hits "
                    "WHERE user_id = %s"
                    ")"
                )
                params.append(user_id_value)
    if not clauses:
        return "TRUE", params, warning
    return " AND ".join(clauses), params, warning


def empty_stats_block() -> dict[str, Any]:
    return {
        "total_rows": None,
        "date_min": None,
        "date_max": None,
        "missing_days": None,
    }


def fetch_missing_days_for_counter(
    cur: psycopg.Cursor,
    table: str,
    date_col: str,
    counter_id: int,
    date_min: date,
    date_max: date,
) -> list[str]:
    cur.execute(
        f"""
        SELECT d::date AS missing_day
        FROM generate_series(%s::date, %s::date, '1 day'::interval) d
        WHERE d::date NOT IN (
          SELECT DISTINCT {quote_column(date_col)}
          FROM {table}
          WHERE counter_id = %s
        )
        ORDER BY d
        """,
        (date_min, date_max, counter_id),
    )
    return [
        m["missing_day"].isoformat()
        for m in cur.fetchall()
        if m["missing_day"]
    ]


def fetch_grouped_table_stats(
    cur: psycopg.Cursor,
    table: str,
    date_col: str,
) -> dict[int, dict[str, Any]]:
    cur.execute(
        f"""
        SELECT
          counter_id,
          COUNT(*) AS total_rows,
          MIN({quote_column(date_col)}) AS date_min,
          MAX({quote_column(date_col)}) AS date_max
        FROM {table}
        GROUP BY counter_id
        """
    )
    result: dict[int, dict[str, Any]] = {}
    for row in cur.fetchall():
        counter_id = int(row["counter_id"])
        date_min = row["date_min"]
        date_max = row["date_max"]
        missing_days: list[str] = []
        if date_min and date_max:
            missing_days = fetch_missing_days_for_counter(
                cur, table, date_col, counter_id, date_min, date_max
            )
        result[counter_id] = {
            "total_rows": int(row["total_rows"]),
            "date_min": date_min.isoformat() if date_min else None,
            "date_max": date_max.isoformat() if date_max else None,
            "missing_days": missing_days,
        }
    return result


def fetch_all_counters_stats() -> list[dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            visits_by_counter = fetch_grouped_table_stats(
                cur, "raw_metrika.visits", "date"
            )
            hits_by_counter = fetch_grouped_table_stats(
                cur, "raw_metrika.hits", "date"
            )

    all_counter_ids = set(visits_by_counter.keys()) | set(hits_by_counter.keys())
    counters: list[dict[str, Any]] = []
    for counter_id in sorted(all_counter_ids):
        counters.append(
            {
                "counter_id": counter_id,
                "visits": visits_by_counter.get(counter_id, empty_stats_block()),
                "hits": hits_by_counter.get(counter_id, empty_stats_block()),
            }
        )
    return counters


def fetch_last_updated() -> str | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT MAX(ts) AS last_updated FROM (
                  SELECT MAX(loaded_at) AS ts FROM raw_metrika.visits
                  UNION ALL
                  SELECT MAX(loaded_at) AS ts FROM raw_metrika.hits
                ) t
                """
            )
            row = cur.fetchone()
            if row and row[0]:
                ts = row[0]
                if isinstance(ts, datetime):
                    return ts.isoformat()
                return str(ts)
    return None


def cjm_tables_exist(cur: psycopg.Cursor) -> bool:
    cur.execute(
        """
        SELECT COUNT(*) = 3 AS ready
        FROM information_schema.tables
        WHERE table_schema = 'app_metrica_cjm'
          AND table_name IN ('hits_normalized', 'transitions', 'page_metrics')
        """
    )
    row = cur.fetchone()
    return bool(row and row["ready"])


def refresh_cjm_tables() -> None:
    with open(CJM_SCHEMA_SQL, encoding="utf-8") as f:
        sql = f.read()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()


CJM_NODES_SQL = """
WITH filtered AS (
  SELECT visit_id, page, date_time
  FROM app_metrica_cjm.hits_normalized
  WHERE {filter}
),
entries AS (
  SELECT page, COUNT(*) AS entry_count
  FROM (
    SELECT DISTINCT ON (visit_id) visit_id, page
    FROM filtered
    ORDER BY visit_id, date_time ASC
  ) t
  GROUP BY page
),
exits AS (
  SELECT page, COUNT(*) AS exit_count
  FROM (
    SELECT DISTINCT ON (visit_id) visit_id, page
    FROM filtered
    ORDER BY visit_id, date_time DESC
  ) t
  GROUP BY page
),
totals AS (
  SELECT page, COUNT(DISTINCT visit_id) AS unique_visits
  FROM filtered
  GROUP BY page
)
SELECT
  t.page AS id,
  t.unique_visits AS visits,
  COALESCE(e.entry_count, 0) AS entries,
  COALESCE(x.exit_count, 0) AS exits,
  ROUND(COALESCE(x.exit_count, 0)::numeric / NULLIF(t.unique_visits, 0) * 100, 1) AS exit_rate
FROM totals t
LEFT JOIN entries e ON t.page = e.page
LEFT JOIN exits x ON t.page = x.page
ORDER BY t.unique_visits DESC
"""

CJM_EDGES_SQL = """
WITH filtered AS (
  SELECT visit_id, page, date_time
  FROM app_metrica_cjm.hits_normalized
  WHERE {filter}
),
ordered AS (
  SELECT
    visit_id,
    page,
    LAG(page) OVER (PARTITION BY visit_id ORDER BY date_time) AS prev_page
  FROM filtered
)
SELECT
  prev_page AS "from",
  page AS "to",
  COUNT(*) AS count,
  COUNT(DISTINCT visit_id) AS unique_visits
FROM ordered
WHERE prev_page IS NOT NULL
  AND prev_page != page
GROUP BY prev_page, page
HAVING COUNT(*) >= %s OR prev_page = '/' OR page = '/'
ORDER BY COUNT(*) DESC
"""

CJM_CHANNELS_SQL = """
SELECT DISTINCT utm_medium
FROM app_metrica_cjm.hits_normalized
WHERE utm_medium IS NOT NULL AND utm_medium != ''
  AND ({filter})
ORDER BY utm_medium
"""


@app.get("/api/cjm")
def get_cjm(
    min_transitions: int = Query(10, ge=0),
    device: str = Query("all"),
    utm_medium: str | None = Query(None),
    counter_id: int | None = Query(None),
    user_id_type: str | None = Query(None),
    user_id_value: str | None = Query(None),
):
    if device not in CJM_DEVICES:
        raise HTTPException(status_code=400, detail="device: all, desktop, mobile или tablet")

    if user_id_type and user_id_type not in ("counter_user_id_hash", "user_id"):
        raise HTTPException(
            status_code=400,
            detail="user_id_type: counter_user_id_hash или user_id",
        )

    filter_sql, filter_params, warning = build_cjm_filter(
        device, utm_medium, counter_id, user_id_type, user_id_value
    )

    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if not cjm_tables_exist(cur):
                raise HTTPException(
                    status_code=503,
                    detail="Таблицы CJM не созданы. Нажмите «Пересчитать CJM».",
                )

            cur.execute(CJM_NODES_SQL.format(filter=filter_sql), filter_params)
            all_nodes = []
            for row in cur.fetchall():
                all_nodes.append(
                    {
                        "id": row["id"],
                        "visits": int(row["visits"]),
                        "entries": int(row["entries"]),
                        "exits": int(row["exits"]),
                        "exit_rate": float(row["exit_rate"]) if row["exit_rate"] is not None else 0.0,
                    }
                )

            cur.execute(
                CJM_EDGES_SQL.format(filter=filter_sql),
                [*filter_params, min_transitions],
            )
            edges = [
                {
                    "from": row["from"],
                    "to": row["to"],
                    "count": int(row["count"]),
                    "unique_visits": int(row["unique_visits"]),
                }
                for row in cur.fetchall()
            ]

            pages_in_edges = set()
            for edge in edges:
                pages_in_edges.add(edge["from"])
                pages_in_edges.add(edge["to"])

            nodes = [
                n for n in all_nodes
                if n["id"] in pages_in_edges or n["id"] == "/"
            ]

    result: dict[str, Any] = {"nodes": nodes, "edges": edges}
    if warning:
        result["warning"] = warning
    return result


@app.get("/api/cjm/channels")
def get_cjm_channels(
    device: str = Query("all"),
    counter_id: int | None = Query(None),
):
    if device not in CJM_DEVICES:
        raise HTTPException(status_code=400, detail="device: all, desktop, mobile или tablet")

    filter_sql, filter_params, _ = build_cjm_filter(device, None, counter_id)

    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if not cjm_tables_exist(cur):
                return {"channels": []}
            cur.execute(CJM_CHANNELS_SQL.format(filter=filter_sql), filter_params)
            channels = [row["utm_medium"] for row in cur.fetchall()]
    return {"channels": channels}


@app.post("/api/cjm/refresh")
def refresh_cjm():
    try:
        refresh_cjm_tables()
    except Exception as exc:
        logger.exception("CJM refresh failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"status": "ok", "message": "Таблицы CJM пересчитаны"}


@app.get("/cjm")
async def cjm_page():
    return FileResponse("static/cjm.html")


@app.get("/")
async def index():
    return FileResponse("static/index.html")


app.mount("/static", StaticFiles(directory="static"), name="static")
