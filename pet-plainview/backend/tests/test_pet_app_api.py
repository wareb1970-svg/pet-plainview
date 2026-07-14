"""Backend API tests for What If My Pet Was app."""
import time
import pytest
from tests.conftest import BASE_URL, ADMIN_USER_ID, NORMAL_USER_ID, ADMIN_TOKEN, USER_TOKEN


# --- Health & Catalog ------------------------------------------------------
class TestHealth:
    def test_health(self, api):
        r = api.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert data.get("service") == "what-if-my-pet"

    def test_categories(self, api):
        r = api.get(f"{BASE_URL}/api/categories")
        assert r.status_code == 200
        data = r.json()
        assert "groups" in data and "categories" in data
        assert len(data["categories"]) == 43
        assert len(data["groups"]) == 6
        expected_groups = {"Occupations", "Heroic", "Fantasy", "Holidays", "Historical", "Future"}
        assert set(data["groups"].keys()) == expected_groups


# --- Auth ------------------------------------------------------------------
class TestAuth:
    def test_no_bearer_returns_401(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_invalid_bearer_returns_401(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me",
                    headers={"Authorization": "Bearer invalid-token-xyz"})
        assert r.status_code == 401

    def test_protected_endpoints_require_auth(self, api):
        endpoints = [
            ("GET", "/api/auth/me"),
            ("GET", "/api/transformations"),
            ("GET", "/api/usage"),
            ("POST", "/api/transform"),
            ("GET", "/api/admin/config"),
            ("GET", "/api/admin/analytics"),
            ("POST", "/api/billing/checkout"),
        ]
        for method, path in endpoints:
            r = api.request(method, f"{BASE_URL}{path}", json={})
            assert r.status_code == 401, f"{method} {path} returned {r.status_code}, expected 401"

    def test_auth_me_returns_user(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["user_id"] == ADMIN_USER_ID
        assert data["is_admin"] is True
        assert data["is_premium"] is False
        assert "daily_used" in data
        assert "daily_limit" in data
        assert isinstance(data["daily_limit"], int)


# --- Admin -----------------------------------------------------------------
class TestAdmin:
    def test_admin_get_config(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/config", headers=admin_headers)
        assert r.status_code == 200
        cfg = r.json()
        assert "daily_limit_free" in cfg

    def test_non_admin_forbidden(self, api, user_headers):
        r = api.get(f"{BASE_URL}/api/admin/config", headers=user_headers)
        assert r.status_code == 403
        r2 = api.get(f"{BASE_URL}/api/admin/analytics", headers=user_headers)
        assert r2.status_code == 403

    def test_admin_update_config(self, api, admin_headers):
        r = api.put(f"{BASE_URL}/api/admin/config",
                    json={"daily_limit_free": 5}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["daily_limit_free"] == 5
        # Verify GET reflects it
        r2 = api.get(f"{BASE_URL}/api/admin/config", headers=admin_headers)
        assert r2.json()["daily_limit_free"] == 5
        # Reset
        api.put(f"{BASE_URL}/api/admin/config",
                json={"daily_limit_free": 3}, headers=admin_headers)

    def test_admin_analytics(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/analytics", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        for key in ["total_users", "premium_users", "total_generations",
                    "total_favorites", "paid_transactions"]:
            assert key in data
            assert isinstance(data[key], int)


# --- Usage -----------------------------------------------------------------
class TestUsage:
    def test_get_usage(self, api, user_headers):
        r = api.get(f"{BASE_URL}/api/usage", headers=user_headers)
        assert r.status_code == 200
        data = r.json()
        assert "used" in data and "limit" in data
        assert "remaining" in data
        assert data["is_premium"] is False


# --- Billing ---------------------------------------------------------------
class TestBilling:
    def test_checkout_subscription(self, api, user_headers):
        r = api.post(f"{BASE_URL}/api/billing/checkout",
                     json={"kind": "subscription", "origin": "https://example.com"},
                     headers=user_headers)
        assert r.status_code == 200, f"body={r.text}"
        data = r.json()
        assert "url" in data and data["url"].startswith("https://")
        assert "session_id" in data and data["session_id"]

    def test_checkout_invalid_kind(self, api, user_headers):
        r = api.post(f"{BASE_URL}/api/billing/checkout",
                     json={"kind": "bogus", "origin": "https://example.com"},
                     headers=user_headers)
        assert r.status_code == 400


# --- Transform (AI-heavy) --------------------------------------------------
class TestTransform:
    def test_invalid_image(self, api, admin_headers):
        r = api.post(f"{BASE_URL}/api/transform",
                     json={"image_base64": "abc", "category_slug": "surprise"},
                     headers=admin_headers)
        assert r.status_code == 400

    def test_unknown_category(self, api, admin_headers, pet_image_b64):
        r = api.post(f"{BASE_URL}/api/transform",
                     json={"image_base64": pet_image_b64, "category_slug": "bogus_slug_xxx"},
                     headers=admin_headers)
        assert r.status_code == 404

    def test_transform_surprise_creates_tx(self, api, admin_headers, pet_image_b64):
        """Full E2E: transform -> list -> favorite toggle -> delete."""
        last_err = None
        for attempt in range(2):
            r = api.post(f"{BASE_URL}/api/transform",
                         json={"image_base64": pet_image_b64,
                               "category_slug": "surprise",
                               "pet_name": "TestBuddy"},
                         headers=admin_headers, timeout=120)
            if r.status_code == 200:
                break
            last_err = f"status={r.status_code} body={r.text[:300]}"
            time.sleep(2)
        else:
            pytest.fail(f"transform failed after retries: {last_err}")

        doc = r.json()
        for key in ["id", "image_base64", "name", "occupation", "personality",
                    "biography", "category_slug", "category_label", "favorite"]:
            assert key in doc, f"missing key {key}"
        assert doc["favorite"] is False
        assert doc["image_base64"] and len(doc["image_base64"]) > 100
        tx_id = doc["id"]

        # List
        r2 = api.get(f"{BASE_URL}/api/transformations", headers=admin_headers)
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert any(i["id"] == tx_id for i in items)

        # Get one
        r3 = api.get(f"{BASE_URL}/api/transformations/{tx_id}", headers=admin_headers)
        assert r3.status_code == 200

        # Favorite toggle: false -> true
        r4 = api.post(f"{BASE_URL}/api/transformations/{tx_id}/favorite",
                      headers=admin_headers)
        assert r4.status_code == 200
        assert r4.json()["favorite"] is True
        # Toggle again -> false
        r5 = api.post(f"{BASE_URL}/api/transformations/{tx_id}/favorite",
                      headers=admin_headers)
        assert r5.json()["favorite"] is False

        # Usage incremented
        r6 = api.get(f"{BASE_URL}/api/usage", headers=admin_headers)
        assert r6.json()["used"] >= 1

        # Delete
        r7 = api.delete(f"{BASE_URL}/api/transformations/{tx_id}",
                        headers=admin_headers)
        assert r7.status_code == 200
        assert r7.json()["deleted"] == 1

        # Verify 404 after delete
        r8 = api.get(f"{BASE_URL}/api/transformations/{tx_id}", headers=admin_headers)
        assert r8.status_code == 404


# --- Daily limit (non-premium user) ----------------------------------------
class TestDailyLimit:
    def test_daily_limit_returns_402(self, api, user_headers, mongo, event_loop, pet_image_b64):
        """Pre-fill usage to limit, then next transform must fail with 402 without invoking AI."""
        # Set usage to daily_limit (config default 3)
        async def _prefill():
            today = __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc).strftime("%Y-%m-%d")
            await mongo.usage.update_one(
                {"user_id": NORMAL_USER_ID, "date": today},
                {"$set": {"count": 3, "updated_at": __import__("datetime").datetime.now(
                    __import__("datetime").timezone.utc)}},
                upsert=True,
            )
        event_loop.run_until_complete(_prefill())

        r = api.post(f"{BASE_URL}/api/transform",
                     json={"image_base64": pet_image_b64,
                           "category_slug": "wizard"},
                     headers=user_headers)
        assert r.status_code == 402, f"expected 402 got {r.status_code}: {r.text[:200]}"


# --- Logout ----------------------------------------------------------------
class TestLogout:
    def test_logout_invalidates_session(self, api, mongo, event_loop):
        # Create a throw-away session
        import datetime as _dt
        token = "TEST_throwaway_token"

        async def _add():
            await mongo.user_sessions.insert_one({
                "session_token": token,
                "user_id": ADMIN_USER_ID,
                "created_at": _dt.datetime.now(_dt.timezone.utc),
                "expires_at": _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(days=1),
            })
        event_loop.run_until_complete(_add())

        # Confirm works
        r = api.get(f"{BASE_URL}/api/auth/me",
                    headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200

        # Logout
        r2 = api.post(f"{BASE_URL}/api/auth/logout",
                      headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        assert r2.json()["ok"] is True

        # Now unauthorized
        r3 = api.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {token}"})
        assert r3.status_code == 401
