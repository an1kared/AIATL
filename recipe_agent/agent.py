import typing as t
import os
from google.adk.agents import Agent


def sort_recipes_by_nutrition(recipes: t.List[dict]) -> dict:
    """Sort a list of recipe dicts by nutrition.score descending.

    Args:
        recipes: list of recipe dicts; each should include
                 recipe["nutrition"]["score"] as a number 0..100.
    Returns:
        {"status": "success", "recipes": [...sorted...]} or {"status": "error", "error_message": "..."}
    """
    try:
        if not isinstance(recipes, list):
            return {"status": "error", "error_message": "Expected a list of recipes"}

        def get_score(r: dict) -> float:
            try:
                return float(r.get("nutrition", {}).get("score", 0))
            except Exception:
                return 0.0

        sorted_list = sorted(recipes, key=get_score, reverse=True)
        return {"status": "success", "recipes": sorted_list}
    except Exception as exc:
        return {"status": "error", "error_message": str(exc)}


# Allow overriding the model via env var if needed. Default to a widely supported ID.
_MODEL = os.environ.get("RECIPE_AGENT_MODEL", "gemini-1.5-flash-8b")

root_agent = Agent(
    name="recipe_chef_agent",
    model=_MODEL,
    tools=[sort_recipes_by_nutrition],
)


