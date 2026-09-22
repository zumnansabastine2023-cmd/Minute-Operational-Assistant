import asyncio
import os
from pathlib import Path
from urllib.parse import urlencode

from dotenv import load_dotenv
from websockets.asyncio.client import connect
from websockets.exceptions import WebSocketException


ENV_FILE = Path(__file__).with_name(".env")
DEEPGRAM_STREAMING_URL = "wss://api.deepgram.com/v1/listen"


def safe_error_message(error: Exception, api_key: str) -> str:
    """Return an error message without ever revealing the API key."""
    return str(error).replace(api_key, "[redacted]")


async def test_connection() -> None:
    load_dotenv(dotenv_path=ENV_FILE)
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        print("Deepgram connection failed: DEEPGRAM_API_KEY is not configured.")
        return

    query = urlencode(
        {
            "model": "nova-3",
            "language": "en-US",
            "smart_format": "true",
            "interim_results": "true",
        }
    )
    url = f"{DEEPGRAM_STREAMING_URL}?{query}"

    try:
        async with connect(
            url,
            additional_headers={"Authorization": f"Token {api_key}"},
            open_timeout=10,
            close_timeout=5,
        ):
            print("Deepgram connection succeeded.")
    except (OSError, TimeoutError, WebSocketException) as error:
        print(f"Deepgram connection failed: {safe_error_message(error, api_key)}")


if __name__ == "__main__":
    asyncio.run(test_connection())
