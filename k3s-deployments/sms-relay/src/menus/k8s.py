"""Kubernetes menu handler."""
from src.state import UserState
from src.integrations.k8s import k8s_client
from src.formatters import (
    format_k8s_summary,
    format_k8s_details,
    format_k8s_pods
)


async def handle_k8s_menu(state: UserState, message: str) -> str:
    """Handle K8s menu navigation."""
    message = message.strip().lower()

    # Initial entry - show summary
    if message == "" or state.submenu is None:
        data = await k8s_client.get_summary()
        state.submenu = "summary"
        return format_k8s_summary(data)

    # Details submenu
    if message in ["d", "details", "detail"]:
        data = await k8s_client.get_details()
        state.submenu = "details"
        return format_k8s_details(data)

    # Pods submenu
    elif message in ["p", "pods", "pod"]:
        pods = await k8s_client.get_pods()
        state.submenu = "pods"
        return format_k8s_pods(pods)

    # Services submenu
    elif message in ["s", "services", "service", "svc"]:
        services = await k8s_client.get_services()
        state.submenu = "services"

        if not services:
            return "No services found."

        msg = f"{len(services)} service(s):\n"
        for svc in services[:8]:
            name = svc.get("name", "Unknown")
            svc_type = svc.get("type", "unknown")
            msg += f"• {name}: {svc_type}\n"
        return msg.rstrip()

    else:
        return "Unknown option. Try: D)etails, P)ods, S)ervices"
