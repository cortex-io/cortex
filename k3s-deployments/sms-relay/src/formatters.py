"""Formatters for terse SMS output."""
from typing import Dict, Any


def format_network_summary(data: Dict[str, Any]) -> str:
    """Format network status to ~300 chars."""
    status = "OK" if data.get("healthy", True) else "ALERT"
    devices = data.get("device_count", 0)
    aps = data.get("ap_count", 0)
    alerts = data.get("alert_count", 0)

    msg = f"Network {status}. {devices} devices, {aps} APs, {alerts} alerts.\n"
    msg += "D)etails  A)lerts  C)lients"
    return msg


def format_network_details(data: Dict[str, Any]) -> str:
    """Format detailed network info."""
    uptime = data.get("uptime", "N/A")
    bandwidth = data.get("bandwidth", {})

    msg = f"Uptime: {uptime}\n"
    msg += f"WAN: {bandwidth.get('wan_rx', 0)}↓ {bandwidth.get('wan_tx', 0)}↑\n"
    msg += f"LAN: {bandwidth.get('lan_rx', 0)}↓ {bandwidth.get('lan_tx', 0)}↑"
    return msg


def format_network_alerts(alerts: list) -> str:
    """Format network alerts."""
    if not alerts:
        return "No alerts."

    msg = f"{len(alerts)} alert(s):\n"
    for alert in alerts[:3]:  # Show max 3
        msg += f"• {alert.get('message', 'Unknown')}\n"
    return msg.rstrip()


def format_network_clients(clients: list) -> str:
    """Format top clients."""
    if not clients:
        return "No clients."

    msg = f"{len(clients)} client(s):\n"
    for client in clients[:5]:  # Show max 5
        name = client.get('hostname', client.get('mac', 'Unknown'))
        msg += f"• {name}\n"
    return msg.rstrip()


def format_proxmox_summary(data: Dict[str, Any]) -> str:
    """Format Proxmox status to ~300 chars."""
    status = "OK" if data.get("healthy", True) else "ALERT"
    nodes = data.get("node_count", 0)
    vms = data.get("vm_count", 0)
    lxc = data.get("lxc_count", 0)
    cpu = data.get("cpu_usage", 0)
    ram = data.get("ram_usage", 0)
    storage = data.get("storage_usage", 0)

    msg = f"Proxmox {status}. {nodes} nodes, {vms} VMs, {lxc} LXC.\n"
    msg += f"CPU: {cpu}%  RAM: {ram}%  Storage: {storage}%\n"
    msg += "D)etails  V)Ms  N)odes"
    return msg


def format_proxmox_details(data: Dict[str, Any]) -> str:
    """Format detailed Proxmox info."""
    nodes = data.get("nodes", [])

    msg = ""
    for node in nodes[:3]:  # Max 3 nodes
        name = node.get("name", "Unknown")
        status = node.get("status", "unknown")
        cpu = node.get("cpu", 0)
        ram = node.get("ram", 0)
        msg += f"{name}: {status} CPU:{cpu}% RAM:{ram}%\n"
    return msg.rstrip()


def format_proxmox_vms(vms: list) -> str:
    """Format VM list."""
    if not vms:
        return "No VMs."

    running = [vm for vm in vms if vm.get("status") == "running"]
    stopped = [vm for vm in vms if vm.get("status") == "stopped"]

    msg = f"{len(running)} running, {len(stopped)} stopped\n"
    for vm in running[:5]:  # Show max 5 running
        msg += f"• {vm.get('name', 'Unknown')}\n"
    return msg.rstrip()


def format_k8s_summary(data: Dict[str, Any]) -> str:
    """Format K8s status to ~300 chars."""
    status = "OK" if data.get("healthy", True) else "ALERT"
    pods = data.get("pod_count", 0)
    pending = data.get("pending_count", 0)
    failed = data.get("failed_count", 0)

    msg = f"K8s {status}. {pods} pods, {pending} pending, {failed} failed.\n"
    msg += "D)etails  P)ods  S)ervices"
    return msg


def format_k8s_details(data: Dict[str, Any]) -> str:
    """Format detailed K8s info."""
    namespaces = data.get("namespaces", [])

    msg = f"{len(namespaces)} namespace(s):\n"
    for ns in namespaces[:5]:  # Max 5
        name = ns.get("name", "Unknown")
        pod_count = ns.get("pod_count", 0)
        msg += f"• {name}: {pod_count} pods\n"
    return msg.rstrip()


def format_k8s_pods(pods: list) -> str:
    """Format pod list."""
    if not pods:
        return "No pods."

    msg = ""
    for pod in pods[:8]:  # Show max 8
        name = pod.get("name", "Unknown")
        status = pod.get("status", "unknown")
        msg += f"• {name}: {status}\n"
    return msg.rstrip()


def format_security_summary(data: Dict[str, Any]) -> str:
    """Format security status to ~300 chars."""
    status = "OK" if data.get("healthy", True) else "ALERT"
    critical = data.get("critical_count", 0)
    warnings = data.get("warning_count", 0)

    msg = f"Security {status}. {critical} critical, {warnings} warnings.\n"
    msg += "A)lerts  L)ogs  F)irewall"
    return msg


def format_security_alerts(alerts: list) -> str:
    """Format security alerts."""
    if not alerts:
        return "No alerts."

    msg = f"{len(alerts)} alert(s):\n"
    for alert in alerts[:3]:  # Show max 3
        severity = alert.get("severity", "info")
        message = alert.get("message", "Unknown")
        msg += f"• [{severity}] {message}\n"
    return msg.rstrip()


def format_security_logs(logs: list) -> str:
    """Format recent security logs."""
    if not logs:
        return "No recent logs."

    msg = f"{len(logs)} log(s):\n"
    for log in logs[:5]:  # Show max 5
        msg += f"• {log.get('message', 'Unknown')}\n"
    return msg.rstrip()


def truncate_message(msg: str, max_length: int = 320) -> str:
    """Truncate message to max SMS length."""
    if len(msg) <= max_length:
        return msg
    return msg[:max_length - 3] + "..."
