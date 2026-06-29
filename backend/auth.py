import hashlib
import hmac
import secrets
from typing import Optional

from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import User

TOKEN_TTL_SECONDS = 60 * 60 * 24
active_sessions: dict[str, str] = {}


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    name: str
    email: str
    auth_token: str
    message: str | None = None


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        200_000,
    )
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, expected = stored_hash.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        200_000,
    )
    return hmac.compare_digest(digest.hex(), expected)


def create_session_token(email: str) -> str:
    token = secrets.token_urlsafe(32)
    active_sessions[token] = email
    return token


def get_email_for_token(token: str) -> Optional[str]:
    return active_sessions.get(token)


def create_user(db: Session, name: str, email: str, password: str):
    normalized_email = normalize_email(email)
    existing = db.query(User).filter(User.email == normalized_email).first()
    if existing:
        raise ValueError("A user with this email already exists.")

    user = User(
        username=normalized_email,
        name=name.strip(),
        email=normalized_email,
        password_hash=hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str):
    normalized_email = normalize_email(email)
    user = db.query(User).filter(User.email == normalized_email).first()
    if user is None:
        user = db.query(User).filter(User.username == normalized_email).first()
    if user is None:
        return None, "No account found for this email."
    if not verify_password(password, user.password_hash):
        return None, "Incorrect password."
    return user, None
