"""Backend tests for the new Stripe recurring subscription billing.

Verifies the fix that replaced permanent one-time premium with
recurring monthly subscriptions + date-based `is_premium`.
"""
from __future__ import annotations

import datetime as _dt
import os

import pytest
import stripe

from tests.conftest import BASE_URL, NORMAL_USER_ID, USER_TOKEN


# Configure Stripe SDK for direct verification calls through the Emergent proxy.
stripe.api_key = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")
if "sk_test_emergent" in stripe.api_key:
    stripe.api_base = "https://integrations.emergentagent.com/stripe"


def _utcnow() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def _reset_user(mongo, event_loop, **fields):
    """Overwrite premium-related fields on the normal test user."""

    async def _do():
        unset_keys = {k: "" for k, v in fields.items() if v is None}
        set_keys = {k: v for k, v in fields.items() if v is not None}
        update: dict = {}
        if set_keys:
            update["$set"] = set_keys
        if unset_keys:
            update["$unset"] = unset_keys
        if not update:
            update = {"$set": {}}
        await mongo.users.update_one({"user_id": NORMAL_USER_ID}, update)

    event_loop.run_until_complete(_do())


def _fetch_user(mongo, event_loop, user_id: str = NORMAL_USER_ID) -> dict:
    async def _do():
        return await mongo.users.find_one({"user_id": user_id}, {"_id": 0})

    return event_loop.run_until_complete(_do())


# ---------------------------------------------------------------------------
# 1 + 2. Checkout mode verification (subscription vs one-time pack)
# ---------------------------------------------------------------------------
class TestCheckoutMode:
    def test_subscription_returns_url_and_mode(self, api, user_headers):
        r = api.post(
            f"{BASE_URL}/api/billing/checkout",
            json={"kind": "subscription", "origin": "https://example.com"},
            headers=user_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["url"].startswith("https://checkout.stripe.com/"), data["url"]
        assert data["session_id"].startswith("cs_test_"), data["session_id"]

        # Retrieve session directly from Stripe to verify mode.
        session = stripe.checkout.Session.retrieve(data["session_id"])
        assert session["mode"] == "subscription", session
        # Should include a recurring line item.
        items = stripe.checkout.Session.list_line_items(data["session_id"], limit=5)
        assert items and items["data"], "no line items on subscription session"
        price = items["data"][0].get("price") or {}
        assert price.get("recurring", {}).get("interval") == "month", price

    def test_pack_is_one_time_payment(self, api, user_headers):
        r = api.post(
            f"{BASE_URL}/api/billing/checkout",
            json={"kind": "pack", "origin": "https://example.com"},
            headers=user_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["url"].startswith("https://checkout.stripe.com/"), data["url"]
        assert data["session_id"].startswith("cs_test_"), data["session_id"]

        session = stripe.checkout.Session.retrieve(data["session_id"])
        assert session["mode"] == "payment", session


# ---------------------------------------------------------------------------
# 3. is_premium is derived from premium_expires_at
# ---------------------------------------------------------------------------
class TestPremiumIsDateDerived:
    def test_future_expiry_is_premium_true(self, api, user_headers, mongo, event_loop):
        expiry = _utcnow() + _dt.timedelta(days=5)
        _reset_user(mongo, event_loop, premium_expires_at=expiry, subscription_status="active")

        r = api.get(f"{BASE_URL}/api/auth/me", headers=user_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["is_premium"] is True
        assert body.get("premium_expires_at") is not None
        # ISO string echoed
        parsed = _dt.datetime.fromisoformat(body["premium_expires_at"].replace("Z", "+00:00"))
        assert abs((parsed - expiry).total_seconds()) < 5

    def test_past_expiry_is_premium_false(self, api, user_headers, mongo, event_loop):
        expiry = _utcnow() - _dt.timedelta(days=1)
        _reset_user(mongo, event_loop, premium_expires_at=expiry)

        r = api.get(f"{BASE_URL}/api/auth/me", headers=user_headers)
        assert r.status_code == 200
        assert r.json()["is_premium"] is False

    def test_none_expiry_is_premium_false(self, api, user_headers, mongo, event_loop):
        _reset_user(mongo, event_loop, premium_expires_at=None, subscription_status=None)

        r = api.get(f"{BASE_URL}/api/auth/me", headers=user_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["is_premium"] is False
        assert data["premium_expires_at"] is None


# ---------------------------------------------------------------------------
# 4. Daily limit uses derived is_premium
# ---------------------------------------------------------------------------
class TestDailyLimitDerived:
    def _set_usage(self, mongo, event_loop, count: int):
        today = _utcnow().strftime("%Y-%m-%d")

        async def _do():
            await mongo.usage.update_one(
                {"user_id": NORMAL_USER_ID, "date": today},
                {"$set": {"count": count, "updated_at": _utcnow()}},
                upsert=True,
            )

        event_loop.run_until_complete(_do())

    def test_past_expiry_hits_limit_402(self, api, user_headers, mongo, event_loop, pet_image_b64):
        _reset_user(mongo, event_loop, premium_expires_at=_utcnow() - _dt.timedelta(days=1))
        self._set_usage(mongo, event_loop, 3)

        r = api.post(
            f"{BASE_URL}/api/transform",
            json={"image_base64": pet_image_b64, "category_slug": "wizard"},
            headers=user_headers,
            timeout=30,
        )
        assert r.status_code == 402, r.text

    def test_future_expiry_bypasses_limit(self, api, user_headers, mongo, event_loop, pet_image_b64):
        _reset_user(mongo, event_loop, premium_expires_at=_utcnow() + _dt.timedelta(days=5))
        self._set_usage(mongo, event_loop, 3)

        r = api.post(
            f"{BASE_URL}/api/transform",
            json={"image_base64": pet_image_b64, "category_slug": "wizard"},
            headers=user_headers,
            timeout=180,
        )
        # Must NOT be 402 (limit). Could be 200 (AI worked) or 502 (AI failed).
        assert r.status_code != 402, f"premium user hit paywall unexpectedly: {r.text[:200]}"
        assert r.status_code in (200, 502), f"unexpected status {r.status_code}: {r.text[:200]}"


# ---------------------------------------------------------------------------
# 5. Webhook: invoice.paid -> extends (or logs) — always returns 200
# ---------------------------------------------------------------------------
class TestWebhookInvoicePaid:
    def test_invoice_paid_returns_200(self, api, mongo, event_loop):
        # Seed user with a stripe_subscription_id and current expiry 3 days out.
        expiry = _utcnow() + _dt.timedelta(days=3)
        _reset_user(
            mongo,
            event_loop,
            stripe_subscription_id="sub_test_renewal",
            subscription_status="active",
            premium_expires_at=expiry,
        )

        event = {
            "type": "invoice.paid",
            "data": {"object": {"subscription": "sub_test_renewal"}},
        }
        r = api.post(f"{BASE_URL}/api/webhook/stripe", json=event)
        assert r.status_code == 200, r.text
        assert r.json().get("received") is True

        # Since sub_test_renewal does not exist in Stripe, sync is skipped and
        # the previously set expiry must remain intact (no data corruption).
        u = _fetch_user(mongo, event_loop)
        assert u.get("premium_expires_at") is not None


# ---------------------------------------------------------------------------
# 6. Webhook: invoice.payment_failed -> past_due
# ---------------------------------------------------------------------------
class TestWebhookPaymentFailed:
    def test_payment_failed_marks_past_due(self, api, mongo, event_loop):
        _reset_user(
            mongo,
            event_loop,
            stripe_subscription_id="sub_test_failed",
            subscription_status="active",
            premium_expires_at=_utcnow() + _dt.timedelta(days=2),
        )
        event = {
            "type": "invoice.payment_failed",
            "data": {"object": {"subscription": "sub_test_failed"}},
        }
        r = api.post(f"{BASE_URL}/api/webhook/stripe", json=event)
        assert r.status_code == 200, r.text

        u = _fetch_user(mongo, event_loop)
        assert u.get("subscription_status") == "past_due", u


# ---------------------------------------------------------------------------
# 7. Webhook: subscription canceled -> premium lapses at period end
# ---------------------------------------------------------------------------
class TestWebhookSubscriptionDeleted:
    def test_cancel_preserves_expiry_until_period_end(
        self, api, user_headers, mongo, event_loop
    ):
        period_end = _utcnow() + _dt.timedelta(days=5)
        _reset_user(
            mongo,
            event_loop,
            stripe_subscription_id="sub_test_cancel",
            subscription_status="active",
            cancel_at_period_end=True,
            premium_expires_at=period_end,
        )
        cpe_epoch = int(period_end.timestamp())
        now_epoch = int(_utcnow().timestamp())
        event = {
            "type": "customer.subscription.deleted",
            "data": {
                "object": {
                    "id": "sub_test_cancel",
                    "current_period_end": cpe_epoch,
                    "status": "canceled",
                    "canceled_at": now_epoch,
                }
            },
        }
        r = api.post(f"{BASE_URL}/api/webhook/stripe", json=event)
        assert r.status_code == 200, r.text

        u = _fetch_user(mongo, event_loop)
        assert u.get("subscription_status") == "canceled"
        assert u.get("cancel_at_period_end") is False
        # premium_expires_at should be ~period_end (NOT wiped, NOT now).
        pe = u.get("premium_expires_at")
        assert pe is not None
        if pe.tzinfo is None:
            pe = pe.replace(tzinfo=_dt.timezone.utc)
        assert abs((pe - period_end).total_seconds()) < 5, pe

        # /auth/me still shows premium (in-period).
        me = api.get(f"{BASE_URL}/api/auth/me", headers=user_headers).json()
        assert me["is_premium"] is True

        # Simulate lapse -> is_premium flips to false.
        _reset_user(mongo, event_loop, premium_expires_at=_utcnow() - _dt.timedelta(hours=1))
        me2 = api.get(f"{BASE_URL}/api/auth/me", headers=user_headers).json()
        assert me2["is_premium"] is False


# ---------------------------------------------------------------------------
# 8. Webhook: invalid JSON body -> 400 when no secret configured
# ---------------------------------------------------------------------------
class TestWebhookInvalidBody:
    def test_invalid_json_returns_400(self, api):
        # No STRIPE_WEBHOOK_SECRET in env, so bad JSON must be rejected.
        r = api.post(
            f"{BASE_URL}/api/webhook/stripe",
            data=b"not-json-at-all-@@@",
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 400, r.text


# ---------------------------------------------------------------------------
# 9. Billing endpoints still auth-guarded
# ---------------------------------------------------------------------------
class TestBillingAuthGuard:
    def test_checkout_requires_auth(self, api):
        r = api.post(
            f"{BASE_URL}/api/billing/checkout",
            json={"kind": "subscription", "origin": "https://example.com"},
        )
        assert r.status_code == 401

    def test_billing_status_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/billing/status/cs_test_dummy")
        assert r.status_code == 401
