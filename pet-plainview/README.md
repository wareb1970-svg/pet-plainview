# What If My Pet Was… (pet-plainview)

AI pet portrait app. Expo (React Native + web) frontend, FastAPI + MongoDB backend,
Stripe subscriptions, Google Gemini image generation. Fully self-hosted — no
third-party platform dependencies.

## Backend environment variables (Render)
- MONGO_URL          — MongoDB Atlas connection string
- DB_NAME            — e.g. petapp
- GEMINI_API_KEY     — from Google AI Studio
- STRIPE_API_KEY     — your Stripe secret key
- STRIPE_WEBHOOK_SECRET — from the Stripe webhook endpoint (required; webhooks are rejected without it)
- ALLOWED_ORIGINS    — comma-separated, e.g. https://pets.plainviewit.online

## Frontend environment variable
- EXPO_PUBLIC_BACKEND_URL — the backend's public URL

## Run backend locally
cd backend && pip install -r requirements.txt
uvicorn server:app --reload --port 8000

## Run frontend (web)
cd frontend && yarn && yarn web

## Notes
- First registered account becomes admin.
- Free tier: daily generation limit (configurable in admin). Premium: Stripe monthly subscription.
