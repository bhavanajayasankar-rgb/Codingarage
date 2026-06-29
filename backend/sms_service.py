import os
import logging
from twilio.rest import Client

logger = logging.getLogger(__name__)

TWILIO_ACCOUNT_SID = (os.environ.get("TWILIO_ACCOUNT_SID") or "").strip()
TWILIO_AUTH_TOKEN = (os.environ.get("TWILIO_AUTH_TOKEN") or "").strip()
TWILIO_PHONE_NUMBER = (os.environ.get("TWILIO_PHONE_NUMBER") or "").strip()
USER_PHONE_NUMBER = (os.environ.get("USER_PHONE_NUMBER") or "").strip()


def send_budget_alert(current_cost: float, budget: float):
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, USER_PHONE_NUMBER]):
        logger.warning(
            "Twilio credentials not fully configured. "
            "SID=%s Token=%s From=%s To=%s",
            bool(TWILIO_ACCOUNT_SID), bool(TWILIO_AUTH_TOKEN),
            TWILIO_PHONE_NUMBER, USER_PHONE_NUMBER
        )
        return

    difference = current_cost - budget
    message_body = (
        f"\u26a0\ufe0f Azure Budget Alert\n\n"
        f"Your Azure cloud spending has exceeded the configured budget.\n\n"
        f"Budget: \u20b9{budget:,.2f}\n"
        f"Current Cost: \u20b9{current_cost:,.2f}\n"
        f"Exceeded By: \u20b9{difference:,.2f}\n\n"
        f"Please review your Azure resources to avoid additional charges.\n\n"
        f"- FinOps Dashboard"
    )

    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        message = client.messages.create(
            body=message_body,
            from_=TWILIO_PHONE_NUMBER,
            to=USER_PHONE_NUMBER
        )
        logger.info("Budget alert SMS sent (SID: %s)", message.sid)
    except Exception as e:
        logger.error("Failed to send budget alert SMS: %s", e)
