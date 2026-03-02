"""Proxmox menu handler."""
from src.state import UserState
from src.integrations.proxmox import proxmox_client
from src.formatters import (
    format_proxmox_summary,
    format_proxmox_details,
    format_proxmox_vms
)


async def handle_proxmox_menu(state: UserState, message: str) -> str:
    """Handle Proxmox menu navigation."""
    message = message.strip().lower()

    # Initial entry - show summary
    if message == "" or state.submenu is None:
        data = await proxmox_client.get_summary()
        state.submenu = "summary"
        return format_proxmox_summary(data)

    # Details submenu
    if message in ["d", "details", "detail"]:
        data = await proxmox_client.get_details()
        state.submenu = "details"
        return format_proxmox_details(data)

    # VMs submenu
    elif message in ["v", "vms", "vm"]:
        vms = await proxmox_client.get_vms()
        state.submenu = "vms"
        return format_proxmox_vms(vms)

    # Nodes submenu
    elif message in ["n", "nodes", "node"]:
        nodes = await proxmox_client.get_nodes()
        state.submenu = "nodes"

        if not nodes:
            return "No nodes found."

        msg = f"{len(nodes)} node(s):\n"
        for node in nodes[:3]:
            name = node.get("name", "Unknown")
            status = node.get("status", "unknown")
            msg += f"• {name}: {status}\n"
        return msg.rstrip()

    else:
        return "Unknown option. Try: D)etails, V)Ms, N)odes"
