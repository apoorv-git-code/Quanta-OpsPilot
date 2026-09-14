"""Start CareTrace's API reliably from Terminal, VS Code, or Finder."""

import os
import sys
from pathlib import Path

import uvicorn


PROJECT_ROOT = Path(__file__).resolve().parent

# Uvicorn's reload worker imports the app in a child process. Anchoring both the
# working directory and import path prevents `No module named backend` when the
# launcher is invoked through VS Code or from a different directory.
os.chdir(PROJECT_ROOT)
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


if __name__ == "__main__":
    uvicorn.run(
        "backend.app:app",
        host=os.getenv("CAIRN_HOST", "0.0.0.0"),
        port=int(os.getenv("CAIRN_PORT", "8000")),
        reload=os.getenv("CAIRN_RELOAD", "true").lower() == "true",
        reload_dirs=[str(PROJECT_ROOT / "backend")],
    )
