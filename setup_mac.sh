#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 was not found. Install Python 3.9 or newer and retry."
  exit 1
fi

if ! python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)'; then
  echo "CareTrace requires Python 3.9 or newer."
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm were not found. Install Node.js 20.19+ or 22.12+ and retry."
  exit 1
fi

if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number); process.exit((major===20&&minor>=19)||major>=22?0:1)'; then
  echo "The locked Vite toolchain requires Node.js 20.19+ or 22.12+."
  exit 1
fi

echo "Creating a clean Python environment..."
if [ -d .venv ]; then
  mv .venv ".venv.previous.$(date +%Y%m%d%H%M%S)"
fi
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r requirements.txt

echo "Installing frontend packages..."
npm ci

echo "Building the responsive frontend..."
npm run build

echo "Running the full-stack acceptance test..."
PYTHONPATH="$PWD" python tests/smoke_test.py

echo
echo "Setup and acceptance checks complete. Start the complete single-server app with:"
echo "  source .venv/bin/activate && python main.py"
echo "Then open http://localhost:8000"
echo "Optional frontend hot-reload development server: npm run dev (port 5173)."
echo
echo "If 'ollama serve' reports port 11434 is in use, Ollama is already running."
