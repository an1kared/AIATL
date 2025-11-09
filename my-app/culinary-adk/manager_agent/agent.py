import os
from dotenv import load_dotenv
from google.adk.agents import Agent
#import google.auth
from google.adk.tools import FunctionTool, AgentTool
from vertexai.preview.reasoning_engines import AdkApp
from manager_agent.schemas import RecipeOutput, SousChefInput, InitialInput # Assuming these imports are correct

# Load environment variables (like GOOGLE_API_KEY)
load_dotenv()

# --- 1. Define the Sous Chef Function/Tool ---
# This simulates the live guide. The Manager calls this for every step.

def sous_chef_guide(step_instruction: str, step_duration: int) -> str:
    """
    Guides the user through a single cooking step, answering live questions.
    Returns a confirmation signal that the step is complete.
    """
    print(f"\n[Sous Chef Agent: LIVE GUIDE]")
    print(f"Instruction: {step_instruction} (Approx. {step_duration} mins)")
    # For ADK testing, it returns confirmation.
    return "SUCCESS: User confirmed completion of this cooking step."

# Convert the function into a tool the Manager can use
sous_chef_tool = FunctionTool(sous_chef_guide)


# --- 2. Define the Recipe Agent (Specialist) ---
# This agent's only job is to create the structured recipe.
recipe_creator_agent = Agent(
    name="RecipeCreator",
    model="gemini-2.5-pro", # Use Pro for creative quality
    instruction=(
        "You are an expert culinary agent who generates new, healthy recipes. "
        "Your output MUST strictly follow the provided RecipeOutput schema."
    ),
    # The output schema forces the model to return structured data
    output_schema=RecipeOutput
)

# Wrap the Recipe Agent so the Manager can call it
recipe_tool = AgentTool(recipe_creator_agent)


# --- 3. Define the Manager Agent (The Orchestrator) ---
# CRITICAL FIX: Defined at the top level for Uvicorn access!

manager_agent = Agent(
    name="MealManager",
    model="gemini-2.5-flash", # Use Flash for fast routing and reasoning
    instruction=(
        "You are the Meal Manager Agent. Your goal is to guide the user through a meal creation process. "
        "1. Identify key ingredients from the user's input. "
        "2. Call the 'create_new_recipe' tool to generate the recipe. "
        "3. **CRITICALLY:** Iterate over the `instructions` list in the generated recipe. For each step, call the 'sous_chef_guide' tool sequentially to simulate the user performing the step. "
        "4. After all steps are complete, provide the final closing message to the user."
    ),
    tools=[recipe_tool, sous_chef_tool] # The Manager's team
)

app = AdkApp(
    agent=manager_agent, 
)