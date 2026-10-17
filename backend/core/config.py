"""
Loads settings from backend/.env once, so the rest of the backend imports them from here.
This is better than loading themn in every file, making it more centralized and easier to test.

"""

import os
from pathlib import Path

from dotenv import load_dotenv

# backend/.env, found relative to this file so it loads no matter where the server is started from
load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

# the most tools Gemini may call to answer one question (each call is another paid Gemini request)
AGENT_MAX_TOOL_CALLS = int(os.getenv("AGENT_MAX_TOOL_CALLS", "10"))

# the Next.js app allowed to call this API (CORS)
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
