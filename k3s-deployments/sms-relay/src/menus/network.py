"""Network menu handler."""
from src.state import UserState
from src.integrations.unifi import unifi_client
from src.formatters import (
    format_network_summary,
    format_network_details,
    format_network_alerts,
    format_network_clients
)


async def handle_network_menu(state: UserState, message: str) -> str:
    """Handle network menu navigation."""
    message = message.strip().lower()

    # Initial entry - show summary
    if message == "" or state.submenu is None:
        data = await unifi_client.get_summary()
        state.submenu = "summary"
        return format_network_summary(data)

    # Details submenu
    if message in ["d", "details", "detail"]:
        data = await unifi_client.get_details()
        state.submenu = "details"
        return format_network_details(data)

    # Alerts submenu
    elif message in ["a", "alerts", "alert"]:
        alerts = await unifi_client.get_alerts()
        state.submenu = "alerts"
        return format_network_alerts(alerts)

    # Clients submenu
    elif message in ["c", "clients", "client"]:
        clients = await unifi_client.get_clients()
        state.submenu = "clients"
        return format_network_clients(clients)

    else:
        return "Unknown option. Try: D)etails, A)lerts, C)lients"
