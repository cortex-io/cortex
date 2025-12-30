"""Main FastAPI application for SMS relay webhook."""
from fastapi import FastAPI, Request, Response
from fastapi.responses import PlainTextResponse
from contextlib import asynccontextmanager

from src.config import settings
from src.state import state_manager
from src.menus.home import get_home_menu, handle_home_input
from src.menus.network import handle_network_menu
from src.menus.proxmox import handle_proxmox_menu
from src.menus.k8s import handle_k8s_menu
from src.menus.security import handle_security_menu
from src.integrations.cortex import cortex_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    print("SMS Relay service starting...")
    yield
    print("SMS Relay service shutting down...")


app = FastAPI(
    title="SMS Infrastructure Relay",
    description="SMS-based infrastructure monitoring via Twilio",
    version="1.0.0",
    lifespan=lifespan
)


async def process_message(from_number: str, body: str) -> str:
    """Process incoming SMS message and return response."""
    state = state_manager.get_state(from_number)
    message = body.strip()

    # Global commands
    if message.lower() in ["home", "h", "menu", "m"]:
        state.reset_to_home()
        return get_home_menu()

    if message.lower() in ["?", "help"]:
        return """Commands:
home/h/menu: Main menu
?: Help
1-5: Menu options

In menus, use letter shortcuts like D for Details."""

    # Cortex mode (AI queries)
    if state.claude_mode:
        if message.lower() in ["home", "h", "menu", "exit", "quit"]:
            state.reset_to_home()
            return get_home_menu()

        response = await cortex_client.query(message)
        return response

    # Home menu
    if state.menu_context == "home":
        response = handle_home_input(state, message)
        if response:
            return response
        # Fall through to new menu context

    # Route to appropriate menu handler
    try:
        if state.menu_context == "network":
            return await handle_network_menu(state, message)

        elif state.menu_context == "proxmox":
            return await handle_proxmox_menu(state, message)

        elif state.menu_context == "k8s":
            return await handle_k8s_menu(state, message)

        elif state.menu_context == "security":
            return await handle_security_menu(state, message)

        elif state.menu_context == "claude":
            # Cortex mode already handled above
            return "Cortex mode. Ask anything about your infra."

        else:
            # Default to home
            state.reset_to_home()
            return get_home_menu()

    except Exception as e:
        print(f"Error processing message: {e}")
        return f"Error: {str(e)[:50]}. Reply 'home' for menu."


@app.post("/sms")
async def handle_sms(request: Request):
    """Handle incoming SMS webhook from Twilio."""
    try:
        form = await request.form()
        from_number = form.get("From", "")
        body = form.get("Body", "")

        print(f"SMS from {from_number}: {body}")

        # Validate sender
        if from_number != settings.allowed_phone_number:
            print(f"Unauthorized number: {from_number}")
            # Return empty response for unauthorized numbers
            twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>"""
            return Response(content=twiml, media_type="text/xml")

        # Process message
        response_text = await process_message(from_number, body)

        # Build TwiML response
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>{response_text}</Message>
</Response>"""

        return Response(content=twiml, media_type="text/xml")

    except Exception as e:
        print(f"Error handling SMS: {e}")
        # Return error TwiML
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>Error processing request. Please try again.</Message>
</Response>"""
        return Response(content=twiml, media_type="text/xml")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "sms-relay"}


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "SMS Infrastructure Relay",
        "version": "1.0.0",
        "endpoints": {
            "webhook": "/sms",
            "health": "/health"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True
    )
