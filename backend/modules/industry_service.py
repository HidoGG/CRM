"""Clasificación automática de rubros por nombre de empresa.

Lógica:
1. Consulta company_sectors en DB (memoria de clasificaciones previas).
2. Si no existe, aplica keyword matching sobre el nombre de empresa.
3. Guarda el resultado en company_sectors para herencia automática futura.

Los 4 rubros posibles:
  oilgas      → Petróleo & Gas / Servicios O&G
  industria   → Industria & Servicios Técnicos
  tecnologia  → Tecnología / Perfil Digital
  generalista → Generalista / Polivalente (default cuando no hay match)
"""
from __future__ import annotations

from sqlalchemy import text

VALID_SECTORS = {"oilgas", "industria", "generalista", "tecnologia"}

SECTOR_LABELS = {
    "oilgas":      "Petróleo & Gas",
    "industria":   "Industria & Servicios Técnicos",
    "generalista": "Generalista / Polivalente",
    "tecnologia":  "Tecnología / Perfil Digital",
}

SECTOR_EMOJIS = {
    "oilgas":      "🛢️",
    "industria":   "⚙️",
    "generalista": "🏢",
    "tecnologia":  "💻",
}

# Keywords para cada sector — se evalúan en orden; primer match gana.
# Formato: subcadenas en minúsculas que deben aparecer en el nombre de empresa.
_SECTOR_KEYWORDS: list[tuple[str, list[str]]] = [
    ("oilgas", [
        # Empresas conocidas de la base
        "halliburton", "weatherford", "schlumberger", "calfrac", "baker hughes",
        "bhge", "nabors", "expro", "tesco corp", "tetra tech", "hoerbiger",
        "oldelval", "petreven", "petrogas", "petrooeste", "quintana wellpro",
        "aesa", "airdrilling", "alpha oil", "bolland", "pecom", "copgo",
        "ecostim", "recyser", "sbl", "siderca", "tenaris", "tuboscope",
        "wellbore", "ypf", "tangoenergia", "oleontec", "25msa", "abundant",
        "slb", "bm inspecciones",
        # Keywords genéricos
        "petro", "oilfield", "wellpro", "drilling", "energi", "hidrocarb",
        "refiner", "oil & gas", "oil&gas", "vaca muerta",
    ]),
    ("tecnologia", [
        # Empresas conocidas
        "after wire", "neunet", "pc del comahue",
        # Keywords genéricos
        "software", "telecom", "telecomunic", "internet", "cloud",
        "develop", "informatica", "informática", "sistemas", "redes ",
        "digital", "tech ", "technology",
    ]),
    ("industria", [
        # Empresas conocidas
        "metalurg", "cemelar", "kitersimha", "soldadura", "tecbras",
        "polyar", "sacde", "hidromec", "mauad", "trace group", "qm equipment",
        "ciar", "cis ingenie", "ipe neuquen", "victor contreras",
        "altamore", "codesin", "edvsa", "falken", "img srl", "open srl",
        "rolcka", "soipe", "ecoaike", "indarsa", "mocciola", "tecprecinc",
        "zille",
        # Keywords genéricos
        "construc", "ingenie", "taller ", "manufactur", "fabric",
        "montaje", "acero", "hierro", "estructura", "hidraul",
        "maquinar", "metalur", "soldad", "industrial", "mecanica",
        "mecánica",
    ]),
    # generalista = default, no necesita keywords
]


def classify_company(company_name: str) -> str:
    """Clasifica una empresa por keywords. Retorna clave de sector.

    No accede a DB — solo matching de texto. Para uso con herencia,
    usar resolve_industry() que además persiste el resultado.
    """
    if not company_name:
        return "generalista"

    normalized = company_name.lower().strip()

    for sector, keywords in _SECTOR_KEYWORDS:
        for kw in keywords:
            if kw in normalized:
                return sector

    return "generalista"


def resolve_industry(session, company_name: str | None) -> str:
    """Devuelve el sector de una empresa, con herencia y persistencia.

    Flujo:
    1. Si no hay nombre → 'generalista'.
    2. Busca en company_sectors (match exacto normalizado).
    3. Si no existe → clasifica por keywords → guarda en company_sectors.
    """
    if not company_name:
        return "generalista"

    key = company_name.strip()

    row = session.execute(
        text("SELECT industry FROM company_sectors WHERE company_name = :name"),
        {"name": key},
    ).fetchone()

    if row is not None:
        return row[0]

    sector = classify_company(key)
    _save_company_sector(session, key, sector)
    return sector


def save_company_sector(session, company_name: str, sector: str) -> None:
    """Guarda o actualiza el rubro de una empresa en company_sectors."""
    if not company_name or sector not in VALID_SECTORS:
        return
    _save_company_sector(session, company_name.strip(), sector)


def _save_company_sector(session, company_name: str, sector: str) -> None:
    session.execute(
        text("""
            INSERT INTO company_sectors (company_name, industry, updated_at)
            VALUES (:name, :industry, now())
            ON CONFLICT (company_name)
            DO UPDATE SET industry = EXCLUDED.industry, updated_at = now()
        """),
        {"name": company_name, "industry": sector},
    )


def get_sector_defaults(session) -> list[dict]:
    rows = session.execute(
        text("""
            SELECT sd.sector, sd.template_id, sd.cv_file_id,
                   mt.name AS template_name, cf.original_name AS cv_name
            FROM sector_defaults sd
            LEFT JOIN message_templates mt ON mt.id = sd.template_id
            LEFT JOIN cv_files cf ON cf.id = sd.cv_file_id
            ORDER BY sd.sector
        """)
    ).fetchall()
    result = []
    for row in rows:
        d = dict(row._mapping)
        d["emoji"] = SECTOR_EMOJIS.get(d["sector"], "🏢")
        d["label"] = SECTOR_LABELS.get(d["sector"], d["sector"])
        result.append(d)
    return result


def update_sector_default(session, sector: str, template_id: int | None, cv_file_id: int | None) -> dict:
    session.execute(
        text("""
            UPDATE sector_defaults
            SET template_id = :template_id, cv_file_id = :cv_file_id
            WHERE sector = :sector
        """),
        {"sector": sector, "template_id": template_id, "cv_file_id": cv_file_id},
    )
    row = session.execute(
        text("SELECT sector, template_id, cv_file_id FROM sector_defaults WHERE sector = :sector"),
        {"sector": sector},
    ).fetchone()
    if row is None:
        return {}
    d = dict(row._mapping)
    d["emoji"] = SECTOR_EMOJIS.get(d["sector"], "🏢")
    d["label"] = SECTOR_LABELS.get(d["sector"], d["sector"])
    return d


def get_template_cv_for_sector(session, sector: str) -> tuple[int | None, int | None]:
    """Retorna (template_id, cv_file_id) configurados para el sector."""
    row = session.execute(
        text("SELECT template_id, cv_file_id FROM sector_defaults WHERE sector = :sector"),
        {"sector": sector},
    ).fetchone()
    if row is None:
        return None, None
    return row[0], row[1]
