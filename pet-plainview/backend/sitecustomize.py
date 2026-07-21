"""Signal 5 subscription checkout extension loaded automatically by Python.

Render starts the existing FastAPI service from this directory. Python imports
sitecustomize during startup, so this module adds the Signal 5 checkout route
without disturbing the pet application's existing billing code.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any
from urllib.parse import quote

import stripe
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse

stripe.api_key = os.environ.get("STRIPE_API_KEY", "")

_SIGNAL5_PLANS: dict[str, dict[str, Any]] = {
    "pro": {
        "name": "Signal 5 Pro",
        "unit_amount": 995,
        "lookup_key": "signal5_pro_monthly_v1_995",
    },
    "business": {
        "name": "Signal 5 Business",
        "unit_amount": 1699,
        "lookup_key": "signal5_business_monthly_v1_1699",
    },
}
_SIGNAL5_ORIGIN = "https://wareb1970-svg.github.io/signal5"
_original_include_router = FastAPI.include_router


async def _signal5_price(plan_key: str) -> str:
    plan = _SIGNAL5_PLANS[plan_key]
    existing = await asyncio.to_thread(
        stripe.Price.list,
        lookup_keys=[plan["lookup_key"]],
        active=True,
        limit=1,
    )
    if existing and existing.get("data"):
        return existing["data"][0]["id"]

    product = await asyncio.to_thread(
        stripe.Product.create,
        name=plan["name"],
        description="Monthly access to Signal 5 public risk intelligence tools.",
        metadata={"app": "signal5", "plan": plan_key},
    )
    price = await asyncio.to_thread(
        stripe.Price.create,
        product=product["id"],
        unit_amount=plan["unit_amount"],
        currency="usd",
        recurring={"interval": "month"},
        lookup_key=plan["lookup_key"],
        metadata={"app": "signal5", "plan": plan_key},
    )
    return price["id"]


def _install_signal5_routes(app: FastAPI) -> None:
    if getattr(app.state, "signal5_routes_installed", False):
        return
    app.state.signal5_routes_installed = True

    @app.get("/api/signal5/checkout", include_in_schema=True)
    async def signal5_checkout(
        plan: str = Query(..., pattern="^(pro|business)$")
    ) -> RedirectResponse:
        if not stripe.api_key:
            raise HTTPException(503, "Stripe is not configured")

        price_id = await _signal5_price(plan)
        success_url = (
            f"{_SIGNAL5_ORIGIN}/pricing.html"
            f"?subscription=success&plan={quote(plan)}"
        )
        cancel_url = f"{_SIGNAL5_ORIGIN}/pricing.html"

        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            allow_promotion_codes=True,
            billing_address_collection="auto",
            metadata={"app": "signal5", "plan": plan},
            subscription_data={
                "metadata": {"app": "signal5", "plan": plan}
            },
        )
        return RedirectResponse(url=session["url"], status_code=303)


def _include_router_and_install(
    self: FastAPI, *args: Any, **kwargs: Any
) -> Any:
    result = _original_include_router(self, *args, **kwargs)
    _install_signal5_routes(self)
    return result


FastAPI.include_router = _include_router_and_install
