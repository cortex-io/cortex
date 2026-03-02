"""Home menu handler."""
from src.state import UserState


def get_home_menu() -> str:
    """Return the home menu."""
    return """Welcome to Infrastructure Monitor!

1) Network  2) Proxmox  3) K8s  4) Security  5) Ask Cortex

? for help"""


def handle_home_input(state: UserState, message: str) -> str:
    """Handle input from home menu."""
    message = message.strip().lower()

    if message in ["1", "network", "net", "n"]:
        state.menu_context = "network"
        return None  # Will trigger network menu

    elif message in ["2", "proxmox", "pve", "p"]:
        state.menu_context = "proxmox"
        return None  # Will trigger proxmox menu

    elif message in ["3", "k8s", "kubernetes", "k"]:
        state.menu_context = "k8s"
        return None  # Will trigger k8s menu

    elif message in ["4", "security", "sec", "s"]:
        state.menu_context = "security"
        return None  # Will trigger security menu

    elif message in ["5", "cortex", "ai", "c"]:
        state.menu_context = "claude"  # Keep internal variable name for compatibility
        state.claude_mode = True
        return "Cortex mode. Ask anything about your infra.\n'home' to exit."

    elif message in ["?", "help"]:
        return get_help_text()

    else:
        return "Invalid option. Reply 1-5 or ? for help."


def get_help_text() -> str:
    """Return help text."""
    return """Commands:
1-5: Select menu
home/h/menu: Return to main menu
?: Help

Each menu has sub-options (D)etails, etc."""
