"""Compatibility entry point for the backend team's `python main.py` command."""

from backend.app import app


if __name__ == "__main__":
    import os
    import uvicorn

    uvicorn.run(
        "backend.app:app",
        host=os.getenv("CAIRN_HOST", "0.0.0.0"),
        port=int(os.getenv("CAIRN_PORT", "8000")),
        reload=os.getenv("CAIRN_RELOAD", "true").lower() == "true",
    )
