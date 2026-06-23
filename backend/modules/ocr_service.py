from __future__ import annotations

import io
import json
import os
import re
import zipfile
from xml.etree import ElementTree as ET

import openai

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
    openai_enabled = bool(os.getenv("OPENAI_API_KEY"))
    ocr_space_enabled = bool(os.getenv("OCR_SPACE_API_KEY"))
    providers = []
    if openai_enabled:
        providers.append("openai")
    if ocr_space_enabled:
        providers.append("ocr_space")
    return {
        "openai_enabled": openai_enabled,
        "ocr_space_enabled": ocr_space_enabled,
        "providers": providers,
    }


def _openai_client() -> openai.OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY no esta configurada.")
    return openai.OpenAI(api_key=api_key)


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
        # Siempre intentar extracción local primero (gratis, sin API)
        text = extract_text_from_pdf(raw_bytes)
        if EMAIL_RE.search(text or ""):
            provider = "pdf_text"
        elif capabilities["openai_enabled"]:
            # Solo usar OpenAI si el PDF es escaneado y no tiene texto extraíble
            try:
                text = extract_text_with_openai(raw_bytes, filename, mime_type)
                provider = "openai_pdf"
            except Exception as exc:
                exc_str = str(exc)
                if "429" in exc_str or "insufficient_quota" in exc_str or "quota" in exc_str.lower():
                    warnings.append(
                        "El PDF no tiene texto extraíble y la cuota de OpenAI está agotada. "
                        "Recargá créditos en platform.openai.com para procesar PDFs escaneados."
                    )
                else:
                    warnings.append(f"OpenAI no pudo procesar el PDF: {exc_str[:120]}")
        else:
            warnings.append(
                "No pude sacar texto útil del PDF. Si es escaneado, agregá OPENAI_API_KEY."
            )
    elif mime_type.startswith("image/") or extension in {"png", "jpg", "jpeg", "gif", "webp"}:
        if capabilities["openai_enabled"]:
            try:
                text = extract_text_with_openai(raw_bytes, filename, mime_type)
                provider = "openai_image"
            except Exception as exc:
                exc_str = str(exc)
                is_quota = "429" in exc_str or "insufficient_quota" in exc_str or "quota" in exc_str.lower()
                reason = "Cuota de OpenAI agotada" if is_quota else f"OpenAI falló: {exc_str[:80]}"
                if capabilities["ocr_space_enabled"]:
                    print(f"[ocr] {reason} — usando OCR.Space como fallback")
                    try:
                        text = extract_text_with_ocr_space(raw_bytes)
                        provider = "ocr_space"
                    except Exception as exc2:
                        warnings.append(f"OpenAI y OCR.Space fallaron: {str(exc2)[:120]}")
                else:
                    warnings.append(f"{reason}. Configurá OCR_SPACE_API_KEY en Render como alternativa gratuita.")
        elif capabilities["ocr_space_enabled"]:
            try:
                text = extract_text_with_ocr_space(raw_bytes)
                provider = "ocr_space"
            except Exception as exc:
                warnings.append(f"No pude hacer OCR de la imagen: {str(exc)[:120]}")
        else:
            warnings.append(
                "Las imágenes necesitan OPENAI_API_KEY u OCR_SPACE_API_KEY para extraer texto."
            )
    else:
        text = decode_text(raw_bytes)

    emails = extract_emails(text)

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


def extract_text_with_openai(raw_bytes: bytes, filename: str, mime_type: str) -> str:
    import base64

    client = _openai_client()
    model = os.getenv("OPENAI_MODEL", "gpt-4o")
    prompt = (
        "Extrae todo el texto visible del archivo y prioriza correos electronicos. "
        "Devuelve texto plano legible, sin markdown."
    )
    file_data = base64.b64encode(raw_bytes).decode("ascii")
    if mime_type.startswith("image/"):
        content = [
            {"type": "input_text", "text": prompt},
            {"type": "input_image", "image_url": f"data:{mime_type};base64,{file_data}"},
        ]
    else:
        content = [
            {"type": "input_text", "text": prompt},
            {"type": "input_file", "filename": filename, "file_data": f"data:{mime_type};base64,{file_data}"},
        ]
    response = client.responses.create(
        model=model,
        input=[{"role": "user", "content": content}],
    )
    extracted = response.output_text
    if not extracted.strip():
        raise RuntimeError("OpenAI no devolvio texto util.")
    return extracted


def _compress_image_for_ocr(raw_bytes: bytes, max_bytes: int = 900_000) -> bytes:
    """Reduce una imagen a menos de max_bytes usando Pillow. Devuelve JPEG comprimido."""
    from PIL import Image
    if len(raw_bytes) <= max_bytes:
        return raw_bytes
    img = Image.open(io.BytesIO(raw_bytes))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    for max_dim in (1600, 1200, 900, 700):
        candidate = img.copy()
        candidate.thumbnail((max_dim, max_dim), Image.LANCZOS)
        buf = io.BytesIO()
        candidate.save(buf, format="JPEG", quality=85)
        if buf.tell() <= max_bytes:
            return buf.getvalue()
    buf = io.BytesIO()
    img.thumbnail((600, 600), Image.LANCZOS)
    img.save(buf, format="JPEG", quality=50)
    return buf.getvalue()


def extract_text_with_ocr_space(raw_bytes: bytes) -> str:
    """Extrae texto de una imagen usando OCR.Space API. Comprime la imagen si supera 1MB."""
    import httpx

    api_key = os.getenv("OCR_SPACE_API_KEY")
    if not api_key:
        raise RuntimeError("OCR_SPACE_API_KEY no está configurada.")

    compressed = _compress_image_for_ocr(raw_bytes)

    with httpx.Client(timeout=45) as client:
        response = client.post(
            "https://api.ocr.space/parse/image",
            data={
                "apikey": api_key,
                "language": "spa",
                "isOverlayRequired": "false",
                "OCREngine": "2",
                "detectOrientation": "true",
            },
            files={"filename": ("image.jpg", compressed, "image/jpeg")},
        )
    response.raise_for_status()
    result = response.json()

    if result.get("IsErroredOnProcessing"):
        errors = result.get("ErrorMessage") or ["Error desconocido"]
        msg = errors[0] if isinstance(errors, list) else str(errors)
        raise RuntimeError(f"OCR.Space: {msg}")

    parsed = result.get("ParsedResults") or []
    if not parsed:
        raise RuntimeError("OCR.Space no devolvió resultados.")

    text = "\n".join(p.get("ParsedText", "") for p in parsed)
    if not text.strip():
        raise RuntimeError("OCR.Space no detectó texto en la imagen.")

    return text


def extract_text_from_pdf(raw_bytes: bytes) -> str:
    # pdfplumber first — better for tables and structured layouts
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
            pages_text = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages_text.append(text)
            if pages_text:
                return "\n".join(pages_text)
    except Exception:
        pass
    # pypdf fallback
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw_bytes))
        pages_text = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages_text.append(text)
        if pages_text:
            return "\n".join(pages_text)
    except Exception:
        pass
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


# Keywords that appear in the same row/block as an email in the PDF
_STATUS_KEYWORDS: list[tuple[re.Pattern, str, str, str]] = [
    # (pattern, status, decision, next_action)
    (re.compile(r"\bSACAR\b|\bREBOT[OÓ]\b|\bELIMINAR\b|\bBOTAR\b", re.IGNORECASE), "sacar", "skip", "descartar"),
    (re.compile(r"\bPRIORIDAD\b|\bVIP\b|\bTOP\b", re.IGNORECASE), "prioridad", "approve", "seguir"),
    (re.compile(r"\bPORTAL\b", re.IGNORECASE), "portal", "approve", "portal"),
    (re.compile(r"\bSEGUIMIENTO\b|\bFOLLOW[- ]?UP\b", re.IGNORECASE), "seguimiento", "approve", "seguir"),
    (re.compile(r"\bREVISAR\b|\bVERIFICAR\b|\bCHECKEAR\b", re.IGNORECASE), "revisar", "approve", "revisar_manual"),
    (re.compile(r"\bMANTENER\b|\bV[AÁ]LIDO\b|\bACTIVO\b|\bOK\b", re.IGNORECASE), "mantener", "approve", "enviar"),
]


def infer_status_from_context(full_text: str, email: str) -> dict | None:
    """Return {status, decision, next_action} if the PDF line near *email* has a status keyword."""
    lines = full_text.splitlines()
    target_lines: list[str] = []
    for idx, line in enumerate(lines):
        if email.lower() in line.lower():
            # Include the line itself plus one line above/below for context
            start = max(0, idx - 1)
            end = min(len(lines), idx + 2)
            target_lines.extend(lines[start:end])
    if not target_lines:
        return None
    context = " ".join(target_lines)
    for pattern, status, decision, next_action in _STATUS_KEYWORDS:
        if pattern.search(context):
            return {"status": status, "decision": decision, "next_action": next_action}
    return None


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
    full_text = extraction.get("text", "")

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
        pdf_context: dict | None = None

        if normalized_email in existing_emails or normalized_email in seen_in_file:
            decision = "duplicate"
            reason = "El correo ya existe en la base o se repite dentro del archivo."
        elif not VALID_EMAIL_RE.fullmatch(normalized_email):
            decision = "invalid"
            reason = "Formato de email invalido."
        else:
            pdf_context = infer_status_from_context(full_text, normalized_email)
            if pdf_context:
                status = pdf_context["status"]
                decision = pdf_context["decision"]
                reason = f"Estado detectado desde contexto del PDF: {status.upper()}"

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
                "_pdf_context": bool(pdf_context),
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
            result, provider = classify_candidates_with_openai(classified), "openai"
        except Exception:
            result, provider = classified, "heuristic"
    else:
        result, provider = classified, "heuristic"

    for c in result:
        c.pop("_pdf_context", None)
    return result, provider


def apply_heuristic_classification(candidate: dict) -> dict:
    if candidate.get("_pdf_context"):
        candidate["next_action"] = infer_next_action(candidate["status"], candidate["decision"])
        candidate["suggested_message"] = build_suggested_message(candidate)
        return candidate

    if candidate["decision"] in {"duplicate", "invalid", "skip"}:
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
    client = _openai_client()
    model = os.getenv("OPENAI_MODEL", "gpt-4o")

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
    response = client.responses.create(
        model=model,
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_text", "text": json.dumps(compact_candidates, ensure_ascii=False)},
                ],
            }
        ],
    )
    text = response.output_text
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
