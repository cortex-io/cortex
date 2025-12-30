"""Twilio SMS helper functions."""
from twilio.rest import Client
from src.config import settings


class SMSClient:
    """Wrapper for Twilio SMS operations."""

    def __init__(self):
        self.client = Client(
            settings.twilio_account_sid,
            settings.twilio_auth_token
        )
        self.from_number = settings.twilio_phone_number

    def send_message(self, to_number: str, body: str) -> bool:
        """Send an SMS message."""
        try:
            message = self.client.messages.create(
                body=body,
                from_=self.from_number,
                to=to_number
            )
            return message.sid is not None
        except Exception as e:
            print(f"Error sending SMS: {e}")
            return False


# Global SMS client instance
sms_client = SMSClient()
