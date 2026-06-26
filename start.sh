#!/bin/bash
cd "$(dirname "$0")"

pip3 install -q -r requirements.txt
uvicorn app:app --reload --port 8000
