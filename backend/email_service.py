import asyncio
import logging
import smtplib
from email.message import EmailMessage

from config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, OTP_DEV_EXPOSE

logger = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASS)


def _send_sync(to_email: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)


async def send_otp_email(to_email: str, code: str, expiry_minutes: int) -> bool:
    """Send the login OTP by email.

    Returns True if an email was actually sent. If SMTP is not configured,
    logs the code server-side (dev fallback) and returns False instead of
    raising, so local login stays testable. A real SMTP failure raises.
    """
    subject = "Your LifeVault login code"
    body = (
        f"Your LifeVault login verification code is: {code}\n\n"
        f"This code expires in {expiry_minutes} minutes.\n"
        f"If you didn't try to log in, you can safely ignore this email."
    )

    if not smtp_configured():
        # Never write the live code to logs unless dev-expose is explicitly on
        # (the response already carries it in that mode, so it's no extra exposure).
        if OTP_DEV_EXPOSE:
            logger.warning(
                "SMTP not configured — dev OTP for %s is %s (not emailed)", to_email, code
            )
        else:
            logger.warning("SMTP not configured — cannot email OTP to %s", to_email)
        return False

    await asyncio.to_thread(_send_sync, to_email, subject, body)
    logger.info("OTP email sent to %s", to_email)
    return True
