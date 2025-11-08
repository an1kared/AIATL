import os
from dotenv import load_dotenv
from google.adk.agents import Agent
from google.adk.tools import FunctionTool, AgentTool
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from pydantic_core.core_schema import decimal_schema
from manager_agent.schemas import RecipeOutput, SousChefInput, InitialInput

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
    # In a real app, this would be an async function interacting with the user/API.
    # For ADK testing, it just returns confirmation.
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

root_agent = Agent(
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


# --- 4. Running the System Locally (ADK Runner) ---

if __name__ == '__main__':
    print("--- Running the Culinary Manager Agent (Local Test) ---")
    session_service = InMemorySessionService()
    # 1. Instantiate the Runner with your Orchestrator Agent
    #runner = Runner(agent=manager_agent)
    runner = Runner(app_name="CulinaryManager",agent=manager_agent, session_service=session_service)
    # 2. Define the test query
    test_query = "I have chicken, bell peppers, soy sauce, and a tub of yogurt. I need a quick dinner recipe."

    # 3. Run the workflow
    response = runner.run(new_message=test_query, user_id="test_user", session_id="test_session")
    
    # 4. Print the final response text
    print("\n--- Final Manager Agent Response ---") 
    full_response_text = ""
    for chunk in response:
        # Loop over the streaming chunks 
        # ADK chunks may be strings or objects with a 'text' attribute 
        text_to_print = chunk.text if hasattr(chunk, 'text') else str(chunk) 
        # Print in real-time (without a newline) 
        print(text_to_print, end="")
        # Accumulate the text for a final variable, if needed 
        full_response_text += text_to_print 
    print("\n----------------------------------") 

