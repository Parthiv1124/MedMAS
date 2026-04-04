# backend/services/notifications.py
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta
import os

# Twilio client — lazy init to avoid crash when credentials are placeholders
_twilio_client = None
TWILIO_FROM = os.getenv("TWILIO_FROM_NUMBER")

def _get_twilio():
    global _twilio_client
    if _twilio_client is None:
        sid = os.getenv("TWILIO_ACCOUNT_SID")
        token = os.getenv("TWILIO_AUTH_TOKEN")
        if sid and token and not sid.startswith("AC..."):
            from twilio.rest import Client as TwilioClient
            _twilio_client = TwilioClient(sid, token)
        else:
            print("[Notifications] Twilio credentials not configured")
    return _twilio_client

scheduler = BackgroundScheduler()
scheduler.start()

def send_sms(to: str, message: str) -> bool:
    """Send an SMS via Twilio. Returns True on success."""
    client = _get_twilio()
    if not client:
        print(f"[Notifications] SMS skipped (no Twilio): {to} -> {message}")
        return False
    try:
        client.messages.create(body=message, from_=TWILIO_FROM, to=to)
        return True
    except Exception as e:
        print(f"[Notifications] SMS failed: {e}")
        return False

def schedule_reminder(phone: str, message: str, days_from_now: int):
    """Schedule an SMS reminder N days from now."""
    run_time = datetime.now() + timedelta(days=days_from_now)
    scheduler.add_job(
        send_sms,
        trigger="date",
        run_date=run_time,
        args=[phone, message]
    )
    print(f"[Notifications] Reminder scheduled for {run_time}")
