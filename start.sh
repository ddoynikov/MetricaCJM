#!/bin/bash
cd "$(dirname "$0")"
uvicorn app:app --reload --port 8000