# AI Agent Integration Guide (Gemini + USGS tools)

This guide explains how to turn the prototype functions in `backend/tests/` into real backend services and then connect a Gemini agent that can call them as tools. It tells you which files to create or change and what each one should contain. It describes the code without writing it for you.

---

## 0. Where things stand today

| What | Where it lives now | Problem |
|---|---|---|
| `get_latest_data` | `backend/tests/get_discharge.py` | Real logic sits inside a test script |
| `get_daily_mean` | `backend/tests/daily_mean_smoke.py` | Prints errors and returns `None`, so an LLM learns nothing from a failure |
| `get_hourly_data` | `backend/tests/seven_day_iv_hourly_data_smoke.py` | Returns up to 168 rows per parameter, which is too many tokens to send to an LLM |
| `get_reference_table`, `compare_datum_to_reference`, `get_todays_percentile` | `backend/tests/datum_comparison_to_other_data_unittest.py` | Production code and unit tests share one file |
| Gemini tool calling | `backend/tests/basic_ai_agent_gemini.py` | Toy `add_numbers` tool. It handles only one round of tool calls, runs as a CLI loop, and reads `GEMINI_API_CREDENTIALS` from `tests/.env.test` |
| API | `backend/app/main.py`, `backend/routers/methods.py` | Only a `/test` hello endpoint |
| Config | `backend/.env.example` | Uses `GEMINI_API_KEY`, which doesn't match the test's `GEMINI_API_CREDENTIALS` |
| Dependencies | `backend/requirements.txt` | Missing `google-genai`, `python-dotenv`, `uvicorn`. The file is saved as UTF-16 (see §9) |

Already in good shape: `services/params.py` (`PARAMS`) and `services/gauge_registry.py` (`GAUGE_REGISTRY`). Keep both as the single source of truth.

---

## 1. Target structure

```
backend/
├── .env                      (local only, git-ignored)  GEMINI_API_KEY=..., GEMINI_MODEL=...
├── .env.example              (update)
├── requirements.txt          (update, re-save as UTF-8)
├── app/
│   └── main.py               (update)
├── core/
│   └── config.py             (new)   loads env vars once
├── services/
│   ├── params.py             (keep)
│   ├── gauge_registry.py     (keep, add 1–2 helpers)
│   ├── usgs_client.py        (new)   shared HTTP + parsing helpers
│   ├── observations.py       (new)   latest / daily mean / hourly
│   └── get_percentile.py     (new)   reference table + log-probability interpolation
├── agent/
│   ├── __init__.py           (new, empty)
│   ├── tools.py              (new)   LLM-facing wrappers around services
│   ├── prompts.py            (new)   system instruction text
│   └── gemini_agent.py       (new)   Gemini client + run_agent()
├── schemas/
│   └── api.py                (new)   Pydantic request/response models
├── routers/
│   ├── methods.py            (update → data endpoints, or rename to gauges.py)
│   └── agent.py              (new)   POST /agent/chat
└── tests/
    ├── unit_tests/           offline, mocked HTTP, fast
    │   ├── datum_comparison_to_other_data_unittest.py  (moved, import from services.get_percentile)
    │   ├── test_observations.py   (new, mocked fetch_json)
    │   └── test_agent_tools.py    (new, mocked services)
    ├── smoke_tests/          hit the live USGS API
    │   ├── get_discharge.py                     (moved, import from services.observations)
    │   ├── daily_mean_smoke.py                  (moved, import from services.observations)
    │   └── seven_day_iv_hourly_data_smoke.py    (moved, import from services.observations)
    └── basic_ai_agent_gemini.py  (delete once the real agent works, or keep as a scratch file)
```

**Layering rule:** `services/` knows about USGS and math only. `agent/` knows about Gemini and calls `services/`. `routers/` knows about HTTP and calls `services/` and `agent/`. Nothing in `services/` imports from `agent/` or `routers/`.

### Import convention (important)

`app/main.py` already does `from routers import methods`, which assumes you run the server from inside `backend/`. The test files instead put the repo root on `sys.path` and import `backend.services.params`. These two styles break each other once service modules start importing one another.

**Pick one: always run from `backend/` and use top-level imports** (`from services.params import PARAMS`, `from agent.tools import ...`).

- Start the server with `uvicorn app.main:app --reload` from the `backend/` folder.
- Delete every `sys.path.insert(...)` line in the tests.
- Run tests from `backend/` with `python -m` (for example `python -m tests.smoke_tests.get_discharge`), which puts `backend/` on the import path. `python tests/smoke_tests/get_discharge.py` won't find `services`.

---

## 2. Dependencies and config

### 2.1 `backend/requirements.txt`
Add these lines, pinned to whatever versions you install:
- `google-genai` (the current Google Gen AI SDK, imported as `from google import genai`. Don't use the old `google-generativeai` package.)
- `python-dotenv`
- `uvicorn[standard]`
- Optional: `slowapi` for per-IP rate limiting (your ARCHITECTURE.md Tier 1 asks for it)

Install into the existing `backend/venv`. Right now it only has `fastapi` and its dependencies.

### 2.2 `backend/.env.example`
Use one variable name everywhere. Recommended:
- `GEMINI_API_KEY=your-gemini-api-key-here` (keep this one, because the SDK's `genai.Client()` reads `GEMINI_API_KEY` from the environment automatically)
- `GEMINI_MODEL=` the model ID you want (the test uses `gemini-3.8-flash`. Confirm the exact ID in Google AI Studio, or by listing models with the SDK, before you rely on it.)
- `AGENT_MAX_TOOL_CALLS=8`
- `FRONTEND_ORIGIN=http://localhost:3000` (for CORS)

Get the key from Google AI Studio → "Get API key". Put it in `backend/.env`, which is already git-ignored by the `.env` rule. Stop using `tests/.env.test` and `GEMINI_API_CREDENTIALS`.

### 2.3 `backend/core/config.py` (new)
- Call `load_dotenv()` pointing at `backend/.env`, building the path from `Path(__file__)` so it doesn't depend on the working directory.
- Expose module-level constants: `GEMINI_API_KEY`, `GEMINI_MODEL` (with a sensible default), `AGENT_MAX_TOOL_CALLS` (cast to int), `FRONTEND_ORIGIN`.
- Don't raise at import time if the key is missing, or the data endpoints and tests will break. Raise only when the agent is first used (see §5).

---

## 3. Promote the test methods into real services

General rules for every service function:
1. **Raise, don't print.** Raise `ValueError` for bad input and `LookupError` for "USGS has no data". Let `requests` exceptions propagate. The router turns these into HTTP errors and the agent tool layer turns them into `{"error": ...}` dicts.
2. **Validate against the registry first.** Before calling USGS, check that `gauge_id` is in `GAUGE_REGISTRY` and `param_id` is in that gauge's `params` list. This saves a network round trip and gives the LLM a precise error ("Goose Creek only reports 00060, 00065").
3. **Return plain dicts/lists of JSON-safe types** (str, float, int, bool, None). No pandas objects, no `datetime` objects. Use ISO strings.
4. **Keep all USGS URLs in one place** (`usgs_client.py`). USGS has been migrating from the legacy `waterservices.usgs.gov` endpoints to the newer Water Data APIs (`api.waterdata.usgs.gov`). Check the legacy services' status, and keep the URLs centralized so a future switch touches one file.

### 3.1 `services/gauge_registry.py` (add helpers)
Add two small functions under the dict:
- `validate_gauge_param(gauge_id, param_id)`: raises `ValueError` when the gauge is unknown, the param is not in `PARAMS`, or the gauge doesn't report that param. Make the message list what *is* available.
- `list_gauges()`: returns a list of `{gauge_id, name, params: [{param_id, name}]}`, building the param names from `PARAMS`.

### 3.2 `services/usgs_client.py` (new)
- Constants: `IV_URL` (instantaneous values), `DV_URL` (daily values), `STAT_URL` (statistics), and a default timeout.
- A module-level `requests.Session()` for connection reuse.
- `fetch_json(url, params, timeout)`: GET, `raise_for_status()`, return `.json()`.
- `fetch_text(url, params, timeout)`: same, but returns `.text` (for the RDB stat format).
- `iter_valid_readings(series)`: a generator, pulled from the repeated loop in all three smoke scripts. Given one `timeSeries` entry, read `noDataValue` and yield `(dateTime, float value, qualifiers)` for every reading that isn't the no-data sentinel.
- `series_param_code(series)` and `series_unit(series)`: one-liners that read `variable.variableCode[0].value` and `variable.unit.unitCode`.

### 3.3 `services/observations.py` (new)
Move the three fetchers here and rewrite them to use the helpers.

**`get_latest_data(gauge_id, param_id) -> dict`**
- Copy from `tests/get_discharge.py`.
- Call `validate_gauge_param` first.
- Keep the "newest reading across all series" logic, but loop with `iter_valid_readings`.
- If nothing is found, raise `LookupError` instead of returning `None`.
- Same return shape as now: `gauge_id, site_name, parameter, param_id, value, unit, measured_at, provisional`.

**`get_daily_mean(gauge_id, param_id, start_date=None, end_date=None) -> list[dict]`**
- Copy from `tests/daily_mean_smoke.py`.
- Remove the `try/except` that prints and returns `None`, and let exceptions propagate (rule 1).
- Validate the date strings (`YYYY-MM-DD`, start ≤ end) and cap the range, for example at 366 days. Raise `ValueError` otherwise.
- The return shape (`date, mean, unit, provisional`) is fine.

**`get_hourly_data(gauge_id, param_ids, days=7) -> dict`**
- Copy from `tests/seven_day_iv_hourly_data_smoke.py`.
- Validate every param against the gauge.
- Clamp `days` to a range such as 1–7.
- Use `siteStatus=all`, the same as the other two functions. The smoke test uses `active`, which is inconsistent.
- Keep the pandas resampling. Keep the timezone as `America/New_York`, or pass it in as a constant.

**`summarize_hourly(hourly_result) -> dict`** (new, for the agent)
- For each param, compute: first and last hour, latest mean, min (with its hour), max (with its hour), overall mean, number of hours with data, and a simple trend label ("rising"/"falling"/"steady"). Get the trend by comparing the average of the last 6 hours with the 6 hours before that, using a small percent threshold.
- This keeps a 7-day query to a few hundred tokens instead of thousands. The frontend chart still uses the full `get_hourly_data` output through the REST endpoint.

### 3.4 `services/get_percentile.py` (new)
Move everything above the "Unit tests on synthetic data" banner from `tests/datum_comparison_to_other_data_unittest.py` into this file: `PERCENTILE_COLUMNS`, `STANDARD_NORMAL`, `get_reference_table`, `compare_datum_to_reference`, `get_todays_percentile`. The math is correct and tested, so leave it as it is.

Changes:
- **Split fetch from parse.** Make `fetch_stat_rows(gauge_id, param_id)` return all parsed rows, and have `get_reference_table` pick the month/day. The stat service returns the whole year in one call, so wrap the fetch in `functools.lru_cache` (or a TTL cache). Statistics change about once a year, so caching saves a USGS call on every agent question.
- Validate with `validate_gauge_param`.
- **Add `get_current_percentile(gauge_id, param_id) -> dict`.** This is the composite function the agent will actually use. It:
  1. calls `get_latest_data` to get the reading and `measured_at`,
  2. uses the date of `measured_at` (not `date.today()`, which can differ near midnight or when the gauge is lagging) to get the reference table,
  3. calls `compare_datum_to_reference`,
  4. returns `{gauge_id, site_name, parameter, value, unit, measured_at, percentile (0–1, rounded), percentile_label, reference: {p10, p25, p50, p75, p90, min, max, years}}`.
- **Add `percentile_label(p)`.** It maps a percentile to USGS-style words: <10 "much below normal", 10–24 "below normal", 25–75 "normal", 76–90 "above normal", >90 "much above normal". The LLM should quote this label, not invent its own.
- **Caveat to document in the docstring:** USGS daily statistics come from *daily means*. Comparing a single 15-minute reading to them is an approximation. Optionally also return today's provisional daily mean percentile (via `get_daily_mean`) when it exists.

---

## 4. Move and fix the tests

Tests are split into two folders: `tests/unit_tests/` (offline, every USGS call mocked, safe to run any time) and `tests/smoke_tests/` (calls the real USGS API, so run it only when you want to check live data). The files are already moved. The table says what still needs to change inside each one.

| File | Folder | What to do |
|---|---|---|
| `datum_comparison_to_other_data_unittest.py` | `tests/unit_tests/` | Delete the copied functions and `PERCENTILE_COLUMNS`/`STANDARD_NORMAL` above the "Unit tests on synthetic data" banner, and import them from `services.get_percentile` instead. Keep the synthetic data and the `TestCase` classes. The tests that mock the HTTP call currently patch `requests.get`, which the service no longer calls directly. Change them to patch `services.get_percentile.fetch_text` and return `SYNTHETIC_RDB` as a plain string, not a `MagicMock`. Add a `setUp` to `TestStep1ReferenceTable` and `TestLogProbabilityInterpolation` that calls `fetch_stat_rows.cache_clear()`, or a mocked response stays cached and leaks into other tests. Add one test for the empty-response case (`fetch_text` returns `""` → `LookupError`). |
| `get_discharge.py` | `tests/smoke_tests/` | Delete the copied `get_latest_data` and import it from `services.observations`. Keep the `__main__` loop over the 9 gauges, but loop over each gauge's own `params` from `GAUGE_REGISTRY` instead of all of `PARAMS`, and wrap each call in `try/except` that prints the error. Unreported params now raise `ValueError` before any USGS call. |
| `daily_mean_smoke.py` | `tests/smoke_tests/` | Same idea: import `get_daily_mean` from `services.observations`, loop over `GAUGE_REGISTRY` params, and print errors. The service raises `LookupError` instead of printing and returning `None`. |
| `seven_day_iv_hourly_data_smoke.py` | `tests/smoke_tests/` | Import `get_hourly_data` and `summarize_hourly` from `services.observations`. Keep the existing print of the last 5 hours, and also print the `summarize_hourly` output so you can see what the agent will receive. |
| `test_observations.py` (new) | `tests/unit_tests/` | Write a `unittest.TestCase` that patches `services.observations.fetch_json` with a small hand-made USGS JSON payload. Write the payload once at the top as a helper that builds one `timeSeries` entry (`sourceInfo.siteName`, `variable.variableCode`, `variable.unit.unitCode`, `variable.noDataValue = -999999`, and `values[0].value` as a list of `{value, qualifiers, dateTime}`). Test: (1) `get_latest_data` skips a trailing `-999999` reading; (2) with two series for the same param, it returns the newer reading; (3) an empty `timeSeries` raises `LookupError`; (4) Goose Creek (`01644000`) + `00010` raises `ValueError` and `fetch_json` is never called; (5) `get_daily_mean` raises `ValueError` for a bad date string, start after end, and a range over 366 days; (6) `get_hourly_data` clamps `days=30` to `P7D` (check the params passed to the mock); (7) `summarize_hourly` returns the right min/max/latest and "rising"/"falling"/"steady"/"not enough data" for hand-made hourly lists. |
| `test_agent_tools.py` (new) | `tests/unit_tests/` | Write this after step 5.2, since it tests `agent/tools.py`. Patch the service functions where the tools module imports them (for example `agent.tools.get_latest_data`, not `services.observations.get_latest_data`). Test: (1) each tool returns its service's result on success; (2) when the service raises `ValueError`, `LookupError` or `requests.RequestException`, the tool returns `{"error": "..."}` and doesn't raise; (3) `get_daily_means` converts `""` dates to `None`, and returns a summary instead of every row when the service returns more than ~31 rows; (4) `get_recent_trend` returns the `summarize_hourly` shape, not the raw hourly list; (5) every function in `AGENT_TOOLS` has a docstring and type hints on all parameters, since Gemini builds the tool schema from them. |
| `basic_ai_agent_gemini.py` | `tests/` | Delete it once `/agent/chat` works, since the real agent replaces it. |

**Running them** (from `backend/` with the venv active):
- All unit tests: `python -m unittest discover -s tests/unit_tests -p "*test*.py"`. The `-p` pattern is needed because the default only matches files starting with `test`, which would skip `datum_comparison_to_other_data_unittest.py`.
- One smoke test: `python -m tests.smoke_tests.get_discharge` (or `daily_mean_smoke`, `seven_day_iv_hourly_data_smoke`).

Also add `__pycache__/` to `.gitignore` and untrack the committed `.pyc` files (`git rm -r --cached backend/services/__pycache__ backend/tests/__pycache__`).

---

## 5. The Gemini agent

### 5.1 How tool calling should work (vs. the current test)
The test script declares a `FunctionDeclaration` by hand, sends a message, executes **one** round of calls, and sends the result back. If Gemini then wants a second tool, for example "latest reading" followed by "percentile", that call is ignored.

**Use the SDK's automatic function calling instead.** In `google-genai`, if you pass plain Python functions (not `types.Tool` objects) in `GenerateContentConfig.tools`, the SDK will:
- build the function declarations from each function's **name, type hints, and docstring**,
- run the call loop for you, executing whichever function Gemini requests, sending results back, and repeating until Gemini produces a text answer or hits `maximum_remote_calls`,
- record what it called in `response.automatic_function_calling_history`.

This means the docstrings and type hints in `agent/tools.py` *are* the tool schema. Write them for the model to read.

### 5.2 `agent/tools.py` (new)
Thin wrappers around the services, one per capability. Each wrapper:
- uses **only simple types**: `str`, `int`, `float`, `bool`, `list[str]`. Use `""` or an int default instead of `None`/`Optional`, and don't use `date` objects, which the auto-schema handles poorly.
- has a docstring that says **what it does, when to use it, what each argument means, and the allowed values**. For example, "param_id: USGS parameter code, e.g. '00060' discharge (ft³/s), '00065' gage height (ft). Call list_gauges first to see which codes each gauge reports."
- wraps the service call in `try/except Exception` and returns `{"error": "<message>"}` on failure, so Gemini can recover by asking for a different gauge or param instead of the request crashing.
- returns a compact dict, always including `unit` and the timestamp.

Tools to write:
1. **`list_gauges()`** returns `gauge_registry.list_gauges()`. The model calls this to translate "Little Falls" or "the Potomac at Point of Rocks" into a gauge ID.
2. **`get_latest_reading(gauge_id: str, param_id: str)`** wraps `observations.get_latest_data`.
3. **`get_daily_means(gauge_id: str, param_id: str, start_date: str = "", end_date: str = "")`** wraps `observations.get_daily_mean`, converting `""` to `None`. If more than ~31 rows come back, return the first and last few rows plus min/max/mean instead of every row.
4. **`get_recent_trend(gauge_id: str, param_id: str, days: int = 2)`** calls `get_hourly_data` for one param, then `summarize_hourly`.
5. **`get_current_percentile(gauge_id: str, param_id: str)`** wraps `get_percentile.get_current_percentile`. This answers "is the river high or low for this time of year?"

At the bottom, define `AGENT_TOOLS = [list_gauges, get_latest_reading, get_daily_means, get_recent_trend, get_current_percentile]`.

Optionally, wrap each tool with a tiny decorator (or `logging` call) that logs name, args, and duration. This helps a lot when debugging what the model did.

### 5.3 `agent/prompts.py` (new)
One constant, `SYSTEM_INSTRUCTION`, telling the model:
- It's the Stream Watch assistant for nine USGS gauges in the Potomac/Rappahannock region (you can generate the list from `GAUGE_REGISTRY` at import time so it never drifts).
- **Always use tools for numbers. Never guess or remember river values.**
- If the user names a place, map it to a gauge (call `list_gauges` if unsure). If the place is ambiguous, ask.
- Always state units and the measurement time. Say when data is **provisional**.
- For "high/low/normal" questions, use `get_current_percentile` and quote its label.
- If a tool returns an error, explain it plainly and suggest an available parameter or gauge.
- It isn't a safety authority. For flooding or water-quality safety decisions, point to NWS and local officials.
- Keep answers short (2–5 sentences) unless the user asks for detail.

### 5.4 `agent/gemini_agent.py` (new)
Contents:
- **Lazy client.** Create a function that builds `genai.Client(api_key=config.GEMINI_API_KEY)` once and caches it (module global or `lru_cache`). Raise a clear `RuntimeError` if the key is missing.
- **Config builder.** Create a `GenerateContentConfig` with:
  - `system_instruction = SYSTEM_INSTRUCTION`
  - `tools = AGENT_TOOLS`
  - `automatic_function_calling = AutomaticFunctionCallingConfig(maximum_remote_calls = config.AGENT_MAX_TOOL_CALLS)`
  - a low `temperature` (for example 0.2–0.4) for factual answers
- **`run_agent(messages: list[dict]) -> dict`**:
  1. Convert incoming `[{role: "user"|"model", text}]` into a list of `types.Content(role=..., parts=[types.Part.from_text(text=...)])`.
  2. Call `client.models.generate_content(model=config.GEMINI_MODEL, contents=..., config=...)`.
  3. Pull `response.text` as the reply.
  4. Walk `response.automatic_function_calling_history` and collect each `function_call` part's `name` and `args` into a `tool_calls` list. The frontend can show "Checked Little Falls discharge…" and later use it to render widgets.
  5. Return `{"reply": ..., "tool_calls": [...]}`.
  6. Handle `response.text` being empty (blocked or max calls reached) with a fallback message.
- **Stateless conversation.** Don't keep a `client.chats` object per user on the server. The frontend sends the whole visible history on each request (user and model text turns only). This survives server restarts and multiple workers, and tool results are re-fetched fresh each time, which is what you want for live gauges. Cap the history (for example the last 20 turns) to control cost.
- **Sync is fine.** The services use `requests` (blocking), so call the sync `client.models.generate_content` and declare the FastAPI endpoint with plain `def`. FastAPI runs it in a threadpool. Switch to `client.aio` and `httpx` only if you need high concurrency later.

---

## 6. HTTP layer

### 6.1 `schemas/api.py` (new)
Pydantic models:
- `ChatMessage`: `role` (literal "user" or "model"), `text` (str, max length about 2,000)
- `ChatRequest`: `messages: list[ChatMessage]` (min 1, max about 20, last one must be "user")
- `ToolCall`: `name: str`, `args: dict`
- `ChatResponse`: `reply: str`, `tool_calls: list[ToolCall]`
- Optional response models for the data endpoints (`LatestReading`, `DailyMean`, `PercentileResult`) for nice OpenAPI docs.

### 6.2 `routers/methods.py` → data endpoints
Replace the `/test` endpoint (or keep it as a health check) with a router prefixed `/gauges`:
- `GET /gauges` → `list_gauges()`
- `GET /gauges/{gauge_id}/latest?param_id=00060` → `get_latest_data`
- `GET /gauges/{gauge_id}/daily-mean?param_id=&start_date=&end_date=` → `get_daily_mean`
- `GET /gauges/{gauge_id}/hourly?param_ids=00060,00010&days=7` → `get_hourly_data` (full data for charts)
- `GET /gauges/{gauge_id}/percentile?param_id=00060` → `get_current_percentile`

Error mapping in each endpoint (or one shared exception handler in `main.py`): `ValueError` → 400, `LookupError` → 404, `requests.RequestException` → 502 ("USGS unavailable").

These are the same functions the agent uses. The dashboard widgets call the REST endpoints directly and the agent calls them through tools, so there's one implementation for both.

### 6.3 `routers/agent.py` (new)
- `APIRouter(prefix="/agent")`
- `POST /agent/chat`, body `ChatRequest`, response `ChatResponse`, declared with plain `def`.
- Calls `run_agent` with the messages converted to dicts.
- Catches the SDK's API errors (bad key, quota or rate limit exceeded) → 503 with a friendly message. Catches the missing-key `RuntimeError` → 500.
- Add a per-IP rate limit here (for example `slowapi`, 10–20/hour as in ARCHITECTURE.md Tier 1). This endpoint is the one that costs money.

### 6.4 `app/main.py` (update)
- Import and include both routers (`methods`/`gauges` and `agent`).
- Add `CORSMiddleware` allowing `config.FRONTEND_ORIGIN`, so the Next.js app on :3000 can call the API on :8000.
- Optionally register the shared exception handlers from §6.2 here.
- Optionally add `GET /health`.

---

## 7. Frontend hookup (minimal)
In `frontend/`:
- Add `NEXT_PUBLIC_API_URL=http://localhost:8000` to `frontend/.env.local`.
- Create a client component (for example `app/components/AgentChat.tsx`) that keeps `messages` in state and POSTs `{messages}` to `${API_URL}/agent/chat` on submit. It appends `{role:"model", text: reply}` and optionally shows `tool_calls` as small "used: get_current_percentile(01646500, 00060)" chips.
- **Never put the Gemini key in the frontend.** All Gemini calls go through FastAPI.

---

## 8. Run and verify, step by step

1. In `backend/`, activate the venv and `pip install -r requirements.txt`.
2. Put `GEMINI_API_KEY` and `GEMINI_MODEL` in `backend/.env`.
3. Run `python -m unittest discover -s tests/unit_tests -p "*test*.py"` from `backend/`. The unit tests (percentile, observations, tools) should pass offline.
4. Run the scripts in `tests/smoke_tests/` (for example `python -m tests.smoke_tests.get_discharge`) to confirm the services still work against real USGS data.
5. Run `uvicorn app.main:app --reload` from `backend/` and open `http://localhost:8000/docs`.
6. Try the data endpoints in `/docs` first, for example `GET /gauges/01646500/latest?param_id=00060`.
7. Try `POST /agent/chat` with these questions, and check `tool_calls` in each response:
   - "What's the discharge at Little Falls right now?" → expect `list_gauges` (maybe) and `get_latest_reading`
   - "Is the Potomac at Point of Rocks high for this time of year?" → expect `get_current_percentile`
   - "Has Seneca Creek been rising over the last two days?" → expect `get_recent_trend`
   - "What's the water temperature in Goose Creek?" → expect a polite "not reported, only discharge and gage height", based on the registry error
   - "Compare discharge at all three Potomac gauges" → expect several tool calls in one turn, which proves the multi-call loop works
8. If the model guesses numbers without calling tools, tighten `SYSTEM_INSTRUCTION` and improve the tool docstrings. If it picks wrong params, make the docstrings list the codes explicitly.

---

## 9. Other issues found during the review (fix while you're in there)

- **`requirements.txt` and `README.md` are UTF-16 encoded.** That's typical of `pip freeze > requirements.txt` in Windows PowerShell 5.1. Pip can read it, but many tools and diffs can't. Re-save both as UTF-8 (in VS Code, click the encoding in the status bar → "Save with Encoding" → UTF-8). In the future, run `pip freeze | Out-File -Encoding utf8 requirements.txt`.
- **`sql_migration_files/create_sites.sql`** has a trailing comma after `drainage_area_sqmi double precision,`, which is a syntax error. It also uses `site_name` and drops `active`/the `agency_cd` default, while ARCHITECTURE.md uses `name`. Pick one.
- **`sql_migration_files/create_user_profiles.sql`**: the update policy is missing its terminating semicolon. **Security:** the comment says only `name` should be updatable, but the policy lets a user update *any* column, including `role`. A user could make themselves `admin`. Restrict this with a column-level grant (revoke update on the table, then grant update only on `name`) or a `with check` that keeps `role` unchanged.
- **Percentile vs. instantaneous values.** See the caveat in §3.4.
- **`get_reference_table`** returns the first row matching month/day. Sites with several sensors for one parameter can return several rows per day (different `ts_id`). That's fine for now, but consider choosing the row with the largest `count_nu`.
- **Gemini free tier:** check Google's current terms. Free-tier prompts may be used to improve Google's products, and rate limits are low. Use a paid key before real users send questions.

---

## 10. Later: letting the agent customize dashboards
The README says the agent should help users build dashboards. Once the data tools work, add **UI action tools** such as `add_widget(widget_type, gauge_id, param_id, days)` and `remove_widget(widget_id)`. Their Python implementation only validates the arguments and returns `{"action": "add_widget", ...}`. Don't change any state on the server. `run_agent` already returns `tool_calls`, so the frontend reads those actions and updates the layout itself. List the allowed widget types in the docstring so Gemini uses only the components you have.
