"""Shared fixtures for backend tests."""
import asyncio
import base64
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient


BASE_URL = os.environ.get("BASE_URL", "http://localhost:8001").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "pet_alt_life")

ADMIN_TOKEN = "test-admin-session-token"
USER_TOKEN = "test-user-session-token"
ADMIN_USER_ID = "user_test_admin"
NORMAL_USER_ID = "user_test_normal"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def mongo():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


@pytest.fixture(scope="session", autouse=True)
def seed_users(mongo, event_loop):
    """Seed admin + normal user + sessions directly into MongoDB."""

    async def _seed():
        now = datetime.now(timezone.utc)
        # Cleanup any prior test data
        await mongo.users.delete_many({"user_id": {"$in": [ADMIN_USER_ID, NORMAL_USER_ID]}})
        await mongo.user_sessions.delete_many({"session_token": {"$in": [ADMIN_TOKEN, USER_TOKEN]}})
        await mongo.transformations.delete_many({"user_id": {"$in": [ADMIN_USER_ID, NORMAL_USER_ID]}})
        await mongo.usage.delete_many({"user_id": {"$in": [ADMIN_USER_ID, NORMAL_USER_ID]}})
        await mongo.payment_transactions.delete_many({"user_id": {"$in": [ADMIN_USER_ID, NORMAL_USER_ID]}})

        await mongo.users.insert_one({
            "user_id": ADMIN_USER_ID,
            "email": "TEST_admin@example.com",
            "name": "Test Admin",
            "is_premium": False,
            "is_admin": True,
            "created_at": now,
        })
        await mongo.users.insert_one({
            "user_id": NORMAL_USER_ID,
            "email": "TEST_user@example.com",
            "name": "Test User",
            "is_premium": False,
            "is_admin": False,
            "created_at": now,
        })
        await mongo.user_sessions.insert_one({
            "session_token": ADMIN_TOKEN,
            "user_id": ADMIN_USER_ID,
            "created_at": now,
            "expires_at": now + timedelta(days=7),
        })
        await mongo.user_sessions.insert_one({
            "session_token": USER_TOKEN,
            "user_id": NORMAL_USER_ID,
            "created_at": now,
            "expires_at": now + timedelta(days=7),
        })

    event_loop.run_until_complete(_seed())
    yield

    async def _cleanup():
        await mongo.users.delete_many({"user_id": {"$in": [ADMIN_USER_ID, NORMAL_USER_ID]}})
        await mongo.user_sessions.delete_many({"session_token": {"$in": [ADMIN_TOKEN, USER_TOKEN]}})
        await mongo.transformations.delete_many({"user_id": {"$in": [ADMIN_USER_ID, NORMAL_USER_ID]}})
        await mongo.usage.delete_many({"user_id": {"$in": [ADMIN_USER_ID, NORMAL_USER_ID]}})
        await mongo.payment_transactions.delete_many({"user_id": {"$in": [ADMIN_USER_ID, NORMAL_USER_ID]}})

    event_loop.run_until_complete(_cleanup())


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def admin_headers():
    return {"Authorization": f"Bearer {ADMIN_TOKEN}"}


@pytest.fixture
def user_headers():
    return {"Authorization": f"Bearer {USER_TOKEN}"}


@pytest.fixture(scope="session")
def pet_image_b64():
    """Fetch a small pet image and return base64."""
    urls = [
        "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=200&h=200&fit=crop",
        "https://images.unsplash.com/photo-1543852786-1cf6624b9987?w=200&h=200&fit=crop",
        "https://placekitten.com/200/200",
    ]
    for url in urls:
        try:
            r = requests.get(url, timeout=15)
            if r.status_code == 200 and len(r.content) > 500:
                return base64.b64encode(r.content).decode("ascii")
        except Exception:
            continue
    # Fallback minimal JPEG (>100 chars b64)
    import io
    from PIL import Image
    img = Image.new("RGB", (64, 64), (200, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode("ascii")
