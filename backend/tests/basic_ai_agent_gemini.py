import os
from pathlib import Path

from google import genai
from google.genai import types


from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent / ".env.test")

# -----------------------------------------
# Config
# -----------------------------------------

GEMINI_API_CREDENTIALS = os.getenv("GEMINI_API_CREDENTIALS")

if not GEMINI_API_CREDENTIALS:
    raise ValueError("GEMINI_API_CREDENTIALS is not set in the environment variables.")


MODEL = "gemini-3.8-flash"

client = genai.Client(api_key=GEMINI_API_CREDENTIALS)



# -----------------------------------------
# Tools
# -----------------------------------------

def add_numbers(a: int, b: int):
    return a + b


# Tell Gemini about the tool
add_tool = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="add_numbers",
            description="Adds two numbers together.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "a": types.Schema(
                        type="INTEGER",
                        description="The first number"
                    ),
                    "b": types.Schema(
                        type="INTEGER",
                        description="The second number"
                    ),
                },
                required=["a", "b"],
            ),
        )
    ]
)

# -----------------------------------------
# Agent
# -----------------------------------------

chat = client.chats.create(
    model=MODEL,
    config=types.GenerateContentConfig(
        tools=[add_tool]
    )
)


# -----------------------------------------
# Loop
# -----------------------------------------

while True:

    user = input("\nYou: ")

    if user.lower() == "exit":
        break

    response = chat.send_message(user)

    # Gemini wants to use a tool
    if response.function_calls:

        for call in response.function_calls:

            if call.name == "add_numbers":

                result = add_numbers(
                    call.args["a"],
                    call.args["b"]
                )

                print(
                    f"[Tool] add_numbers("
                    f"{call.args['a']}, {call.args['b']})"
                )

                # Give result back to Gemini
                response = chat.send_message(
                    types.Part.from_function_response(
                        name=call.name,
                        response={
                            "result": result
                        }
                    )
                )

    print("Agent:", response.text)

