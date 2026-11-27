"""Pestaña "Búsquedas": busca ofertas laborales con Gemini + Google Search.

Usa el SDK nuevo `google-genai` SOLO acá: el SDK viejo (`google-generativeai`,
que usa el Asistente en career_agent.py) no permite la herramienta de búsqueda
de Google con los modelos actuales. El Asistente no se toca.

Flujo de run_search():
1. Tres búsquedas cortas en paralelo con Google Search (solo Neuquén / Río Negro).
   Si Gemini no usó Google de verdad (grounding vacío) no se guarda nada.
2. Se resuelven los links de las fuentes que Google usó (grounding) a links reales.
3. Otra llamada (sin buscador, con el perfil completo) evalúa las ofertas encontradas
   en JSON con nota A–F. Si el link de una oferta coincide con una fuente real,
   url_verified=True — así la UI marca cuando un link podría no existir.
4. Se descartan D/F, otras provincias y ofertas ya conocidas (cualquier estado).
5. Las nuevas se guardan con status='result'.
"""
from __future__ import annotations

import asyncio
import ipaddress
import json
import os
import re
import socket
import threading
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qsl, unquote, urlencode, urlparse

from sqlalchemy import text
from sqlmodel import Session

from modules.database import engine, now_utc, row_to_dict
from modules.gabriel_profile import GABRIEL_PROFILE

_MODEL_NAME = os.getenv("JOB_SEARCH_GEMINI_MODEL") or os.getenv("CAREER_GEMINI_MODEL", "gemini-3.5-flash")

# Una sola búsqueda a la vez (evita doble click → doble costo).
_search_lock = threading.Lock()

CV_OPTIONS = [
    "CV Petróleo y Gas / Pulling / Torre",
    "CV Automatización e Instrumentación Industrial",
    "CV Mantenimiento Industrial / Hidráulica",
    "CV Operaciones Generales / HSE / Logística",
]

_EVAL_PROMPT = """Sos un reclutador experto en Oil & Gas e industria de la Patagonia argentina.
Te paso resultados de búsquedas de Google con ofertas laborales. Tu tarea: EVALUAR cada oferta para
Gabriel Hidalgo con honestidad. NO agregues ofertas que no estén en los resultados que te paso.

PERFIL REAL DE GABRIEL (fuente única — no inventes nada fuera de esto):
""" + GABRIEL_PROFILE + """

━━━ ZONA ━━━
SOLO interesan ofertas en la provincia de Neuquén o Río Negro (Neuquén capital, Plottier, Añelo,
Rincón de los Sauces, Cutral Có, Centenario, Cipolletti, Allen, General Roca, Catriel, Vaca Muerta).
Si una oferta es de otra provincia, poné "provincia": "Otra".

━━━ ROLES OBJETIVO (en orden de prioridad) ━━━
1. Training Company Man / Técnico en formación para supervisión
2. Técnico de campo Oil & Gas con proyección
3. Operario de Pulling / Intervención de Pozos / Workover / Boca de pozo / Enganchador
4. Técnico industrial: mantenimiento, hidráulica, instrumentación, automatización
5. Cualquier otra que se ajuste al perfil

━━━ REGLAS DE EVALUACIÓN ━━━
DESCARTAR (nota F): exigen 3+ años de experiencia específica en supervisión / company man; puestos
Senior / Jefe / Gerente con experiencia previa en ese puesto como excluyente; exigen título de
ingeniero; 100% administrativos sin componente técnico.
SUMAN: Training / Trainee / Junior / Asistente / en formación; empresas con programas de carrera
(YPF, Tecpetrol, PAE, Shell, TotalEnergies, SLB, Halliburton, Weatherford); piden título técnico;
coinciden con sus certificaciones (BOP, Well Control, H2S, Altura, Coiled Tubing, Enganchador).

Escala de nota:
A = encaja casi exacto, postular ya
B = buen encaje con 1-2 ajustes menores
C = encaje parcial, vale intentar con ajuste fuerte
D = gaps importantes
F = no aplica

Sé honesto: no infles la nota. Experiencia real de Gabriel en pozo: ~1 año y 3 meses (DLS).
No digas que cumple algo que no está en su perfil.

━━━ FORMATO DE RESPUESTA ━━━
Respondé SOLO con un array JSON (sin texto antes ni después), máximo 20 ofertas, así:
[
  {
    "empresa": "nombre o 'Confidencial'",
    "puesto": "título exacto del aviso",
    "ubicacion": "localidad",
    "provincia": "Neuquén" | "Río Negro" | "Otra",
    "portal": "LinkedIn / Bumeran / ...",
    "url": "el link de la oferta copiado TAL CUAL de los resultados (no lo armes ni lo modifiques; '' si no hay)",
    "publicado": "fecha o antigüedad si aparece, si no ''",
    "score": "A" | "B" | "C" | "D" | "F",
    "cumple": ["requisito clave que cumple", "..."],
    "no_cumple": ["requisito clave que NO cumple", "..."],
    "razon": "1 línea",
    "cv_recomendado": uno de: """ + json.dumps(CV_OPTIONS, ensure_ascii=False) + """,
    "resumen_aviso": "2-5 líneas con lo que pide el aviso (tareas, requisitos, régimen)"
  }
]
Si una misma oferta aparece repetida, ponela una sola vez. Si los resultados no traen ofertas
concretas (solo listados generales sin puesto ni empresa), no las inventes. Si no hay ninguna, respondé [].
NUNCA inventes ofertas ni links."""


# ── Normalización / deduplicación ────────────────────────────────────────────

def _normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _plain(value: str | None) -> str:
    """Minúsculas, sin acentos ni signos, espacios simples. "Operario/a" → "operario"."""
    decomposed = unicodedata.normalize("NFKD", value or "")
    no_accents = "".join(ch for ch in decomposed if not unicodedata.combining(ch)).lower()
    no_gender = re.sub(r"(?<=[a-z])\s*/\s*(?:a|o|as|os|e|es)\b", "", no_accents)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", no_gender)).strip()


def dedupe_key(company: str | None, title: str | None) -> str:
    """'helmerich|enganchador de perforacion' — tolera "Helmerich & Payne (H&P)" vs
    "Helmerich & Payne", acentos y mayúsculas. Debe coincidir con la migración 0014."""
    company_words = _plain(re.sub(r"\(.*?\)", " ", company or "")).split()
    return f"{company_words[0] if company_words else ''}|{_plain(title)}"


_TRACKING_PARAMS = re.compile(r"^(utm_.*|fbclid|gclid|refid|trackingid|ref|src|from|position|pagenum|trk.*)$", re.I)


def url_key(url: str | None) -> str | None:
    """Link normalizado: host+path en minúsculas, sin fragment ni '/' final.

    Conserva los parámetros que identifican el aviso (ej. Indeed ?jk=...) y saca
    los de seguimiento (utm_*, refId...). Sin esto, cualquier link inventado de
    "indeed.com/viewjob?jk=..." coincidiría con uno real.
    """
    if not url:
        return None
    try:
        parsed = urlparse(url.strip())
        params = parse_qsl(parsed.query, keep_blank_values=False)
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    host = parsed.hostname.lower().removeprefix("www.")
    path = parsed.path.rstrip("/").lower()
    query = urlencode(sorted((k.lower(), v) for k, v in params if not _TRACKING_PARAMS.match(k)))
    return f"{host}{path}" + (f"?{query}" if query else "")


def _is_specific_page(url: str | None) -> bool:
    """False para la portada de un sitio (ej. 'https://ar.jooble.org/'): no es un aviso."""
    try:
        parsed = urlparse(url or "")
    except ValueError:
        return False
    return len(parsed.path.strip("/")) > 0 or bool(parsed.query)


def _url_key_loose(url: str | None) -> str | None:
    """Igual que url_key pero con el path decodificado (para comparar fuentes)."""
    key = url_key(url)
    return unquote(key) if key else None


# ── Grounding: links reales que usó Google ───────────────────────────────────

_REDIRECT_HOST = "vertexaisearch.cloud.google.com"


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def _resolve_redirect(uri: str) -> str | None:
    """Los links del grounding son redirecciones de Google → devuelve el destino real.

    Solo se consulta el host de redirección de Google (no se visita el portal).
    """
    import requests

    try:
        if _host(uri) != _REDIRECT_HOST:
            return uri
        resp = requests.head(uri, allow_redirects=False, timeout=6)
        return resp.headers.get("Location") or None
    except Exception:
        return None


def _grounding_uris(response) -> list[str]:
    """Links (redirecciones de Google) de las páginas que la búsqueda usó de verdad."""
    uris: list[str] = []
    try:
        for cand in response.candidates or []:
            meta = getattr(cand, "grounding_metadata", None)
            for chunk in (getattr(meta, "grounding_chunks", None) or []):
                web = getattr(chunk, "web", None)
                if web and getattr(web, "uri", None):
                    uris.append(web.uri)
    except Exception:
        return []
    return list(dict.fromkeys(uris))


def _resolve_many(uris: list[str]) -> dict[str, str]:
    """{link de redirección → link real}. Máx. 90 para no demorar."""
    uris = list(dict.fromkeys(uris))[:90]
    if not uris:
        return {}
    with ThreadPoolExecutor(max_workers=12) as pool:
        resolved = list(pool.map(_resolve_redirect, uris))
    return {u: r for u, r in zip(uris, resolved) if r}


# ── Chequeo de que el link exista ────────────────────────────────────────────

_BLOCKED_NETS = [ipaddress.ip_network(n) for n in (
    "127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
    "169.254.0.0/16", "0.0.0.0/8", "::1/128", "fc00::/7", "fe80::/10",
)]
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)


def _is_public_host(host: str) -> bool:
    """Evita que un link raro haga que el servidor consulte direcciones internas."""
    try:
        for info in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP):
            ip = ipaddress.ip_address(info[4][0])
            if any(ip in net for net in _BLOCKED_NETS):
                return False
        return True
    except (socket.gaierror, ValueError):
        return False


def _check_live(url: str) -> str:
    """'ok' (respondió 200 — NO garantiza que el aviso exista), 'broken' (404/410 o
    te manda a la portada) o 'unknown'.

    Muchos portales bloquean consultas automáticas (403/429/999) → 'unknown',
    que no es lo mismo que roto: el link se deja, marcado como "sin confirmar".
    """
    import requests

    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return "broken"
        if not _is_public_host(parsed.hostname):
            return "unknown"
        resp = requests.get(
            url, timeout=7, allow_redirects=True, stream=True,
            headers={"User-Agent": _BROWSER_UA, "Accept-Language": "es-AR,es;q=0.9"},
        )
        resp.close()
        if resp.status_code in (404, 410):
            return "broken"
        if 200 <= resp.status_code < 300:
            # Aviso vencido: muchos portales redirigen a la portada o al listado
            if resp.history and not _is_specific_page(resp.url):
                return "broken"
            return "ok"
        return "unknown"
    except Exception:
        return "unknown"


def _check_many(urls: list[str]) -> dict[str, str]:
    urls = list(dict.fromkeys(u for u in urls if u))[:30]
    if not urls:
        return {}
    with ThreadPoolExecutor(max_workers=10) as pool:
        return dict(zip(urls, pool.map(_check_live, urls)))


# ── Parseo de la respuesta ───────────────────────────────────────────────────

def _extract_json_array(raw: str) -> list[dict]:
    raw = (raw or "").strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", raw, re.DOTALL)
    if fence:
        raw = fence.group(1).strip()
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end <= start:
        return []
    try:
        data = json.loads(raw[start:end + 1])
    except json.JSONDecodeError:
        return []
    return [d for d in data if isinstance(d, dict)] if isinstance(data, list) else []


def _as_lines(value) -> str:
    if isinstance(value, list):
        return "\n".join(str(v).strip() for v in value if str(v).strip())
    return str(value or "").strip()


def _clean_offer(item: dict, verified_keys: set[str], redirects: dict[str, str] | None = None) -> dict | None:
    title = str(item.get("puesto") or "").strip()
    if not title:
        return None
    score = str(item.get("score") or "").strip().upper()[:1]
    if score not in {"A", "B", "C", "D", "F"}:
        score = "C"
    provincia = _normalize_text(item.get("provincia"))
    url = str(item.get("url") or "").strip() or None
    # Gemini a veces devuelve el link de redirección de Google → se cambia por el real
    if url and redirects and url in redirects:
        url = redirects[url]
    if url and _host(url) == _REDIRECT_HOST:
        url = None  # redirección que no se pudo resolver: no sirve como link
    key = url_key(url)
    if url and not key:
        url = None
    cv = str(item.get("cv_recomendado") or "").strip()
    return {
        "title": title[:300],
        "company": (str(item.get("empresa") or "").strip() or "Confidencial")[:200],
        "location": str(item.get("ubicacion") or "").strip()[:200],
        "provincia": provincia,
        "source": str(item.get("portal") or "").strip()[:100],
        "url": url,
        "url_key": key,
        "posted_text": str(item.get("publicado") or "").strip()[:100],
        "score": score,
        "meets": _as_lines(item.get("cumple"))[:2000],
        "gaps": _as_lines(item.get("no_cumple"))[:2000],
        "reason": str(item.get("razon") or "").strip()[:500],
        "cv_recommended": cv if cv in CV_OPTIONS else None,
        "aviso_summary": str(item.get("resumen_aviso") or "").strip()[:3000],
        "url_verified": bool(key and _is_specific_page(url) and unquote(key) in verified_keys),
    }


_ALLOWED_PROVINCES = {"neuquén", "neuquen", "río negro", "rio negro"}


# ── Búsqueda principal ───────────────────────────────────────────────────────

def _known_offers_hint(db: Session) -> str:
    rows = db.execute(text("""
        SELECT company, title FROM job_offers ORDER BY updated_at DESC LIMIT 40
    """)).fetchall()
    if not rows:
        return ""
    lines = "\n".join(f"- {r[0] or 'Confidencial'} — {r[1]}" for r in rows)
    return f"\n\nYa conozco estas ofertas, NO las repitas (buscá otras):\n{lines}"


def _client():
    from google import genai
    return genai.Client(api_key=os.environ["GEMINI_API_KEY"])


# Paso 1 — búsquedas cortas y en paralelo. Con instrucciones largas Gemini tiende a
# contestar "de memoria" sin buscar; con un pedido corto y directo sí usa Google.
_SEARCH_TOPICS = [
    "operario de pulling, boca de pozo, enganchador, workover, intervención de pozos o perforación",
    "company man trainee, técnico petróleo, técnico de campo o asistente de supervisión en Oil & Gas",
    "técnico de mantenimiento, hidráulica, instrumentación, automatización u operador de planta industrial",
]


def _search_prompt(topic: str, known_hint: str) -> str:
    return (
        f"Buscá en Google ofertas de trabajo ACTIVAS (publicadas en los últimos 30 días) de {topic}, "
        "en Neuquén o Río Negro, Argentina (Neuquén capital, Añelo, Plottier, Rincón de los Sauces, "
        "Cutral Có, Centenario, Cipolletti, Allen, General Roca, Catriel, Vaca Muerta). "
        "Hacé varias búsquedas en portales como LinkedIn, Bumeran, Computrabajo, ZonaJobs, Indeed, "
        "empleopetrolero y los sitios de empleo de las empresas. "
        "Listá todas las ofertas concretas que encuentres (máximo 10). Para cada una: empresa, puesto, "
        "localidad, portal, link a la oferta, fecha de publicación si aparece, y qué pide "
        "(tareas, requisitos, experiencia, régimen). Solo ofertas que aparezcan en los resultados."
        + known_hint
    )


async def _search_once(topic: str, known_hint: str):
    from google.genai import types

    return await _client().aio.models.generate_content(
        model=_MODEL_NAME,
        contents=_search_prompt(topic, known_hint),
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.2,
        ),
    )


async def _search_topic(topic: str, known_hint: str) -> tuple[str, list[str]]:
    """Devuelve (texto con las ofertas, links de grounding). Reintenta 1 vez si no buscó."""
    for attempt in range(2):
        try:
            resp = await _search_once(topic, known_hint)
        except Exception as exc:
            print(f"[job_search] Error buscando '{topic[:40]}…' (intento {attempt + 1}): {exc!r}")
            continue
        uris = _grounding_uris(resp)
        if uris:
            return resp.text or "", uris
        print(f"[job_search] '{topic[:40]}…' intento {attempt + 1}: Gemini no usó Google Search.")
    return "", []


# Paso 2 — evaluación con el perfil completo (sin buscador): solo puede usar lo encontrado.
async def _evaluate(results_text: str) -> list[dict]:
    from google.genai import types

    resp = await _client().aio.models.generate_content(
        model=_MODEL_NAME,
        contents="RESULTADOS DE BÚSQUEDA:\n\n" + results_text,
        config=types.GenerateContentConfig(
            system_instruction=_EVAL_PROMPT,
            temperature=0.2,
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW),
        ),
    )
    return _extract_json_array(resp.text or "")


class SearchBusyError(RuntimeError):
    pass


class NoGroundingError(RuntimeError):
    pass


async def run_search() -> dict:
    """Busca ofertas nuevas y las guarda como status='result'. Devuelve un resumen."""
    if not _search_lock.acquire(blocking=False):
        raise SearchBusyError("Ya hay una búsqueda en curso. Esperá a que termine.")
    try:
        with Session(engine) as db:
            hint = _known_offers_hint(db)

        # Paso 1: búsquedas en paralelo (cada una con su reintento)
        results = await asyncio.gather(*(_search_topic(t, hint) for t in _SEARCH_TOPICS))
        grounding = [u for _, uris in results for u in uris]
        texts = [t for t, uris in results if uris and t.strip()]
        if not grounding or not texts:
            # Sin búsqueda real no se guarda nada: las ofertas podrían ser inventadas.
            raise NoGroundingError(
                "La IA no llegó a buscar en Google esta vez (para no mostrarte ofertas "
                "inventadas, no se guardó nada). Probá de nuevo en un rato."
            )

        # Links de Google (redirecciones) → links reales, y se reemplazan en el texto
        redirects = await asyncio.to_thread(_resolve_many, grounding)
        results_text = "\n\n---\n\n".join(texts)
        for short, real in redirects.items():
            results_text = results_text.replace(short, real)
        sources = list(dict.fromkeys(redirects.values()))
        verified_keys = {k for k in (_url_key_loose(u) for u in sources) if k}

        # Paso 2: evaluación A–F con el perfil
        items = await _evaluate(results_text)

        found = len(items)
        low_score = other_zone = known = broken_links = 0
        run_at = now_utc()
        inserted_ids: list[int] = []

        candidates: list[dict] = []
        for item in items:
            offer = _clean_offer(item, verified_keys, redirects)
            if not offer:
                continue
            if offer["score"] in {"D", "F"}:
                low_score += 1
                continue
            if offer["provincia"] and offer["provincia"] not in _ALLOWED_PROVINCES:
                other_zone += 1
                continue
            candidates.append(offer)

        # Links que Google no confirmó: se abren para ver si existen. Rotos → se quitan
        # (la UI ofrece "Buscar en Google" en su lugar). Un 200 NO confirma: Bumeran,
        # Computrabajo y ZonaJobs responden 200 aunque el aviso no exista (probado).
        to_check = [o["url"] for o in candidates if o["url"] and not o["url_verified"]]
        live = await asyncio.to_thread(_check_many, to_check)
        for offer in candidates:
            if live.get(offer["url"] or "") == "broken":
                broken_links += 1
                offer["url"] = offer["url_key"] = None

        with Session(engine) as db:
            for offer in candidates:
                dkey = dedupe_key(offer["company"], offer["title"])
                exists = db.execute(
                    text("""
                        SELECT 1 FROM job_offers
                        WHERE dedupe_key = :dkey OR (CAST(:ukey AS TEXT) IS NOT NULL AND url_key = :ukey)
                        LIMIT 1
                    """),
                    {"dkey": dkey, "ukey": offer["url_key"]},
                ).fetchone()
                if exists:
                    known += 1
                    continue
                new_id = db.execute(
                    text("""
                        INSERT INTO job_offers (title, company, location, source, url, url_key, dedupe_key,
                                                posted_text, score, meets, gaps, reason, cv_recommended,
                                                aviso_summary, url_verified, status, search_run_at,
                                                created_at, updated_at)
                        VALUES (:title, :company, :location, :source, :url, :url_key, :dkey,
                                :posted_text, :score, :meets, :gaps, :reason, :cv_recommended,
                                :aviso_summary, :url_verified, 'result', :run_at, :run_at, :run_at)
                        ON CONFLICT DO NOTHING
                        RETURNING id
                    """),
                    {**{k: v for k, v in offer.items() if k != "provincia"}, "dkey": dkey, "run_at": run_at},
                ).fetchone()
                if new_id:
                    inserted_ids.append(int(new_id[0]))
                else:
                    known += 1
            db.commit()

        return {
            "found": found,
            "new": len(inserted_ids),
            "already_known": known,
            "low_score": low_score,
            "other_zone": other_zone,
            "broken_links": broken_links,
            "sources": len(sources),
            "run_at": run_at.isoformat(),
        }
    finally:
        _search_lock.release()


# ── Listado y actualización ──────────────────────────────────────────────────

FOLLOW_UP_DAYS = 7
_FOLLOW_UP_STATES = ("postulado", "en_proceso")


def list_offers(status: str) -> list[dict]:
    order = (
        "CASE score WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END, created_at DESC"
        if status == "result" else "updated_at DESC"
    )
    with Session(engine) as db:
        rows = db.execute(
            text(f"""
                SELECT *,
                       COALESCE(last_contact_at, applied_at) AS follow_up_base,
                       COALESCE(application_status = ANY(:fu_states)
                        AND COALESCE(last_contact_at, applied_at) <= now() - make_interval(days => :days),
                        FALSE) AS follow_up_due
                FROM job_offers
                WHERE status = :status
                ORDER BY {order}
                LIMIT 300
            """),
            {"status": status, "days": FOLLOW_UP_DAYS, "fu_states": list(_FOLLOW_UP_STATES)},
        ).fetchall()
    return [row_to_dict(r) for r in rows]


def get_offer(offer_id: int) -> dict | None:
    with Session(engine) as db:
        row = db.execute(text("SELECT * FROM job_offers WHERE id = :id"), {"id": offer_id}).fetchone()
    return row_to_dict(row) if row else None


def update_offer(offer_id: int, payload) -> dict | None:
    current = get_offer(offer_id)
    if not current:
        return None
    now = now_utc()
    fields: dict = {}

    if payload.status is not None:
        fields["status"] = payload.status
        if payload.status == "saved" and not current.get("application_status") and payload.application_status is None:
            fields["application_status"] = "pendiente"

    if payload.application_status is not None:
        fields["application_status"] = payload.application_status
        if payload.application_status == "postulado" and not current.get("applied_at"):
            fields["applied_at"] = now
        if payload.application_status in ("en_proceso", "entrevista"):
            fields["last_contact_at"] = now

    if payload.notes is not None:
        fields["notes"] = payload.notes
    if payload.career_session_id is not None:
        fields["career_session_id"] = payload.career_session_id
    if payload.follow_up_done:
        fields["last_contact_at"] = now

    if not fields:
        return current
    fields["updated_at"] = now
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    with Session(engine) as db:
        db.execute(text(f"UPDATE job_offers SET {sets} WHERE id = :id"), {**fields, "id": offer_id})
        db.commit()
    return get_offer(offer_id)
