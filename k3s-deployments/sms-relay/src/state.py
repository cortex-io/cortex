"""State management for SMS conversation flow."""
from typing import Dict, Optional
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class UserState:
    """Represents the state of a user's SMS conversation."""

    phone_number: str
    menu_context: str = "home"  # home, network, proxmox, k8s, security, claude
    submenu: Optional[str] = None
    pending_action: Optional[Dict] = None
    claude_mode: bool = False
    last_activity: datetime = field(default_factory=datetime.now)

    def reset_to_home(self):
        """Reset state to home menu."""
        self.menu_context = "home"
        self.submenu = None
        self.pending_action = None
        self.claude_mode = False
        self.last_activity = datetime.now()

    def update_activity(self):
        """Update last activity timestamp."""
        self.last_activity = datetime.now()


class StateManager:
    """Manages user conversation states."""

    def __init__(self):
        self._states: Dict[str, UserState] = {}

    def get_state(self, phone_number: str) -> UserState:
        """Get or create state for a phone number."""
        if phone_number not in self._states:
            self._states[phone_number] = UserState(phone_number=phone_number)

        state = self._states[phone_number]
        state.update_activity()
        return state

    def reset_state(self, phone_number: str):
        """Reset user state to home."""
        if phone_number in self._states:
            self._states[phone_number].reset_to_home()

    def clear_old_states(self, max_age_minutes: int = 60):
        """Clear states older than max_age_minutes."""
        now = datetime.now()
        to_remove = [
            phone for phone, state in self._states.items()
            if (now - state.last_activity).total_seconds() > max_age_minutes * 60
        ]
        for phone in to_remove:
            del self._states[phone]


# Global state manager instance
state_manager = StateManager()
