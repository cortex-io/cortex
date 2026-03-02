"""Security menu handler."""
from src.state import UserState
from src.integrations.security import security_client
from src.formatters import (
    format_security_summary,
    format_security_alerts,
    format_security_logs
)


async def handle_security_menu(state: UserState, message: str) -> str:
    """Handle security menu navigation."""
    message = message.strip().lower()

    # Initial entry - show summary
    if message == "" or state.submenu is None:
        data = await security_client.get_summary()
        state.submenu = "summary"
        return format_security_summary(data)

    # Alerts submenu
    if message in ["a", "alerts", "alert"]:
        alerts = await security_client.get_alerts()
        state.submenu = "alerts"
        return format_security_alerts(alerts)

    # Logs submenu
    elif message in ["l", "logs", "log"]:
        logs = await security_client.get_logs()
        state.submenu = "logs"
        return format_security_logs(logs)

    # Firewall submenu
    elif message in ["f", "firewall", "fw"]:
        fw_status = await security_client.get_firewall_status()
        state.submenu = "firewall"

        status = fw_status.get("status", "unknown")
        rules = fw_status.get("rules", 0)
        return f"Firewall: {status}\n{rules} active rules"

    else:
        return "Unknown option. Try: A)lerts, L)ogs, F)irewall"
