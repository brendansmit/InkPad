#!/bin/bash
# Double-click this file to launch Writing Analyzer.
# If macOS asks "Are you sure?", click Open.

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
source .venv/bin/activate
export SSL_CERT_FILE=$(python -c "import certifi; print(certifi.where())" 2>/dev/null)
python app.py
