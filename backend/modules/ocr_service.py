from __future__ import annotations

import base64
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from urllib import error as urllib_error
from urllib import request as urllib_request
from xml.etree import ElementTree as ET

from modules.crm_service import (
    VALID_EMAIL_RE,
    clean_optional,
    normalize_decision,
    normalize_next_action,
    normalize_status,
)


EMAIL_RE = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.IGNORECASE)

GENERIC_CONTACT_TOKENS = {
    "admin", "careers", "contact", "contacto", "empleo", "hr", "info",
    "jobs", "noreply", "no-reply", "postulaciones", "recepcion",
    "recruiting", "rrhh", "soporte", "support", "talent", "ventas",
}

DOMAIN_OVERRIDES = {
    "bhge": "Baker Hughes",
    "slb": "SLB",
    "tgs": "TGS",
    "ypf": "YPF",
}


# ---------------------------------------------------------------------------
# Runtime capabilities
# ---------------------------------------------------------------------------

def get_runtime_capabilities() -> dict:
    tesseract_path = resolve_tesseract_path()
    openai_enabled = bool(os.getenv("OPENAI_API_KEY"))
    providers = []
    if tesseract_path:
        providers.append("tesseract")
    if openai_enabled:
        providers.append("openai")
    return {
        "tesseract_available": bool(tesseract_path),
        "tesseract_path": tesseract_path,
        "openai_enabled": openai_enabled,
        "providers": providers,
    }


def resolve_tesseract_path() -> str | None:
    direct = shutil.which("tesseract")
    if direct:
        return direct
    common_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for candidate in common_paths:
        if os.path.exists(candidate):
            return candidate
    return None


# ---------------------------------------------------------------------------
# File extraction
# ---------------------------------------------------------------------------

def extract_candidates_from_file(filename: str, mime_type: str, raw_bytes: bytes) -> dict:
    capabilities = get_runtime_capabilities()
    warnings: list[str] = []
    extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    text = ""
    provider = "direct"

    if mime_type.startswith("text/") or extension in {"txt", "csv"}:
        text = decode_text(raw_bytes)
    elif extension == "xlsx" or "spreadsheetml" in mime_type:
        text = extract_text_from_xlsx(raw_bytes)
    elif extension == "pdf" or mime_type == "application/pdf":
        text = extract_text_from_pdf(raw_bytes)
        if EMAIL_RE.search(text or ""):
            provider = "pdf_text"
        elif capabilities["openai_enabled"]:
            try:
                text = extract_text_with_openai(raw_bytes, filename, mime_type)
                provider = "openai_pdf"
            except Exception as exc:
                warnings.append(f"No pude hacer OCR del PDF por API: {exc}")
        else:
            warnings.append(
                "No pude sacar texto util del PDF. Si es escaneado, agrega OPENAI_API_KEY o instala OCR local."
            )
    elif mime_type.startswith("image/") or extension in {"png", "jpg", "jpeg", "gif", "webp"}:
        if capabilities["tesseract_available"]:
            try:
                text = extract_text_with_tesseract(raw_bytes, extension, capabilities["tesseract_path"])
                provider = "tesseract"
            except Exception as exc:
                warnings.append(f"No pude hacer OCR local con Tesseract: {exc}")
        elif capabilities["openai_enabled"]:
            try:
                text = extract_text_with_openai(raw_bytes, filename, mime_type)
                provider = "openai_image"
            except Exception as exc:
                warnings.append(f"No pude hacer OCR de la imagen por API: {exc}")
        else:
            warnings.append("Las imagenes necesitan OCR local o OPENAI_API_KEY para extraer texto.")
    else:
        text = decode_text(raw_bytes)

    emails = extract_emails(text)
    if not emails and capabilities["openai_enabled"] and provider in {"direct", "pdf_text"} and extension == "pdf":
        try:
            text = extract_text_with_openai(raw_bytes, filename, mime_type)
            provider = "openai_pdf"
            emails = extract_emails(text)
        except Exception as exc:
            warnings.append(f"No pude reintentar el PDF con OpenAI: {exc}")

    return {
        "filename": filename,
        "mime_type": mime_type,
        "text": text,
        "emails": emails,
        "warnings": warnings,
        "provider": provider,
        "capabilities": capabilities,
        "notes": build_extraction_notes(filename, warnings, len(emails), provider),
    }


def build_extraction_notes(filename: str, warnings: list[str], total_emails: int, provider: str) -> str:
    note = f"Preview generada desde {filename}. {total_emails} correos detectados. Motor: {provider}."
    if warnings:
        note = f"{note} {' '.join(warnings)}"
    return note


def decode_text(raw_bytes: bytes) -> str:
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            return raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode("utf-8", errors="ignore")


def extract_text_with_tesseract(raw_bytes: bytes, extension: str, tesseract_path: str | None) -> str:
    if not tesseract_path:
        raise RuntimeError("Tesseract no esta instalado.")
    suffix = f".{extension}" if extension else ".img"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
        handle.write(raw_bytes)
        temp_input = handle.name
    try:
        result = subprocess.run(
            [tesseract_path, temp_input, "stdout", "-l", "spa+eng"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            message = result.stderr.strip() or "OCR local fallo."
            raise RuntimeError(message)
        return result.stdout
    finally:
        try:
            os.remove(temp_input)
        except OSError:
            pass


def extract_text_with_openai(raw_bytes: bytes, filename: str, mime_type: str) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY no esta configurada.")

    prompt = (
        "Extrae todo el texto visible del archivo y prioriza correos electronicos. "
        "Devuelve texto plano legible, sin markdown."
    )
    payload = {
        "model": os.getenv("OPENAI_OCR_MODEL", "gpt-4.1-mini"),
        "input": [
            {
                "role": "user",
                "content": build_openai_content(prompt, raw_bytes, filename, mime_type),
            }
        ],
    }
    request = urllib_request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib_request.urlopen(request, timeout=90) as response:
            raw_response = response.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"OpenAI devolvio {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"No pude conectar con OpenAI: {exc.reason}") from exc

    parsed = json.loads(raw_response)
    text = collect_openai_output_text(parsed)
    if not text.strip():
        raise RuntimeError("OpenAI no devolvio texto util.")
    return text


def build_openai_content(prompt: str, raw_bytes: bytes, filename: str, mime_type: str) -> list[dict]:
    file_data = base64.b64encode(raw_bytes).decode("ascii")
    if mime_type.startswith("image/"):
        return [
            {"type": "input_text", "text": prompt},
            {"type": "input_image", "image_url": f"data:{mime_type};base64,{file_data}"},
        ]
    return [
        {"type": "input_text", "text": prompt},
        {"type": "input_file", "filename": filename, "file_data": f"data:{mime_type};base64,{file_data}"},
    ]


def collect_openai_output_text(payload: dict) -> str:
    fragments: list[str] = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                fragments.append(content.get("text", ""))
    if fragments:
        return "\n".join(fragment for fragment in fragments if fragment)
    return str(payload.get("output_text", "") or "")


def extract_text_from_pdf(raw_bytes: bytes) -> str:
    return raw_bytes.decode("latin-1", errors="ignore")


def extract_text_from_xlsx(raw_bytes: bytes) -> str:
    namespace = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    shared_strings: list[str] = []
    text_chunks: list[str] = []
    with zipfile.ZipFile(io.BytesIO(raw_bytes)) as archive:
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("main:si", namespace):
                shared_strings.append("".join(item.itertext()))
        for name in archive.namelist():
            if not name.startswith("xl/worksheets/") or not name.endswith(".xml"):
                continue
            root = ET.fromstring(archive.read(name))
            for cell in root.findall(".//main:c", namespace):
                cell_type = cell.attrib.get("t")
                value_node = cell.find("main:v", namespace)
                if value_node is None or value_node.text is None:
                    continue
                value = value_node.text
                if cell_type == "s":
                    try:
                        text_chunks.append(shared_strings[int(value)])
                    except (ValueError, IndexError):
                        text_chunks.append(value)
                else:
                    text_chunks.append(value)
    return "\n".join(text_chunks)


def extract_emails(text: str) -> list[str]:
    return [match.lower() for match in EMAIL_RE.findall(text or "")]


# ---------------------------------------------------------------------------
# Domain inference
# ---------------------------------------------------------------------------

def infer_company(domain: str) -> str | None:
    clean_domain = domain.lower().strip()
    if not clean_domain:
        return None
    if clean_domain in DOMAIN_OVERRIDES:
        return DOMAIN_OVERRIDES[clean_domain]
    parts = [part for part in clean_domain.split(".") if part]
    if len(parts) >= 3 and parts[-2] in {"com", "org", "net", "gov"}:
        base = parts[-3]
    elif len(parts) >= 2:
        base = parts[-2]
    else:
        base = parts[0]
    if base in DOMAIN_OVERRIDES:
        return DOMAIN_OVERRIDES[base]
    if len(base) <= 4:
        return base.upper()
    return base.replace("-", " ").title()


def infer_contact(email: str) -> str:
    local_part = email.split("@", 1)[0]
    normalized = re.sub(r"[0-9]+", " ", local_part)
    normalized = re.sub(r"[._-]+", " ", normalized).strip()
    if not normalized:
        return "A quien corresponda"
    parts = [part for part in normalized.split() if part]
    if not parts:
        return "A quien corresponda"
    if any(part.lower() in GENERIC_CONTACT_TOKENS for part in parts):
        return "A quien corresponda"
    if all(len(part) <= 2 for part in parts):
        return "A quien corresponda"
    return " ".join(part.capitalize() for part in parts)


def infer_status(contact: str) -> str:
    return "revisar" if contact == "A quien corresponda" else "mantener"


def infer_next_action(status: str | None, decision: str | None) -> str:
    normalized_status = normalize_status(status)
    normalized_decision = normalize_decision(decision)
    if normalized_decision in {"duplicate", "invalid"}:
        return "descartar"
    if normalized_status == "portal":
        return "portal"
    if normalized_status == "prioridad":
        return "seguir"
    if normalized_status == "revisar":
        return "revisar_manual"
    if normalized_status == "seguimiento":
        return "seguir"
    if normalized_status == "sacar":
        return "descartar"
    return "enviar"


def build_suggested_message(candidate: dict) -> str:
    company = candidate.get("company") or "la empresa"
    name = candidate.get("name") or "A quien corresponda"
    next_action = normalize_next_action(candidate.get("next_action"))
    if next_action == "portal":
        return f"Revisar si {company} deriva a portal y cargar CV antes de reenviar correo."
    if next_action == "seguir":
        return f"Hacer seguimiento corto a {name} en {company} con recordatorio y CV actualizado."
    if next_action == "descartar":
        return f"No insistir con este contacto en {company}; dejarlo fuera de la siguiente corrida."
    if next_action == "revisar_manual":
        return f"Revisar manualmente el contacto de {company} antes de enviar."
    return f"Enviar presentacion breve a {name} en {company} con CV adjunto."


# ---------------------------------------------------------------------------
# Candidate preparation & classification
# ---------------------------------------------------------------------------

def prepare_candidates(extraction: dict, existing_emails: set[str]) -> list[dict]:
    seen_in_file: set[str] = set()
    prepared: list[dict] = []

    for email in sorted(set(extraction["emails"])):
        normalized_email = email.strip().lower() or None
        if not normalized_email:
            continue

        domain = normalized_email.split("@", 1)[1] if "@" in normalized_email else ""
        company = infer_company(domain)
        contact = infer_contact(normalized_email)
        decision = "approve"
        reason = ""
        status = infer_status(contact)

        if normalized_email in existing_emails or normalized_email in seen_in_file:
            decision = "duplicate"
            reason = "El correo ya existe en la base o se repite dentro del archivo."
        elif not VALID_EMAIL_RE.fullmatch(normalized_email):
            decision = "invalid"
            reason = "Formato de email invalido."

        seen_in_file.add(normalized_email)
        prepared.append(
            {
                "email": normalized_email,
                "name": contact,
                "company": company,
                "title": None,
                "status": status,
                "source": "importacion",
                "notes": None,
                "raw_text": normalized_email,
                "decision": decision,
                "reason": reason,
            }
        )

    if not prepared and extraction["warnings"]:
        prepared.append(
            {
                "email": None,
                "name": "A quien corresponda",
                "company": None,
                "title": None,
                "status": "revisar",
                "source": "importacion",
                "notes": "No hubo correos detectables en este archivo.",
                "raw_text": extraction["filename"],
                "decision": "invalid",
                "reason": extraction["warnings"][0],
            }
        )
    return prepared


def classify_candidates(candidates: list[dict], *, capabilities: dict) -> tuple[list[dict], str]:
    classified = [dict(candidate) for candidate in candidates]
    classified = [apply_heuristic_classification(candidate) for candidate in classified]

    if capabilities.get("openai_enabled"):
        try:
            return classify_candidates_with_openai(classified), "openai"
        except Exception:
            return classified, "heuristic"
    return classified, "heuristic"


def apply_heuristic_classification(candidate: dict) -> dict:
    if candidate["decision"] in {"duplicate", "invalid"}:
        candidate["next_action"] = infer_next_action(candidate["status"], candidate["decision"])
        candidate["suggested_message"] = build_suggested_message(candidate)
        return candidate

    email = candidate.get("email") or ""
    name = candidate.get("name") or ""
    company = candidate.get("company") or ""
    local_part = email.split("@", 1)[0].lower() if email else ""

    if name == "A quien corresponda":
        candidate["status"] = "revisar"
        candidate["reason"] = candidate["reason"] or "Contacto generico; conviene revisar antes de enviar."
        candidate["next_action"] = infer_next_action(candidate["status"], candidate["decision"])
        candidate["suggested_message"] = build_suggested_message(candidate)
        return candidate

    if any(token in local_part for token in ("career", "jobs", "empleo", "postul")):
        candidate["status"] = "portal"
        candidate["reason"] = candidate["reason"] or "El correo parece orientado a empleo o portal."
        candidate["next_action"] = infer_next_action(candidate["status"], candidate["decision"])
        candidate["suggested_message"] = build_suggested_message(candidate)
        return candidate

    if company in {"SLB", "YPF", "TGS"}:
        candidate["status"] = "prioridad"
        candidate["reason"] = candidate["reason"] or "Empresa prioritaria detectada por dominio."
        candidate["next_action"] = infer_next_action(candidate["status"], candidate["decision"])
        candidate["suggested_message"] = build_suggested_message(candidate)
        return candidate

    candidate["status"] = candidate["status"] or "mantener"
    candidate["reason"] = candidate["reason"] or "Clasificacion inicial por heuristica local."
    candidate["next_action"] = infer_next_action(candidate["status"], candidate["decision"])
    candidate["suggested_message"] = build_suggested_message(candidate)
    return candidate


def classify_candidates_with_openai(candidates: list[dict]) -> list[dict]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY no esta configurada.")

    prompt = (
        "Clasifica cada contacto en uno de estos estados: mantener, revisar, seguimiento, prioridad, sacar, portal. "
        "Ademas propone next_action en uno de estos valores: enviar, seguir, portal, descartar, revisar_manual. "
        "Tambien devolve suggested_message corto para usar como siguiente paso. "
        "Devuelve JSON valido con la forma {'items':[{'email':'...','status':'...','reason':'...','next_action':'...','suggested_message':'...'}]}. "
        "Usa reasons cortos y concretos. No inventes emails."
    )
    compact_candidates = [
        {
            "email": candidate.get("email"),
            "name": candidate.get("name"),
            "company": candidate.get("company"),
            "decision": candidate.get("decision"),
            "reason": candidate.get("reason"),
        }
        for candidate in candidates
        if candidate.get("email")
    ]
    payload = {
        "model": os.getenv("OPENAI_CLASSIFIER_MODEL", os.getenv("OPENAI_OCR_MODEL", "gpt-4.1-mini")),
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_text", "text": json.dumps(compact_candidates, ensure_ascii=False)},
                ],
            }
        ],
    }
    request = urllib_request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib_request.urlopen(request, timeout=90) as response:
            raw_response = response.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"OpenAI devolvio {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"No pude conectar con OpenAI: {exc.reason}") from exc

    text = collect_openai_output_text(json.loads(raw_response))
    items = parse_json_items(text)
    by_email = {item.get("email"): item for item in items if item.get("email")}

    for candidate in candidates:
        match = by_email.get(candidate.get("email"))
        if not match:
            candidate["next_action"] = infer_next_action(candidate.get("status"), candidate.get("decision"))
            candidate["suggested_message"] = build_suggested_message(candidate)
            continue
        candidate["status"] = normalize_status(match.get("status", candidate.get("status")))
        candidate["reason"] = clean_optional(match.get("reason")) or candidate.get("reason")
        candidate["next_action"] = normalize_next_action(match.get("next_action"))
        candidate["suggested_message"] = clean_optional(match.get("suggested_message")) or build_suggested_message(candidate)
    return candidates


def parse_json_items(text: str) -> list[dict]:
    cleaned = text.strip()
    if not cleaned:
        return []
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            return []
        parsed = json.loads(match.group(0))
    items = parsed.get("items") if isinstance(parsed, dict) else parsed
    return items if isinstance(items, list) else []


def summarize_candidates(candidates: list[dict]) -> dict:
    return {
        "total_contacts": len([item for item in candidates if item.get("email")]),
        "total_ready": sum(1 for item in candidates if item["decision"] == "approve"),
        "total_duplicates": sum(1 for item in candidates if item["decision"] == "duplicate"),
        "total_invalid": sum(1 for item in candidates if item["decision"] == "invalid"),
    }
