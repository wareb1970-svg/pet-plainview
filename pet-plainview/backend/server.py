"""What If My Pet Was…? – FastAPI backend."""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
import stripe
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

import bcrypt

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("petapp")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
STRIPE_API_KEY = os.environ["STRIPE_API_KEY"]
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
# Comma-separated list, e.g. "https://pets.plainviewit.online,http://localhost:8081"
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

stripe.api_key = STRIPE_API_KEY

_PREMIUM_PRICE_ID: Optional[str] = None
PREMIUM_LOOKUP_KEY = "wimp_premium_monthly_v1"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="What If My Pet Was")
api = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------
def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def make_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def normalize_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    return None


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class LoginIn(BaseModel):
    email: str
    password: str


class TransformIn(BaseModel):
    image_base64: str
    pet_name: Optional[str] = None
    category_slug: str
    style: Optional[str] = None


class AdminConfig(BaseModel):
    daily_limit_free: int = 3
    price_premium_usd: float = 9.99
    price_pack_usd: float = 4.99
    features: dict = Field(default_factory=lambda: {
        "watermark_free": True,
        "hd_export_premium": True,
    })


class CheckoutIn(BaseModel):
    kind: str  # "subscription" | "pack"
    origin: str


# ---------------------------------------------------------------------------
# Categories catalog (40+)
# ---------------------------------------------------------------------------
# Each category has an optional `preservation` field:
#   - "animal" (default): keep the pet unmistakably as itself (species/breed/markings preserved)
#   - "human": transform the pet into a fully-human person whose hair/eye color and vibe
#              match the pet's — "that's exactly who my dog would be as a person"
# The `prompt` field describes the SCENE (costume/props/setting/lighting/mood).
CATEGORIES: list[dict] = [
    {"slug":"human","label":"Human","group":"Occupations","preservation":"human","prompt":"a warm editorial studio portrait in modern casual clothing, soft north-window light with gentle rim highlight, muted neutral backdrop","emoji":"👤"},
    {"slug":"ceo","label":"CEO","group":"Occupations","prompt":"as a powerful CEO in a tailored charcoal suit, standing in a glass-walled boardroom, cool morning skyline light through floor-to-ceiling windows, crisp corporate mood","emoji":"💼"},
    {"slug":"billionaire","label":"Billionaire","group":"Occupations","prompt":"as a flamboyant billionaire in a silk robe on a superyacht at sunset, warm golden Mediterranean glow bouncing off the water, opulent tropical mood","emoji":"💰"},
    {"slug":"scientist","label":"Scientist","group":"Occupations","prompt":"as a brilliant scientist wearing a lab coat and safety goggles, standing in a high-tech laboratory, cool cyan and blue LED accent lighting, focused analytical mood","emoji":"🔬"},
    {"slug":"doctor","label":"Doctor","group":"Occupations","prompt":"as a caring doctor in white scrubs with a stethoscope around the neck, in a bright modern hospital corridor, clean daylight-balanced overhead lighting, calm reassuring mood","emoji":"🩺"},
    {"slug":"firefighter","label":"Firefighter","group":"Occupations","prompt":"as a heroic firefighter in full turnout gear with a red helmet, dramatic orange ember glow, backlit smoke and floating sparks, courageous intense mood","emoji":"🧯"},
    {"slug":"police","label":"Police Officer","group":"Occupations","prompt":"as a police officer in a crisp navy uniform with badge and sunglasses, city street at night, cool blue streetlamp glow with red-and-blue cruiser lights in the distance","emoji":"👮"},
    {"slug":"detective","label":"Detective","group":"Occupations","prompt":"as a noir detective in a trench coat and fedora, hard black-and-white film noir shadows through venetian blinds, cigarette-smoke haze, mysterious mood","emoji":"🕵️"},
    {"slug":"chef","label":"Chef","group":"Occupations","prompt":"as a Michelin star chef in a pristine white jacket and toque, plating gourmet food in a professional kitchen, warm tungsten light with a swirl of steam, refined culinary mood","emoji":"🍳"},
    {"slug":"farmer","label":"Farmer","group":"Occupations","prompt":"as a friendly farmer in denim overalls and a straw hat, standing in a golden wheat field at sunrise, warm rim-lit backlight and long dawn shadows, wholesome mood","emoji":"🚜"},
    {"slug":"astronaut","label":"Astronaut","group":"Occupations","prompt":"as an astronaut in a NASA spacesuit inside the ISS, earth glowing blue through the cupola window, soft cosmic backlight and cool white cabin lights","emoji":"👨‍🚀"},
    {"slug":"secret_agent","label":"Secret Agent","group":"Occupations","prompt":"as a suave secret agent in a black tuxedo at an opulent casino, warm chandelier bokeh with rich mahogany reflections, elegantly dangerous mood","emoji":"🎩"},
    {"slug":"race_car_driver","label":"Race Car Driver","group":"Occupations","prompt":"as a Formula 1 race car driver in a red racing suit with helmet under one arm, pit lane at dusk, harsh sodium overhead lights and lens-flare highlights on the car","emoji":"🏎️"},
    {"slug":"athlete","label":"Athlete","group":"Occupations","prompt":"as an olympic athlete in team uniform holding a gold medal, stadium floodlights at night with dramatic hero-shot rim light, triumphant mood","emoji":"🏅"},
    {"slug":"movie_star","label":"Movie Star","group":"Occupations","prompt":"as a glamorous movie star on the red carpet, harsh flashbulb pops and paparazzi backlight, high-contrast glamour mood","emoji":"🎬"},
    {"slug":"rockstar","label":"Rockstar","group":"Occupations","prompt":"as a rockstar on stage in a ripped leather jacket holding an electric guitar, saturated magenta and cyan stage lights with atmospheric haze, high-energy mood","emoji":"🎸"},

    {"slug":"superhero","label":"Superhero","group":"Heroic","prompt":"as a majestic superhero with a flowing cape and glowing suit, dramatic city skyline at dusk, cinematic hero-shot backlight and volumetric god rays","emoji":"🦸"},
    {"slug":"pirate","label":"Pirate","group":"Heroic","prompt":"as a swashbuckling pirate captain with an eye patch, tricorn hat and cutlass, on a wooden ship deck at golden hour with warm sun catching sails and rigging, adventurous mood","emoji":"🏴‍☠️"},
    {"slug":"cowboy","label":"Cowboy","group":"Heroic","prompt":"as a rugged cowboy in a dusty leather duster and stetson, standing in a desert town at high noon with harsh top-down sunlight and long dust-kicked shadows, tense showdown mood","emoji":"🤠"},
    {"slug":"viking","label":"Viking","group":"Heroic","prompt":"as a fierce viking warrior with a braided fur cloak, iron helmet with runes and a massive axe, snowy fjord under cold overcast light with wisps of breath in the air","emoji":"⚔️"},
    {"slug":"roman_emperor","label":"Roman Emperor","group":"Heroic","prompt":"as a mighty Roman emperor in golden armor and a laurel crown holding a scroll, warm afternoon sunlight raking through marble columns, imperial mood","emoji":"🏛️"},
    {"slug":"knight","label":"Medieval Knight","group":"Heroic","prompt":"as a noble medieval knight in ornate silver plate armor with a red plumed helmet, castle courtyard at torchlit twilight with flickering firelight glinting on metal","emoji":"🛡️"},
    {"slug":"samurai","label":"Samurai","group":"Heroic","prompt":"as a stoic samurai in traditional lacquered armor holding a katana, under cherry blossoms in soft dappled morning light with drifting sakura petals","emoji":"🗡️"},
    {"slug":"ninja","label":"Ninja","group":"Heroic","prompt":"as a stealthy ninja in dark cloth hood with only eyes visible, holding shuriken on a moonlit rooftop, cool blue moonlight and long silhouette shadows","emoji":"🥷"},
    {"slug":"king","label":"King or Queen","group":"Heroic","prompt":"as a regal monarch with a jewel-encrusted crown, ermine cape and golden scepter, seated on an ornate throne in a candlelit hall with warm chandelier glow","emoji":"👑"},

    {"slug":"wizard","label":"Wizard","group":"Fantasy","prompt":"as a wise wizard in blue starry robes holding a glowing staff, magical library with floating books and warm arcane light beams cutting through dust motes","emoji":"🧙"},
    {"slug":"witch","label":"Witch","group":"Fantasy","prompt":"as a stylish witch in a wide-brimmed hat holding a smoking cauldron, misty forest at night with cool moonlight through crooked branches and a faint green cauldron glow","emoji":"🧙‍♀️"},
    {"slug":"elf","label":"Elf","group":"Fantasy","prompt":"as an ethereal high elf with silver circlet and glowing green cloak, ancient forest with warm shafts of sunlight through the canopy and floating pollen","emoji":"🧝"},
    {"slug":"dragon_rider","label":"Dragon Rider","group":"Fantasy","prompt":"as a fearsome dragon rider on the back of a colossal red dragon flying over mountain peaks, epic golden-orange sunset behind, atmospheric haze and altitude glow","emoji":"🐉"},
    {"slug":"fairy","label":"Fairy","group":"Fantasy","prompt":"as a tiny sparkling fairy with iridescent wings and a flower crown, pastel bokeh magical background with warm firefly glows and soft dreamy diffusion","emoji":"🧚"},
    {"slug":"steampunk","label":"Steampunk","group":"Fantasy","prompt":"as a steampunk inventor with brass goggles, leather harness and mechanical arm, workshop of gears and copper pipes lit by warm sepia gaslight and swirling steam","emoji":"⚙️"},
    {"slug":"zombie","label":"Zombie","group":"Fantasy","prompt":"as a cute cartoon-friendly zombie with green-tinged fur, stitches and one glowing eye, spooky graveyard at night with pale green fog and sickly moonlight","emoji":"🧟"},
    {"slug":"vampire","label":"Vampire","group":"Fantasy","prompt":"as an elegant vampire in a dark velvet cape with a red silk lining, gothic castle interior at night, single flickering candelabra and deep crimson drapes","emoji":"🧛"},

    {"slug":"christmas","label":"Christmas","group":"Holidays","prompt":"in a cozy santa outfit with a red hat, warm fireplace glow, twinkling christmas tree lights and soft snow drifting outside the window","emoji":"🎄"},
    {"slug":"halloween","label":"Halloween","group":"Holidays","prompt":"in a spooky halloween costume surrounded by glowing jack-o-lanterns, misty fog under a full purple moon with orange candlelight accents","emoji":"🎃"},
    {"slug":"easter","label":"Easter","group":"Holidays","prompt":"as an easter helper with pastel painted eggs in a woven basket, cherry blossom garden in soft morning sunlight with gentle petal fall","emoji":"🐣"},
    {"slug":"beach","label":"Beach Vacation","group":"Holidays","prompt":"on a tropical beach vacation with sunglasses and a hawaiian shirt, holding a coconut drink, warm golden late-afternoon light and glittering turquoise ocean","emoji":"🏝️"},

    {"slug":"royal_family","label":"Royal Family","group":"Historical","prompt":"as a member of a royal family in formal military dress uniform with medals, gilded palace hall with opulent chandelier light and crimson-and-gold decor","emoji":"🏰"},
    {"slug":"ancient_egypt","label":"Ancient Egypt","group":"Historical","prompt":"as an ancient Egyptian pharaoh with striped nemes headdress and gold jewelry, hieroglyph wall lit by warm flickering torchlight and drifting incense smoke","emoji":"𓂀"},
    {"slug":"ancient_greece","label":"Ancient Greece","group":"Historical","prompt":"as an ancient Greek philosopher in white draped robes with an olive wreath, marble columns of the Parthenon in warm late-afternoon Mediterranean sun","emoji":"🏺"},
    {"slug":"wild_west","label":"Wild West","group":"Historical","prompt":"as a wild west sheriff with a tin star badge, six shooter and dusty vest, saloon interior with a sunbeam slicing through the smoky air and slatted window","emoji":"🌵"},

    {"slug":"future_2200","label":"Future 2200","group":"Future","prompt":"in a sleek cyberpunk outfit with neon accents and a holographic visor, futuristic megacity at night bathed in electric magenta and cyan neon and drifting rain-lit haze","emoji":"🌆"},
    {"slug":"space_explorer","label":"Space Explorer","group":"Future","prompt":"as a space explorer in an advanced exosuit on an alien planet with two moons in the sky, eerie twin-moon light casting cool violet-and-teal double shadows","emoji":"🚀"},
]

CATEGORY_LOOKUP = {c["slug"]: c for c in CATEGORIES}

# ---------------------------------------------------------------------------
# Style catalog (appended to prompt)
# ---------------------------------------------------------------------------
STYLES: list[dict] = [
    {"key":"realistic","label":"Realistic","prompt_suffix":"photorealistic, sharp focus, natural texture, cinematic quality, film-photograph feel"},
    {"key":"cartoon","label":"Cartoon","prompt_suffix":"as a vibrant 3D animated-film style character, expressive, polished, colorful"},
    {"key":"comic","label":"Comic Book","prompt_suffix":"as a bold comic book illustration with clean ink outlines, halftone shading, dynamic composition, vibrant flat colors"},
    {"key":"watercolor","label":"Watercolor","prompt_suffix":"as a soft watercolor painting with delicate washes, visible paper texture, gentle bleeds, airy pastel palette"},
]
STYLE_LOOKUP = {s["key"]: s for s in STYLES}
DEFAULT_STYLE = "realistic"

# ---------------------------------------------------------------------------
# Mongo bootstrap
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup() -> None:
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.transformations.create_index([("user_id", 1), ("created_at", -1)])
    await db.usage.create_index([("user_id", 1), ("date", 1)], unique=True)
    if not await db.admin_config.find_one({"_id": "singleton"}):
        default = AdminConfig().model_dump()
        default["_id"] = "singleton"
        await db.admin_config.insert_one(default)


@app.on_event("shutdown")
async def on_shutdown() -> None:
    client.close()


# ---------------------------------------------------------------------------
# Auth (Emergent-managed Google)
# ---------------------------------------------------------------------------
async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Invalid session")
    expires_at = normalize_dt(session.get("expires_at"))
    if expires_at and expires_at < utcnow():
        await db.user_sessions.delete_one({"session_token": token})
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User missing")
    return user


async def daily_usage(user_id: str) -> int:
    today = utcnow().strftime("%Y-%m-%d")
    doc = await db.usage.find_one({"user_id": user_id, "date": today}, {"_id": 0})
    return int(doc.get("count", 0)) if doc else 0


async def increment_usage(user_id: str) -> None:
    today = utcnow().strftime("%Y-%m-%d")
    await db.usage.update_one(
        {"user_id": user_id, "date": today},
        {"$inc": {"count": 1}, "$set": {"updated_at": utcnow()}},
        upsert=True,
    )


async def get_config() -> dict:
    doc = await db.admin_config.find_one({"_id": "singleton"}, {"_id": 0})
    return doc or AdminConfig().model_dump()


def is_premium_active(user: dict) -> bool:
    """Premium is date-based: valid iff `premium_expires_at` is in the future."""
    expiry = normalize_dt(user.get("premium_expires_at"))
    if expiry is None:
        return False
    return expiry > utcnow()


def user_view(user: dict, used: int, limit: int) -> dict:
    premium = is_premium_active(user)
    expiry = normalize_dt(user.get("premium_expires_at"))
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user.get("name", ""),
        "picture": user.get("picture"),
        "is_premium": premium,
        "premium_expires_at": expiry.isoformat() if expiry else None,
        "subscription_status": user.get("subscription_status"),
        "cancel_at_period_end": bool(user.get("cancel_at_period_end", False)),
        "is_admin": bool(user.get("is_admin", False)),
        "daily_used": used,
        "daily_limit": limit,
    }


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _check_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


async def _issue_session(user: dict) -> dict:
    session_token = make_id("tok") + uuid.uuid4().hex
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "created_at": utcnow(),
        "expires_at": utcnow() + timedelta(days=30),
    })
    config = await get_config()
    used = await daily_usage(user["user_id"])
    return {
        "session_token": session_token,
        "user": user_view(user, used, int(config.get("daily_limit_free", 3))),
    }


@api.post("/auth/register")
async def register(payload: RegisterIn) -> dict:
    email = payload.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Please enter a valid email address")
    if len(payload.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(409, "An account with this email already exists")

    is_admin = (await db.users.count_documents({}) == 0)
    user_doc = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": email,
        "name": (payload.name or email.split("@")[0]).strip(),
        "picture": None,
        "password_hash": _hash_password(payload.password),
        "premium_expires_at": None,
        "subscription_status": None,
        "is_admin": is_admin,
        "created_at": utcnow(),
    }
    await db.users.insert_one(user_doc)
    return await _issue_session(user_doc)


@api.post("/auth/login")
async def login(payload: LoginIn) -> dict:
    email = payload.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not _check_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(401, "Incorrect email or password")
    return await _issue_session(user)


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)) -> dict:
    config = await get_config()
    used = await daily_usage(user["user_id"])
    return user_view(user, used, int(config.get("daily_limit_free", 3)))


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(default=None)) -> dict:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------
@api.get("/categories")
async def categories() -> dict:
    groups: dict[str, list[dict]] = {}
    for c in CATEGORIES:
        groups.setdefault(c["group"], []).append(c)
    return {"groups": groups, "categories": CATEGORIES, "styles": STYLES, "default_style": DEFAULT_STYLE}


# ---------------------------------------------------------------------------
# Transformation
# ---------------------------------------------------------------------------
def _pick_category(slug: str) -> dict:
    if slug == "surprise":
        import random
        return random.choice(CATEGORIES)
    if slug not in CATEGORY_LOOKUP:
        raise HTTPException(404, "Unknown category")
    return CATEGORY_LOOKUP[slug]


def _clean_b64(data: str) -> str:
    if "," in data and data.strip().startswith("data:"):
        return data.split(",", 1)[1]
    return data


async def _generate_copy(category: dict, pet_name: Optional[str], image_b64: str) -> dict:
    system = (
        "You are a witty pet biographer. Given a pet photo and a transformation theme, "
        "return STRICT JSON with keys: name (creative human-like), occupation (short funny title), "
        "personality (1 short sentence), biography (2-3 witty family-friendly sentences). "
        "Never include markdown or backticks."
    )
    prompt_text = (
        f"Pet name from owner: {pet_name or 'unknown'}\n"
        f"Theme: {category['label']} — {category['prompt']}\n"
        "Respond as JSON only."
    )
    raw = ""
    try:
        body = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{
                "role": "user",
                "parts": [
                    {"text": prompt_text},
                    {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
                ],
            }],
        }
        async with httpx.AsyncClient(timeout=60) as http:
            r = await http.post(
                
            f"{GEMINI_BASE}/gemini-3.1-flash-lite:generateContent",
                headers={"x-goog-api-key": GEMINI_API_KEY},
                json=body,
            )
        r.raise_for_status()
        parts = (r.json().get("candidates") or [{}])[0].get("content", {}).get("parts", [])
        raw = "".join(p.get("text", "") for p in parts)
    except Exception as e:
        logger.warning("copy generation failed: %s", e)
    text = str(raw).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            return {
                "name": str(data.get("name") or (pet_name or "Sir Whiskers")),
                "occupation": str(data.get("occupation") or category["label"]),
                "personality": str(data.get("personality") or "Utterly charming and unpredictable."),
                "biography": str(data.get("biography") or "A legendary tale is unfolding."),
            }
        except Exception:
            pass
    return {
        "name": pet_name or f"The {category['label']}",
        "occupation": category["label"],
        "personality": "Effortlessly charismatic with a hint of mischief.",
        "biography": f"Once an ordinary pet, now living an extraordinary life as a {category['label']}.",
    }


async def _generate_image(
    category: dict,
    pet_name: Optional[str],
    image_b64: str,
    style: dict,
) -> Optional[str]:
    """Build a preservation-aware prompt (animal vs human) and generate with Nano Banana."""
    scene = category["prompt"]
    preservation = category.get("preservation", "animal")

    if preservation == "human":
        prompt = (
            "Transform the pet in this photo into a fully HUMAN person. "
            "The human's hair color and hair texture should match the pet's coat color and pattern. "
            "The human's eye color should match the pet's exact eye color. "
            "The human's facial expression, energy and overall vibe should capture the pet's personality — "
            "the goal is a portrait where the owner instantly feels 'that's exactly who my pet would be as a person'. "
            "The subject is FULLY HUMAN — no animal ears, no snout, no fur, no tail, no whiskers, "
            "no anthropomorphic hybrid features whatsoever. Natural human anatomy and human skin. "
            f"Scene: {scene}. "
            "Family friendly."
        )
    else:
        prompt = (
            f"Transform the pet in this photo {scene}. "
            "Critically preserve the pet's exact species, breed, facial features, coat pattern, "
            "markings, eye color and expression so the owner instantly recognizes their pet. "
            "The pet remains an animal — no human face, no anthropomorphic hybrid. "
            "Family friendly."
        )

    if pet_name:
        prompt += f" The pet's name is {pet_name}."
    suffix = style.get("prompt_suffix")
    if suffix:
        prompt += f" Rendered {suffix}."

    try:
        body = {
            "contents": [{
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
                ],
            }],
            "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
        }
        async with httpx.AsyncClient(timeout=120) as http:
            r = await http.post(
                f"{GEMINI_BASE}/gemini-3.1-flash-lite-image:generateContent",
                headers={"x-goog-api-key": GEMINI_API_KEY},
                json=body,
            )
        r.raise_for_status()
        parts = (r.json().get("candidates") or [{}])[0].get("content", {}).get("parts", [])
        for p in parts:
            inline = p.get("inlineData") or p.get("inline_data")
            if inline and inline.get("data"):
                return inline["data"]
        text_out = "".join(p.get("text", "") for p in parts)
        logger.warning("image gen returned no images; text=%s", text_out[:200])
    except Exception as e:
        logger.exception("image gen failed: %s", e)
    return None


@api.post("/transform")
async def transform(payload: TransformIn, user: dict = Depends(get_current_user)) -> dict:
    config = await get_config()
    limit = int(config.get("daily_limit_free", 3))
    used = await daily_usage(user["user_id"])
    premium = is_premium_active(user)
    if not premium and used >= limit:
        raise HTTPException(402, "Daily generation limit reached. Upgrade to Premium.")

    image_b64 = _clean_b64(payload.image_base64)
    if not image_b64 or len(image_b64) < 100:
        raise HTTPException(400, "Invalid image")

    category = _pick_category(payload.category_slug)
    style_key = (payload.style or DEFAULT_STYLE).lower()
    style = STYLE_LOOKUP.get(style_key)
    if not style:
        raise HTTPException(400, "Unknown style")

    image_task = asyncio.create_task(_generate_image(category, payload.pet_name, image_b64, style))
    copy_task = asyncio.create_task(_generate_copy(category, payload.pet_name, image_b64))
    result_image, copy = await asyncio.gather(image_task, copy_task)

    if not result_image:
        raise HTTPException(502, "AI failed to generate the transformation. Please try again.")

    doc = {
        "id": make_id("tx"),
        "user_id": user["user_id"],
        "category_slug": category["slug"],
        "category_label": category["label"],
        "category_group": category["group"],
        "style": style["key"],
        "style_label": style["label"],
        "pet_name": payload.pet_name,
        "image_base64": result_image,
        "name": copy["name"],
        "occupation": copy["occupation"],
        "personality": copy["personality"],
        "biography": copy["biography"],
        "favorite": False,
        "watermark": not premium,
        "created_at": utcnow(),
    }
    await db.transformations.insert_one(doc)
    await increment_usage(user["user_id"])

    doc.pop("_id", None)
    return doc


@api.get("/transformations")
async def list_transformations(
    user: dict = Depends(get_current_user),
    favorites_only: bool = False,
    limit: int = 100,
) -> dict:
    query: dict = {"user_id": user["user_id"]}
    if favorites_only:
        query["favorite"] = True
    cursor = db.transformations.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    items = [d async for d in cursor]
    return {"items": items}


@api.get("/transformations/{tx_id}")
async def get_transformation(tx_id: str, user: dict = Depends(get_current_user)) -> dict:
    doc = await db.transformations.find_one(
        {"id": tx_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@api.post("/transformations/{tx_id}/favorite")
async def toggle_favorite(tx_id: str, user: dict = Depends(get_current_user)) -> dict:
    doc = await db.transformations.find_one(
        {"id": tx_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "Not found")
    new_val = not doc.get("favorite", False)
    await db.transformations.update_one(
        {"id": tx_id, "user_id": user["user_id"]},
        {"$set": {"favorite": new_val}},
    )
    return {"favorite": new_val}


@api.delete("/transformations/{tx_id}")
async def delete_transformation(tx_id: str, user: dict = Depends(get_current_user)) -> dict:
    res = await db.transformations.delete_one({"id": tx_id, "user_id": user["user_id"]})
    return {"deleted": res.deleted_count}


# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
@api.get("/usage")
async def usage(user: dict = Depends(get_current_user)) -> dict:
    config = await get_config()
    limit = int(config.get("daily_limit_free", 3))
    used = await daily_usage(user["user_id"])
    premium = is_premium_active(user)
    return {
        "used": used,
        "limit": limit,
        "is_premium": premium,
        "remaining": 999 if premium else max(limit - used, 0),
    }


# ---------------------------------------------------------------------------
# Billing (Stripe subscriptions + one-time content pack)
# ---------------------------------------------------------------------------
def _epoch_to_dt(ts: Optional[int]) -> Optional[datetime]:
    if not ts:
        return None
    return datetime.fromtimestamp(int(ts), tz=timezone.utc)


async def _ensure_premium_price(unit_amount_cents: int) -> str:
    """Get or create a recurring monthly Stripe Price for Premium."""
    global _PREMIUM_PRICE_ID
    if _PREMIUM_PRICE_ID:
        try:
            price = await asyncio.to_thread(stripe.Price.retrieve, _PREMIUM_PRICE_ID)
            if price and price.get("active") and price.get("unit_amount") == unit_amount_cents:
                return _PREMIUM_PRICE_ID
        except Exception:
            _PREMIUM_PRICE_ID = None

    lookup_key = f"{PREMIUM_LOOKUP_KEY}_{unit_amount_cents}"
    existing = await asyncio.to_thread(
        stripe.Price.list, lookup_keys=[lookup_key], active=True, limit=1
    )
    if existing and existing.get("data"):
        _PREMIUM_PRICE_ID = existing["data"][0]["id"]
        return _PREMIUM_PRICE_ID

    product = await asyncio.to_thread(
        stripe.Product.create,
        name="What If My Pet Was — Premium Monthly",
        metadata={"app": "what_if_my_pet", "kind": "premium_monthly"},
    )
    price = await asyncio.to_thread(
        stripe.Price.create,
        product=product["id"],
        unit_amount=unit_amount_cents,
        currency="usd",
        recurring={"interval": "month"},
        lookup_key=lookup_key,
        metadata={"app": "what_if_my_pet", "kind": "premium_monthly"},
    )
    _PREMIUM_PRICE_ID = price["id"]
    return _PREMIUM_PRICE_ID


async def _sync_subscription_state(user_id: str, subscription_id: str) -> None:
    """Fetch subscription from Stripe and mirror status + premium_expires_at on the user."""
    try:
        sub = await asyncio.to_thread(stripe.Subscription.retrieve, subscription_id)
    except Exception as e:
        logger.warning("failed to fetch subscription %s: %s", subscription_id, e)
        return
    status = sub.get("status")
    current_period_end = _epoch_to_dt(sub.get("current_period_end"))
    cancel_at_period_end = bool(sub.get("cancel_at_period_end"))
    canceled_at = _epoch_to_dt(sub.get("canceled_at"))

    update: dict[str, Any] = {
        "stripe_subscription_id": subscription_id,
        "subscription_status": status,
        "cancel_at_period_end": cancel_at_period_end,
        "subscription_canceled_at": canceled_at,
        "subscription_updated_at": utcnow(),
    }
    if current_period_end:
        update["premium_expires_at"] = current_period_end
    if sub.get("customer"):
        update["stripe_customer_id"] = sub["customer"]

    await db.users.update_one({"user_id": user_id}, {"$set": update})


@api.post("/billing/checkout")
async def checkout(payload: CheckoutIn, request: Request, user: dict = Depends(get_current_user)) -> dict:
    config = await get_config()
    origin = payload.origin.rstrip("/")
    success_url = f"{origin}/billing-success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/paywall"

    if payload.kind == "subscription":
        amount = float(config.get("price_premium_usd", 9.99))
        cents = int(round(amount * 100))
        price_id = await _ensure_premium_price(cents)
        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=user["user_id"],
            customer_email=user.get("email"),
            metadata={
                "user_id": user["user_id"],
                "kind": "subscription",
                "product": "Premium Monthly",
            },
            subscription_data={
                "metadata": {"user_id": user["user_id"], "kind": "subscription"},
            },
        )
    elif payload.kind == "pack":
        amount = float(config.get("price_pack_usd", 4.99))
        cents = int(round(amount * 100))
        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            mode="payment",
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": cents,
                        "product_data": {"name": "Content Pack"},
                    },
                    "quantity": 1,
                }
            ],
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=user["user_id"],
            customer_email=user.get("email"),
            metadata={
                "user_id": user["user_id"],
                "kind": "pack",
                "product": "Content Pack",
            },
        )
    else:
        raise HTTPException(400, "Invalid kind")

    await db.payment_transactions.insert_one({
        "session_id": session["id"],
        "user_id": user["user_id"],
        "kind": payload.kind,
        "amount": amount,
        "currency": "usd",
        "status": "initiated",
        "payment_status": "unpaid",
        "created_at": utcnow(),
        "updated_at": utcnow(),
    })
    return {"url": session["url"], "session_id": session["id"]}


@api.get("/billing/status/{session_id}")
async def billing_status(session_id: str, user: dict = Depends(get_current_user)) -> dict:
    try:
        session = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id)
    except Exception as e:
        logger.warning("stripe session retrieve failed: %s", e)
        raise HTTPException(404, "Session not found")

    payment_status = session.get("payment_status")
    status_str = session.get("status")
    mode = session.get("mode")
    subscription_id = session.get("subscription")

    doc = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if doc:
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": status_str,
                "payment_status": payment_status,
                "stripe_subscription_id": subscription_id,
                "updated_at": utcnow(),
            }},
        )
        if payment_status == "paid":
            if mode == "subscription" and subscription_id:
                await _sync_subscription_state(doc["user_id"], subscription_id)
            elif mode == "payment" and doc.get("kind") == "pack":
                await db.users.update_one(
                    {"user_id": doc["user_id"]},
                    {"$addToSet": {"content_packs": session_id},
                     "$set": {"last_pack_at": utcnow()}},
                )

    return {
        "status": status_str,
        "payment_status": payment_status,
        "amount_total": session.get("amount_total"),
        "currency": session.get("currency"),
        "mode": mode,
    }


async def _apply_event(event: dict) -> None:
    """Handle the Stripe webhook events we care about."""
    etype = event.get("type")
    data = (event.get("data") or {}).get("object") or {}

    if etype == "checkout.session.completed":
        session_id = data.get("id")
        user_id = data.get("client_reference_id") or (data.get("metadata") or {}).get("user_id")
        kind = (data.get("metadata") or {}).get("kind")
        subscription_id = data.get("subscription")
        payment_status = data.get("payment_status") or "paid"

        if session_id:
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {
                    "status": data.get("status"),
                    "payment_status": payment_status,
                    "stripe_subscription_id": subscription_id,
                    "updated_at": utcnow(),
                }},
            )
        if user_id and kind == "subscription" and subscription_id:
            await _sync_subscription_state(user_id, subscription_id)
        elif user_id and kind == "pack" and session_id:
            await db.users.update_one(
                {"user_id": user_id},
                {"$addToSet": {"content_packs": session_id},
                 "$set": {"last_pack_at": utcnow()}},
            )

    elif etype == "invoice.paid":
        # Renewal — extend expiry
        subscription_id = data.get("subscription")
        if subscription_id:
            u = await db.users.find_one({"stripe_subscription_id": subscription_id}, {"_id": 0, "user_id": 1})
            if u:
                await _sync_subscription_state(u["user_id"], subscription_id)

    elif etype == "invoice.payment_failed":
        subscription_id = data.get("subscription")
        if subscription_id:
            await db.users.update_one(
                {"stripe_subscription_id": subscription_id},
                {"$set": {
                    "subscription_status": "past_due",
                    "subscription_updated_at": utcnow(),
                }},
            )

    elif etype == "customer.subscription.updated":
        subscription_id = data.get("id")
        user_id = (data.get("metadata") or {}).get("user_id")
        if subscription_id:
            if user_id:
                await _sync_subscription_state(user_id, subscription_id)
            else:
                u = await db.users.find_one({"stripe_subscription_id": subscription_id}, {"_id": 0, "user_id": 1})
                if u:
                    await _sync_subscription_state(u["user_id"], subscription_id)

    elif etype == "customer.subscription.deleted":
        subscription_id = data.get("id")
        # Let premium lapse naturally at current_period_end — just mirror the status.
        cpe = _epoch_to_dt(data.get("current_period_end"))
        set_doc: dict[str, Any] = {
            "subscription_status": "canceled",
            "cancel_at_period_end": False,
            "subscription_canceled_at": _epoch_to_dt(data.get("canceled_at")) or utcnow(),
            "subscription_updated_at": utcnow(),
        }
        if cpe:
            set_doc["premium_expires_at"] = cpe
        await db.users.update_one(
            {"stripe_subscription_id": subscription_id},
            {"$set": set_doc},
        )


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request) -> dict:
    body = await request.body()
    signature = request.headers.get("Stripe-Signature", "")

    if not STRIPE_WEBHOOK_SECRET:
        # Fail closed: unsigned webhooks are never trusted. Set STRIPE_WEBHOOK_SECRET in env.
        logger.error("STRIPE_WEBHOOK_SECRET is not configured; rejecting webhook")
        raise HTTPException(503, "webhook not configured")
    try:
        event = stripe.Webhook.construct_event(body, signature, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logger.warning("stripe signature check failed: %s", e)
        raise HTTPException(400, "invalid signature")

    try:
        await _apply_event(event or {})
    except Exception as e:
        logger.exception("apply_event failed: %s", e)

    return {"received": True}


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only")
    return user


@api.get("/admin/config")
async def admin_get_config(_: dict = Depends(require_admin)) -> dict:
    return await get_config()


@api.put("/admin/config")
async def admin_update_config(payload: dict, _: dict = Depends(require_admin)) -> dict:
    allowed = {"daily_limit_free", "price_premium_usd", "price_pack_usd", "features"}
    update = {k: v for k, v in payload.items() if k in allowed}
    if not update:
        raise HTTPException(400, "Nothing to update")
    await db.admin_config.update_one({"_id": "singleton"}, {"$set": update}, upsert=True)
    return await get_config()


@api.get("/admin/analytics")
async def admin_analytics(_: dict = Depends(require_admin)) -> dict:
    total_users = await db.users.count_documents({})
    premium_users = await db.users.count_documents({"premium_expires_at": {"$gt": utcnow()}})
    total_generations = await db.transformations.count_documents({})
    total_favorites = await db.transformations.count_documents({"favorite": True})
    paid = await db.payment_transactions.count_documents({"payment_status": "paid"})
    return {
        "total_users": total_users,
        "premium_users": premium_users,
        "total_generations": total_generations,
        "total_favorites": total_favorites,
        "paid_transactions": paid,
    }


# ---------------------------------------------------------------------------
# Health & mount
# ---------------------------------------------------------------------------
@api.get("/")
async def root() -> dict:
    return {"ok": True, "service": "what-if-my-pet"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
