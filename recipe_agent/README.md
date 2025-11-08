Recipe Chef Agent (Google ADK)
==============================

This Python agent follows the Google ADK quickstart and creates multiple recipes from a list of ingredients, then sorts them by nutritional score (highest first).

Reference: Google ADK Quickstart (Python)
See: https://google.github.io/adk-docs/get-started/quickstart/#agentpy

Folder
- `recipe_agent/agent.py`: Defines the agent and a sorting tool.
- `recipe_agent/__init__.py`: Package init.

Prereqs
- Python 3.9+
- pip

Setup (recommended: virtual env)
```bash
cd /Users/vaidehigupta/Desktop/GitHub/AIATL
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
pip install --upgrade pip
pip install google-adk
```

Authentication (Google AI Studio key)
- If using Google AI Studio (not Vertex AI):
  - Create/copy your API key.
  - Export in your shell before running, or put into a `.env` file alongside the agent when using ADK:
```bash
export GOOGLE_GENAI_USE_VERTEXAI=FALSE
export GOOGLE_API_KEY=YOUR_REAL_KEY
```

Authentication (Vertex AI Express or Vertex AI)
- For Vertex AI:
```bash
export GOOGLE_GENAI_USE_VERTEXAI=TRUE
export GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
export GOOGLE_CLOUD_LOCATION=us-central1  # or your region
gcloud auth application-default login
```
- For Vertex AI Express Mode:
```bash
export GOOGLE_GENAI_USE_VERTEXAI=TRUE
export GOOGLE_API_KEY=YOUR_EXPRESS_MODE_KEY
```

Run (terminal chat)
From the repository root:
```bash
adk run recipe_agent
```
Then type a prompt, e.g.:
```
Given ingredients: eggs, spinach, salmon. Create multiple recipes and sort by nutrition.
```

Run (Dev UI)
```bash
adk web
```
Open the provided URL, select `recipe_agent`, and chat.

Notes
- The agent uses model `gemini-1.5-flash-latest`. Change in `recipe_agent/agent.py` if needed.
- The tool `sort_recipes_by_nutrition` ensures the final list is sorted by `nutrition.score` descending.


