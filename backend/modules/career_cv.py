"""Generación de CV ATS personalizado usando Groq + PDF con fpdf2.

Estilo visual: una hoja, sans-serif limpia, nombre grande, subtítulo azul,
secciones en MAYÚSCULA con línea divisoria — idéntico al CV base de Gabriel.
"""
from __future__ import annotations

import os
import re
from openai import AsyncOpenAI

_client = AsyncOpenAI(
    api_key=os.environ["GROQ_API_KEY"],
    base_url="https://api.groq.com/openai/v1",
)
_MODEL = os.getenv("CAREER_MODEL", "llama-3.3-70b-versatile")

# ── Perfil base de Gabriel ────────────────────────────────────────────────────

_GABRIEL_PROFILE = """
NOMBRE: Gabriel Orlando Hidalgo
TELÉFONO: 299-329-7977
EMAIL: gabriel.hid.orl@gmail.com
UBICACIÓN: Plottier, Neuquén
DISPONIBILIDAD: Inmediata | Acepta régimen rotativo
LICENCIA: B1 vigente

EDUCACIÓN:
- Técnico Superior en Petróleo y Gas — I.S.E.T. N° 812, Comodoro Rivadavia | Nov 2021 | Promedio 7,38
  Materias: Automatismos y Control, Mediciones e Instalaciones Eléctricas, Mecánica de Fluidos,
  Sistemas Integrados de Gestión, Termodinámica y Máquinas Térmicas, Mantenimiento y Confiabilidad.
- Tecnicatura en Programación — UTN | En curso
  POO, estructuras de datos, bases de datos, desarrollo de software aplicado a procesos industriales.

EXPERIENCIA (de más reciente a más antigua):
1. Fluodinámica S.A. — Jun 2025 – Sep 2025 | Técnico en Mantenimiento – Sistemas Hidráulicos
   - Armado, prueba hidráulica y certificación de mangueras de alta presión
   - Verificación de presiones y estanqueidad bajo normas técnicas
   - Diagnóstico y asesoramiento técnico a clientes industriales
   - Control de stock, gestión logística, coordinación con proveedores del sector industrial

2. DLS Argentina — Dic 2023 – Mar 2025 | Operario de Pulling / Enganchador
   Categoría: Ingresante Cat. I → Peón Práctico Pulling Cat. IV | Habilitado como Enganchador
   - Maniobras críticas en torre y boca de pozo bajo estándares HSE (Pulling Pesado)
   - Enganchador: enganche/desenganche de varillas y tubulares en altura
   - Montaje y desmontaje de BOP, participación en pruebas de certificación
   - Control y mantenimiento preventivo: BOP, bombas de ahogo, sistemas hidráulicos
   - Gestión de fluidos de completación y control de niveles en pileta
   - Well Control y HSE en todas las etapas de la operación

3. Ejército Argentino — May 2011 – Jul 2012 | Soldado Voluntario
4. Hotel Amerian — Ene 2014 – Feb 2016 | Empleado de Recepción

CERTIFICACIONES (504+ hs):
- Fundación YPF (336 hs): Instrumentación Industrial (84 hs), Automatización (84 hs),
  Instalaciones Eléctricas (84 hs), Energías Renovables (84 hs)
- ITP Neuquén: Control de Pozos 32 hs (Cert. N° 404/21), Coiled Tubing 32 hs (Cert. N° 526/21)
- Global Training Technology: Nivelación WO/PU 100, Introducción Teórica 90, Especialización WO/PU 100
- DLS Argentina: Well Control Introductorio PAE, Montaje/Desmontaje BOP ×3, Calificación Enganchador (nov 2024)
- Seguridad: H2S Alive, Trabajo en Altura ×3, RCP y 1° Auxilios, SSMA, Salud Ocupacional,
  Gestión Ambiental, Gestión Calidad

COMPETENCIAS TÉCNICAS:
- Operaciones de pozo: Pulling pesado, BOP, tubulares, varillas, pistoneo, fluidos de completación
- Sistemas hidráulicos: alta presión, mantenimiento preventivo/correctivo, diagnóstico de fallas
- Instrumentación: sensores, transmisores, lazos de control, calibración de instrumentos
- Automatización: control discreto y continuo, instalaciones eléctricas industriales
- Seguridad HSE: Well Control, H2S Alive, trabajo en altura, análisis de riesgo
- Software: AutoCAD, MS Office, Google Workspace | Inglés técnico (lectura)
- Programación: POO, bases de datos (UTN, en curso)
"""

# ── Prompt de generación ──────────────────────────────────────────────────────

_CV_PROMPT = """Sos un experto en redacción de CVs para el sector industrial y Oil & Gas en Argentina,
especializado en optimización ATS y en CVs de una sola página.

Generá un CV completo para Gabriel Hidalgo, adaptado específicamente para:
PUESTO: {cargo} en {empresa}
KEYWORDS ATS: {keywords}
CONTEXTO DEL AVISO: {resumen}

PERFIL DE GABRIEL — usá SOLO estos datos, no inventés nada:
{perfil}

━━━ FORMATO OBLIGATORIO ━━━
Seguí esta estructura EXACTA usando las etiquetas entre corchetes:

[SUBTITULO]
Usá el título real del puesto del aviso (PUESTO de arriba) como base, no inventes una etiqueta
genérica tipo "Perfil Técnico". Opcional: agregá una especialización secundaria real separada
por | (máx. 2 items).

[PERFIL]
2-3 oraciones cortas (40-75 palabras en total). Directo: rol al que apunta + experiencia
concreta real + 1-2 logros o certificaciones puntuales. Integrá keywords naturalmente. PROHIBIDO
usar frases de relleno tipo "se encuentra preparado para", "cuenta con sólida formación",
"comprometido con la excelencia" — cada oración tiene que aportar un dato concreto, no relleno.

[EXPERIENCIA]
## Título del Puesto en la Empresa
Empresa · Mes Año - Mes Año
_Contexto breve si corresponde (régimen, categoría, etc.) — omitir si no aplica_
- Logro/responsabilidad relevante (con keywords ATS integradas)
- Logro/responsabilidad
- Logro/responsabilidad
- Logro/responsabilidad (máximo 4 bullets por trabajo)

## Título del Puesto 2
Empresa · Mes Año - Mes Año
- bullet
- bullet

[COMPETENCIAS]
**Categoría principal:** ítem, ítem, ítem, ítem
**Categoría 2:** ítem, ítem, ítem
**Categoría 3:** ítem, ítem
(4-6 filas, ordenadas por relevancia para el puesto)

[FORMACION]
**Título Académico** — Institución | Fecha
_Materias o detalle relevante (itálica, solo si es relevante para el puesto)_
**Segundo título** — Institución | Estado

[CERTIFICACIONES]
**Grupo temático**
- Certificación - Institución (horas/cert. si aplica)
- Certificación - Institución

━━━ REGLAS ━━━
1. NUNCA inventés datos, fechas, logros, certificaciones, referencias, contactos ni ningún
   otro dato que no esté EXPLÍCITAMENTE en el perfil de arriba. Si no está en el perfil, no
   va en el CV — ni una palabra ni un nombre inventado.
2. NO agregues secciones que no estén en el FORMATO OBLIGATORIO de arriba. Nada de
   "Referencias", "Objetivo", "Idiomas" ni ninguna otra sección típica de CV que no haya sido
   pedida — ni siquiera una línea genérica tipo "Referencias disponibles a pedido".
3. No copies frases textuales del aviso como si fueran logros o experiencia de Gabriel: usá
   SU experiencia real, adaptada al vocabulario del puesto, sin afirmar que hizo algo que no
   hizo.
4. Incluí solo las experiencias y certs más relevantes para el puesto
5. Antes de usar una keyword, distinguí de qué tipo es:
   a) Keywords que nombran el PUESTO o LA TAREA GLOBAL que ofrece la empresa (ej. "Flow Back",
      "pruebas de producción", "Operador de X"): Gabriel NO las hizo todavía, son el objetivo
      de la búsqueda. NUNCA van en [COMPETENCIAS] ni en ningún lugar que implique que ya las
      sabe hacer. Solo pueden aparecer en [SUBTITULO] (como el rol al que apunta) o como
      objetivo explícito en [PERFIL] (ej. "orientado a roles de Flow Back", "busca
      incorporarse a tareas de pruebas de producción") — nunca como experiencia adquirida.
   b) Keywords que nombran una tarea, herramienta o equipo puntual que el perfil real de
      Gabriel prueba que manejó (ej. "piletas", "líneas de alta presión", "BOP"): estas SÍ son
      competencias reales, van literales en [COMPETENCIAS] o [EXPERIENCIA].
   c) Keywords que describen condiciones o beneficios de la EMPRESA (ej. "ofrecen
      capacitación", régimen de turnos): no son habilidades de Gabriel, no las pongas como si
      lo fueran.
   Ejemplo concreto: si KEYWORDS ATS incluye "Flow Back" pero el perfil de Gabriel no tiene
   ningún trabajo de Flow Back, "Flow Back" NO puede aparecer en [COMPETENCIAS] como si ya
   supiera hacerlo — solo puede nombrarse como el rol al que se postula.
6. Si el CONTEXTO DEL AVISO menciona una certificación concreta de Gabriel como relevante para
   el puesto (por nombre, ej. "Coiled Tubing", "Control de Pozos"), esa certificación tiene que
   aparecer en la sección [CERTIFICACIONES] — no se puede omitir si está en el perfil real y
   fue señalada como relevante.
7. Las 6 secciones del FORMATO OBLIGATORIO son TODAS obligatorias — ninguna puede quedar vacía
   ni omitirse, especialmente [PERFIL]. Usá la etiqueta exacta entre corchetes tal cual figura
   en el FORMATO OBLIGATORIO (ej. "[PERFIL]"), NUNCA el título largo que se muestra en el CV
   final (NO escribas "[PERFIL PROFESIONAL]", "[EXPERIENCIA LABORAL]", etc. — solo la palabra
   corta entre corchetes).
8. Máximo 550 palabras en total (una sola página)
9. Respondé SOLO con el contenido del CV, sin comentarios ni explicaciones"""


def _sanitize_prompt_field(value: str | None, max_length: int = 800) -> str:
    """Elimina caracteres de control y null bytes, y trunca al límite."""
    if not value:
        return ""
    cleaned = "".join(ch for ch in value if ch.isprintable() or ch in ("\n", "\t"))
    return cleaned[:max_length]


async def generate_cv_content(
    empresa: str,
    cargo: str,
    resumen: str,
    keywords: str,
) -> str:
    """Genera el contenido del CV adaptado al puesto usando Groq."""
    prompt = _CV_PROMPT.format(
        empresa=_sanitize_prompt_field(empresa, 200) or "la empresa",
        cargo=_sanitize_prompt_field(cargo, 200) or "el puesto",
        keywords=_sanitize_prompt_field(keywords, 400),
        resumen=_sanitize_prompt_field(resumen, 800),
        perfil=_GABRIEL_PROFILE,
    )
    response = await _client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.25,
        max_tokens=2500,
    )
    return response.choices[0].message.content or ""


# ── Parseo del texto generado ─────────────────────────────────────────────────

# Etiquetas canónicas que espera el resto del código (section_order en
# cv_content_to_html / cv_content_to_pdf usa estas claves exactas).
_KNOWN_TAGS = ["SUBTITULO", "PERFIL", "EXPERIENCIA", "COMPETENCIAS", "FORMACION", "CERTIFICACIONES"]


def _normalize_tag(raw: str) -> str | None:
    """Normaliza el contenido de una etiqueta [TAG] a una de las _KNOWN_TAGS.

    El modelo a veces escribe la etiqueta con el nombre completo que ve en el
    título renderizado (ej. "[PERFIL PROFESIONAL]" en vez de "[PERFIL]",
    "[EXPERIENCIA LABORAL]" en vez de "[EXPERIENCIA]"). Sin esto, esa línea no
    matchea la etiqueta esperada y toda la sección se pierde en silencio.
    """
    cleaned = re.sub(r"[^A-ZÁÉÍÓÚÑ]", "", raw.upper())
    for tag in _KNOWN_TAGS:
        if cleaned.startswith(tag):
            return tag
    return None


def _parse_sections(cv_text: str) -> dict[str, list[str]]:
    """Divide el CV en secciones por etiquetas [NOMBRE], tolerando variantes
    del modelo (ver _normalize_tag)."""
    sections: dict[str, list[str]] = {}
    current = None
    for line in cv_text.split("\n"):
        m = re.match(r"^\[(.+?)\]\s*$", line.strip())
        tag = _normalize_tag(m.group(1)) if m else None
        if tag:
            current = tag
            sections[current] = []
        elif current is not None:
            sections[current].append(line)
    return sections


# ── HTML para previsualización ────────────────────────────────────────────────

def cv_content_to_html(cv_text: str, cargo: str = "", empresa: str = "") -> str:
    """Convierte el CV generado a HTML con el estilo visual del CV base de Gabriel."""
    sections = _parse_sections(cv_text)

    def esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def render_inline(text: str) -> str:
        """Convierte **bold**, _italic_ y texto normal a HTML inline."""
        text = esc(text)
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
        text = re.sub(r"_(.+?)_", r"<em>\1</em>", text)
        return text

    def render_section_lines(lines: list[str]) -> str:
        html = []
        in_job = False
        for raw in lines:
            line = raw.rstrip()
            if not line:
                if in_job:
                    html.append('<div class="cv-job-gap"></div>')
                continue
            # Job title (## prefix)
            if line.lstrip().startswith("## "):
                title = line.lstrip()[3:]
                html.append(f'<p class="cv-job-title">{esc(title)}</p>')
                in_job = True
            # Company · Date line (contains · and no ## prefix, likely after a job title)
            elif re.search(r"·", line.lstrip()) and not line.lstrip().startswith("-"):
                html.append(f'<p class="cv-company">{render_inline(line.strip())}</p>')
            # Context line (_text_)
            elif re.match(r"^\s*_(.+)_\s*$", line):
                inner = re.match(r"^\s*_(.+)_\s*$", line).group(1)
                html.append(f'<p class="cv-context">{esc(inner)}</p>')
            # Bullet
            elif re.match(r"^\s*[-•]\s+", line):
                content = re.sub(r"^\s*[-•]\s+", "", line)
                html.append(f'<li>{render_inline(content)}</li>')
            # Competency: **Category:** value
            elif re.match(r"^\s*\*\*", line):
                html.append(f'<p class="cv-body">{render_inline(line.strip())}</p>')
            # Regular paragraph
            elif line.strip():
                html.append(f'<p class="cv-body">{render_inline(line.strip())}</p>')

        # Wrap consecutive <li> in <ul>
        result = "\n".join(html)
        result = re.sub(r"(<li>.*?</li>\n?)+", lambda m: f"<ul>\n{m.group()}</ul>", result, flags=re.DOTALL)
        return result

    subtitle = " ".join(l.strip() for l in sections.get("SUBTITULO", []) if l.strip())
    perfil_lines = sections.get("PERFIL", [])
    perfil_html = " ".join(l.strip() for l in perfil_lines if l.strip())

    section_order = [
        ("PERFIL", "PERFIL PROFESIONAL"),
        ("EXPERIENCIA", "EXPERIENCIA LABORAL"),
        ("COMPETENCIAS", "COMPETENCIAS TÉCNICAS"),
        ("FORMACION", "FORMACIÓN ACADÉMICA"),
        ("CERTIFICACIONES", "CERTIFICACIONES Y HABILITACIONES"),
    ]

    body_html = ""
    for key, label in section_order:
        lines = sections.get(key, [])
        if key == "PERFIL":
            if perfil_html:
                body_html += f"""
<section>
  <div class="cv-section-header"><span>{esc(label)}</span></div>
  <p class="cv-body cv-perfil">{esc(perfil_html)}</p>
</section>"""
        else:
            content = render_section_lines(lines)
            if content.strip():
                body_html += f"""
<section>
  <div class="cv-section-header"><span>{esc(label)}</span></div>
  {content}
</section>"""

    contact_line = "299-329-7977 &nbsp;|&nbsp; gabriel.hid.orl@gmail.com &nbsp;|&nbsp; linkedin.com/in/hidalgogabrielo &nbsp;|&nbsp; Plottier, Neuquén &nbsp;|&nbsp; Disponibilidad inmediata &nbsp;|&nbsp; Lic. B1"

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: Calibri, 'Segoe UI', Arial, Helvetica, sans-serif;
    font-size: 10.5pt;
    color: #111;
    background: #fff;
    padding: 22px 32px 28px;
    max-width: 800px;
    line-height: 1.35;
  }}
  .cv-name {{
    font-size: 28pt;
    font-weight: 900;
    letter-spacing: -0.5px;
    line-height: 1;
    color: #0f0f0f;
    margin-bottom: 3px;
  }}
  .cv-subtitle {{
    font-size: 10.5pt;
    font-weight: 400;
    color: #1e40af;
    margin-bottom: 3px;
  }}
  .cv-contact {{
    font-size: 9pt;
    color: #555;
    margin-bottom: 10px;
  }}
  .cv-header-rule {{
    border: none;
    border-top: 1.5px solid #111;
    margin: 8px 0 12px;
  }}
  .cv-section-header {{
    border-bottom: 1.5px solid #111;
    margin: 10px 0 5px;
    padding-bottom: 2px;
  }}
  .cv-section-header span {{
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #0f0f0f;
  }}
  .cv-job-title {{
    font-size: 10.5pt;
    font-weight: 700;
    color: #0f0f0f;
    margin-top: 6px;
    margin-bottom: 1px;
  }}
  .cv-company {{
    font-size: 9.5pt;
    color: #1e40af;
    font-style: italic;
    margin-bottom: 1px;
  }}
  .cv-context {{
    font-size: 8.5pt;
    color: #555;
    font-style: italic;
    margin-bottom: 2px;
  }}
  .cv-perfil {{
    margin-top: 4px;
  }}
  .cv-body {{
    font-size: 9.5pt;
    margin-bottom: 2px;
    color: #1a1a1a;
  }}
  .cv-job-gap {{ margin-top: 5px; }}
  ul {{
    margin: 2px 0 3px 14px;
    padding: 0;
    list-style: disc;
  }}
  li {{
    font-size: 9.5pt;
    margin-bottom: 1.5px;
    color: #1a1a1a;
  }}
  section {{ margin-bottom: 4px; }}
  strong {{ font-weight: 700; }}
  em {{ font-style: italic; color: #1e40af; }}
</style>
</head>
<body>
<header>
  <div class="cv-name">GABRIEL HIDALGO</div>
  <div class="cv-subtitle">{esc(subtitle) if subtitle else esc(cargo)}</div>
  <div class="cv-contact">{contact_line}</div>
  <hr class="cv-header-rule">
</header>
{body_html}
</body>
</html>"""


# ── PDF con fpdf2 ─────────────────────────────────────────────────────────────

def cv_content_to_pdf(cv_text: str, cargo: str = "", empresa: str = "") -> bytes:
    """Genera un PDF de una página con el estilo visual del CV base de Gabriel."""
    from fpdf import FPDF

    # Paleta de colores
    C_BLACK = (15, 15, 15)
    C_BLUE = (30, 64, 175)
    C_GRAY = (90, 90, 90)
    C_LINE = (15, 15, 15)

    def ltr(s: str) -> str:
        """Convierte a Latin-1 para fuentes built-in de fpdf2."""
        replacements = {
            "•": "-", "–": "-", "—": "-",
            "“": '"', "”": '"', "‘": "'", "’": "'",
            "·": ".", "…": "...",
        }
        for c, r in replacements.items():
            s = s.replace(c, r)
        return s.encode("latin-1", errors="replace").decode("latin-1")

    sections = _parse_sections(cv_text)

    pdf = FPDF()
    pdf.set_margins(14, 12, 14)
    pdf.add_page()

    PAGE_W = pdf.w - 28  # content width (margins 14+14)

    # ── Encabezado ────────────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(*C_BLACK)
    pdf.cell(PAGE_W, 9, "GABRIEL HIDALGO", new_x="LMARGIN", new_y="NEXT")

    subtitle = " ".join(l.strip() for l in sections.get("SUBTITULO", []) if l.strip())
    if not subtitle:
        subtitle = cargo
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*C_BLUE)
    pdf.cell(PAGE_W, 5, ltr(subtitle), new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*C_GRAY)
    contact = "299-329-7977  |  gabriel.hid.orl@gmail.com  |  linkedin.com/in/hidalgogabrielo  |  Plottier, Neuquen  |  Disp. inmediata  |  Lic. B1"
    pdf.cell(PAGE_W, 5, ltr(contact), new_x="LMARGIN", new_y="NEXT")

    # Línea divisoria bajo el header
    pdf.set_draw_color(*C_LINE)
    pdf.set_line_width(0.5)
    y = pdf.get_y() + 2
    pdf.line(14, y, pdf.w - 14, y)
    pdf.ln(4)

    # ── Helper: título de sección ────────────────────────────────────────────
    def section_header(label: str):
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*C_BLACK)
        pdf.cell(PAGE_W, 5, ltr(label.upper()), new_x="LMARGIN", new_y="NEXT")
        y2 = pdf.get_y()
        pdf.set_draw_color(*C_LINE)
        pdf.set_line_width(0.4)
        pdf.line(14, y2, pdf.w - 14, y2)
        pdf.ln(2)

    # ── Helper: texto con fragmentos bold/italic ──────────────────────────────
    def write_mixed(line: str, base_size: float = 9.0, color=C_BLACK):
        """Escribe una línea con **bold** e _italic_ intercalados."""
        # Splitea por tokens **bold** e _italic_
        tokens = re.split(r"(\*\*[^*]+\*\*|_[^_]+_)", line)
        for tok in tokens:
            if tok.startswith("**") and tok.endswith("**"):
                pdf.set_font("Helvetica", "B", base_size)
                pdf.set_text_color(*color)
                pdf.write(4.5, ltr(tok[2:-2]))
            elif tok.startswith("_") and tok.endswith("_"):
                pdf.set_font("Helvetica", "I", base_size - 0.5)
                pdf.set_text_color(*C_GRAY)
                pdf.write(4.5, ltr(tok[1:-1]))
            else:
                pdf.set_font("Helvetica", "", base_size)
                pdf.set_text_color(*color)
                pdf.write(4.5, ltr(tok))

    def body_line(line: str, size: float = 9.0, color=C_BLACK,
                  font_style: str = "", indent: float = 0):
        """Imprime una línea con multi-cell para word-wrap correcto."""
        if indent:
            pdf.set_x(14 + indent)
        pdf.set_font("Helvetica", font_style, size)
        pdf.set_text_color(*color)
        avail = PAGE_W - indent
        pdf.multi_cell(avail, 4.5, ltr(line), new_x="LMARGIN", new_y="NEXT")

    # ── Renderizado de secciones ─────────────────────────────────────────────

    def render_lines(lines: list[str]):
        for raw in lines:
            line = raw.rstrip()
            if not line:
                pdf.ln(2)
                continue
            # Job title (## prefix)
            if line.lstrip().startswith("## "):
                title = line.lstrip()[3:]
                pdf.ln(2)
                body_line(title, size=10.0, font_style="B", color=C_BLACK)
            # Company · Date
            elif re.search(r"·", line.lstrip()) and not line.lstrip().startswith("-"):
                body_line(line.strip(), size=9.0, font_style="I", color=C_BLUE)
            # Context line _text_
            elif re.match(r"^\s*_(.+)_\s*$", line):
                inner = re.match(r"^\s*_(.+)_\s*$", line).group(1)
                body_line(inner, size=8.0, font_style="I", color=C_GRAY)
            # Bullet
            elif re.match(r"^\s*[-•]\s+", line):
                content = re.sub(r"^\s*[-•]\s+", "", line)
                pdf.set_x(14 + 4)
                write_mixed("- " + content, base_size=9.0, color=C_BLACK)
                pdf.ln()
            # Competency: **Category:** value
            elif re.match(r"^\s*\*\*", line):
                pdf.set_x(14)
                write_mixed(line.strip(), base_size=9.0, color=C_BLACK)
                pdf.ln()
            # Regular
            elif line.strip():
                body_line(line.strip(), size=9.0, color=C_BLACK)

    section_order = [
        ("PERFIL", "PERFIL PROFESIONAL"),
        ("EXPERIENCIA", "EXPERIENCIA LABORAL"),
        ("COMPETENCIAS", "COMPETENCIAS TÉCNICAS"),
        ("FORMACION", "FORMACIÓN ACADÉMICA"),
        ("CERTIFICACIONES", "CERTIFICACIONES Y HABILITACIONES"),
    ]

    for key, label in section_order:
        lines = [l for l in sections.get(key, []) if l.strip() or True]
        # Omite secciones vacías
        if not any(l.strip() for l in lines):
            continue
        section_header(label)
        if key == "PERFIL":
            perfil_text = " ".join(l.strip() for l in lines if l.strip())
            if perfil_text:
                body_line(perfil_text, size=9.0)
        else:
            render_lines(lines)
        pdf.ln(1)

    return bytes(pdf.output())
