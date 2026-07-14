"""Tests for style picker + preservation-aware prompt construction.

These tests monkeypatch backend.server._generate_image and _generate_copy to avoid
real Gemini calls, and directly invoke the prompt-build logic to assert wording.
"""
from __future__ import annotations

import base64
import datetime as _dt

import pytest
import requests

# Backend module imported for monkeypatching + direct prompt inspection
import server as srv  # type: ignore
from tests.conftest import BASE_URL, ADMIN_TOKEN, ADMIN_USER_ID  # noqa: F401


# ---- Small helpers --------------------------------------------------------
def _make_premium(mongo, event_loop):
    """Ensure the admin user has an active premium expiry so daily-limit is bypassed."""
    async def _upd():
        await mongo.users.update_one(
            {"user_id": ADMIN_USER_ID},
            {"$set": {"premium_expires_at": _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(days=30)}},
        )
    event_loop.run_until_complete(_upd())


def _reset_premium(mongo, event_loop):
    async def _upd():
        await mongo.users.update_one(
            {"user_id": ADMIN_USER_ID},
            {"$set": {"premium_expires_at": None}},
        )
    event_loop.run_until_complete(_upd())


def _tiny_b64() -> str:
    # >100 chars b64 (server validation)
    return base64.b64encode(b"x" * 200).decode("ascii")


# ---- GET /api/categories new fields --------------------------------------
class TestCategoriesStyles:
    def test_categories_returns_styles_and_default(self, api):
        r = api.get(f"{BASE_URL}/api/categories")
        assert r.status_code == 200
        data = r.json()
        assert data.get("default_style") == "realistic"
        styles = data.get("styles")
        assert isinstance(styles, list) and len(styles) == 4
        keys = {s["key"] for s in styles}
        assert keys == {"realistic", "cartoon", "comic", "watercolor"}
        # Each has label + prompt_suffix
        for s in styles:
            assert s.get("label")
            assert s.get("prompt_suffix")

    def test_human_category_has_human_preservation(self, api):
        r = api.get(f"{BASE_URL}/api/categories")
        cats = r.json()["categories"]
        human = next((c for c in cats if c["slug"] == "human"), None)
        assert human is not None
        assert human.get("preservation") == "human"

    def test_scene_specific_lighting_cues(self, api):
        r = api.get(f"{BASE_URL}/api/categories")
        cats = {c["slug"]: c for c in r.json()["categories"]}
        assert "ember" in cats["firefighter"]["prompt"].lower()
        assert "golden hour" in cats["pirate"]["prompt"].lower()
        assert "noir" in cats["detective"]["prompt"].lower()


# ---- POST /api/transform accepts style -----------------------------------
class TestTransformStyle:
    """These tests hit the live server so AI calls are real. We use short retries.

    Note: monkeypatching server functions in the test process does NOT affect the
    supervisor-managed uvicorn process, so we let the real AI run here. The
    prompt-selection unit tests below (TestPromptConstruction) exercise the
    prompt-build logic in-process without a real network call.
    """

    @pytest.fixture(autouse=True)
    def _premium(self, mongo, event_loop):
        _make_premium(mongo, event_loop)
        yield
        _reset_premium(mongo, event_loop)
        async def _clean():
            await mongo.transformations.delete_many({"user_id": ADMIN_USER_ID})
            await mongo.usage.delete_many({"user_id": ADMIN_USER_ID})
        event_loop.run_until_complete(_clean())

    def _call(self, api, admin_headers, body):
        last = None
        for _ in range(2):
            r = api.post(
                f"{BASE_URL}/api/transform",
                json=body,
                headers=admin_headers,
                timeout=120,
            )
            if r.status_code == 200:
                return r
            last = r
        return last

    def test_transform_with_cartoon_style(self, api, admin_headers, mongo, event_loop, pet_image_b64):
        r = self._call(api, admin_headers, {
            "image_base64": pet_image_b64,
            "category_slug": "wizard",
            "style": "cartoon",
        })
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["style"] == "cartoon"
        assert doc["style_label"] == "Cartoon"

        async def _find():
            return await mongo.transformations.find_one({"id": doc["id"]}, {"_id": 0})
        stored = event_loop.run_until_complete(_find())
        assert stored is not None
        assert stored["style"] == "cartoon"
        assert stored["style_label"] == "Cartoon"

    def test_transform_default_style_realistic(self, api, admin_headers, pet_image_b64):
        r = self._call(api, admin_headers, {
            "image_base64": pet_image_b64,
            "category_slug": "wizard",
        })
        assert r.status_code == 200, r.text
        assert r.json()["style"] == "realistic"
        assert r.json()["style_label"] == "Realistic"

    def test_transform_bogus_style_returns_400(self, api, admin_headers, pet_image_b64):
        # This should fail validation BEFORE any AI call
        r = api.post(
            f"{BASE_URL}/api/transform",
            json={"image_base64": pet_image_b64, "category_slug": "wizard", "style": "bogus"},
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 400
        assert "unknown style" in r.text.lower()


# ---- Prompt construction spy on LlmChat ----------------------------------
class TestPromptConstruction:
    """Directly call server._generate_image while spying on LlmChat to capture prompt text."""

    @pytest.fixture
    def prompt_spy(self, monkeypatch):
        captured = {"text": None}

        class FakeChat:
            def __init__(self, *a, **kw):
                pass
            def with_model(self, *a, **kw):
                return self
            def with_params(self, *a, **kw):
                return self
            async def send_message_multimodal_response(self, msg):
                captured["text"] = msg.text
                return ("ok", [{"data": "FAKEB64"}])

        monkeypatch.setattr(srv, "LlmChat", FakeChat)
        return captured

    def _run(self, coro, event_loop):
        return event_loop.run_until_complete(coro)

    def test_human_prompt_wording(self, prompt_spy, event_loop):
        cat = srv.CATEGORY_LOOKUP["human"]
        style = srv.STYLE_LOOKUP["realistic"]
        result = self._run(srv._generate_image(cat, "Biscuit", "aGVsbG8=" * 20, style), event_loop)
        assert result == "FAKEB64"
        text = prompt_spy["text"]
        assert text is not None
        assert "fully HUMAN person" in text
        assert "remains an animal" not in text

    def test_pirate_prompt_wording(self, prompt_spy, event_loop):
        cat = srv.CATEGORY_LOOKUP["pirate"]
        style = srv.STYLE_LOOKUP["realistic"]
        self._run(srv._generate_image(cat, None, "aGVsbG8=" * 20, style), event_loop)
        text = prompt_spy["text"]
        assert "remains an animal" in text
        assert "golden hour" in text.lower()
        assert "fully HUMAN" not in text

    def test_watercolor_style_suffix(self, prompt_spy, event_loop):
        cat = srv.CATEGORY_LOOKUP["wizard"]
        style = srv.STYLE_LOOKUP["watercolor"]
        self._run(srv._generate_image(cat, None, "aGVsbG8=" * 20, style), event_loop)
        text = prompt_spy["text"]
        assert "watercolor" in text.lower()

    def test_realistic_style_suffix(self, prompt_spy, event_loop):
        cat = srv.CATEGORY_LOOKUP["wizard"]
        style = srv.STYLE_LOOKUP["realistic"]
        self._run(srv._generate_image(cat, None, "aGVsbG8=" * 20, style), event_loop)
        text = prompt_spy["text"]
        assert "photorealistic" in text.lower()
