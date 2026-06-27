"""Generación de CV ATS personalizado usando Groq + PDF con fpdf2."""
from __future__ import annotations

import os
from openai import AsyncOpenAI

_client = AsyncOpenAI(
    api_key=os.environ["GROQ_API_KEY"],
    base_url="https://api.groq.com/openai/v1",
)
_MODEL = os.getenv("CAREER_MODEL", "llama-3.3-70b-versatile")

_GABRIEL_PROFILE = """
NOMBRE: Gabriel Orlando Hidalgo
TELÉFONO: 299-329-7977
EMAIL: gabriel.hid.orl@gmail.com
LINKEDIN: linkedin.com/in/hidalgogabrielo
UBICACIÓN: Plottier, Neuquén
LICENCIA: B1 vigente | Disponibilidad inmediata | Acepta régimen rotativo

EDUCACIÓN:
- Técnico Superior en Petróleo y Gas — I.S.E.T. N° 812, Comodoro Rivadavia | Nov 2021 | Promedio 7,38 | Cert. N° 00847930
- Tecnicatura en Programación — UTN | En curso

EXPERIENCIA:
1. Fluodinámica S.A. — Jun 2025 – Sep 2025 | Técnico en Mantenimiento – Sistemas Hidráulicos
   - Armado, prueba hidráulica y certificación de mangueras de alta presión
   - Verificación de presiones y estanqueidad bajo normas técnicas
   - Asesoramiento técnico a clientes industriales
   - Control de stock, gestión logística, coordinación con proveedores

2. DLS Argentina — Dic 2023 – Mar 2025 | Operario de Pulling / Enganchador
   - Maniobras críticas en torre y boca de pozo bajo estándares HSE
   - Enganchador: enganche/desenganche de varillas y tubulares en altura
   - Montaje y desmontaje de BOP, pruebas de certificación
   - Control y mantenimiento preventivo: BOP, bombas de ahogo, sistemas hidráulicos
   - Gestión de fluidos de completación y control de niveles en pileta
   - Well Control y HSE en todas las etapas

3. Hotel Amerian — Ene 2014 – Feb 2016 | Empleado de Recepción
4. Ejército Argentino — May 2011 – Jul 2012 | Soldado Voluntario

CERTIFICACIONES (504+ hs):
- Fundación YPF (336 hs): Instrumentación Industrial, Automatización, Instalaciones Eléctricas, Energías Renovables
- ITP Neuquén: Control de Pozos 32 hs (N° 404/21), Coiled Tubing 32 hs (N° 526/21)
- Global Training Technology: Nivelación WO/PU 100/100, Introducción Teórica 90/100, Especialización WO/PU 100/100
- DLS Argentina: Well Control Introductorio PAE, Montaje/Desmontaje BOP ×3, Calificación Enganchador (nov 2024)
- H2S Alive, Trabajo en Altura ×3, RCP y 1° Auxilios, SSMA, Salud Ocupacional, Gestión Ambiental, Gestión Calidad

COMPETENCIAS TÉCNICAS:
- Operaciones de pozo: Pulling pesado, BOP, tubulares, varillas, pistoneo, fluidos de completación
- Sistemas hidráulicos: alta presión, mantenimiento preventivo/correctivo, diagnóstico de fallas
- Instrumentación: sensores, transmisores, lazos de control, calibración
- Automatización: control discreto y continuo, instalaciones eléctricas industriales
- Seguridad HSE: Well Control, H2S Alive, trabajo en altura, análisis de riesgo
- Software: AutoCAD, MS Office, Google Workspace | Inglés técnico (lectura)
"""

_CV_PROMPT = """Sos un experto en redacción de CVs para el sector Oil & Gas Argentina, especializado en optimización ATS.

Generá un CV completo para Gabriel Hidalgo, adaptado específicamente para el siguiente puesto:

PUESTO: {cargo} en {empresa}
KEYWORDS ATS DEL AVISO: {keywords}
CONTEXTO DEL AVISO: {resumen}

PERFIL DE GABRIEL (usá SOLO estos datos, no inventes nada):
{perfil}

INSTRUCCIONES:
1. Generá un CV en texto plano con secciones claramente marcadas usando estas etiquetas exactas:
   [OBJETIVO], [EXPERIENCIA], [EDUCACION], [CERTIFICACIONES], [HABILIDADES]
2. El OBJETIVO debe ser 2-3 líneas específicas para ESE puesto, usando keywords del aviso
3. En EXPERIENCIA, reordenás y enfatizás los logros más relevantes para el puesto
4. Integrá las keywords ATS de forma natural en todo el documento
5. NO inventés datos, fechas, certificaciones o logros que no estén en el perfil
6. Tono: profesional y directo, sin frases genéricas como "soy una persona proactiva"
7. Formato limpio, sin bullets complejos — solo guiones simples

Generá únicamente el contenido del CV, sin comentarios ni explicaciones."""


async def generate_cv_content(
    empresa: str,
    cargo: str,
    resumen: str,
    keywords: str,
) -> str:
    """Genera el contenido del CV adaptado al puesto. Devuelve texto estructurado."""
    prompt = _CV_PROMPT.format(
        empresa=empresa or "la empresa",
        cargo=cargo or "el puesto",
        keywords=keywords or "",
        resumen=resumen or "",
        perfil=_GABRIEL_PROFILE,
    )
    response = await _client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=2000,
    )
    return response.choices[0].message.content or ""


def cv_content_to_html(cv_text: str, cargo: str = "", empresa: str = "") -> str:
    """Convierte el texto estructurado del CV a HTML para previsualización."""
    import re

    def escape(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    sections = {
        "OBJETIVO": "",
        "EXPERIENCIA": "",
        "EDUCACION": "",
        "CERTIFICACIONES": "",
        "HABILIDADES": "",
    }

    current = None
    lines_map: dict[str, list[str]] = {k: [] for k in sections}

    for line in cv_text.split("\n"):
        stripped = line.strip()
        matched = re.match(r"\[(\w+)\]", stripped)
        if matched:
            key = matched.group(1).upper()
            if key in sections:
                current = key
                continue
        if current:
            lines_map[current].append(stripped)

    def render_lines(lines: list[str]) -> str:
        html_parts = []
        for ln in lines:
            if not ln:
                continue
            if ln.startswith("- "):
                html_parts.append(f"<li>{escape(ln[2:])}</li>")
            else:
                html_parts.append(f"<p>{escape(ln)}</p>")
        # Wrap consecutive <li> in <ul>
        result = "\n".join(html_parts)
        result = re.sub(r"((?:<li>.*?</li>\n?)+)", r"<ul>\1</ul>", result, flags=re.DOTALL)
        return result

    titulo_html = f"<h2>{escape(cargo)}</h2>" if cargo else ""
    empresa_html = f"<p class='cv-empresa'>{escape(empresa)}</p>" if empresa else ""

    body_parts = []
    section_labels = {
        "OBJETIVO": "Objetivo Profesional",
        "EXPERIENCIA": "Experiencia Laboral",
        "EDUCACION": "Educación",
        "CERTIFICACIONES": "Certificaciones",
        "HABILIDADES": "Habilidades Técnicas",
    }
    for key, label in section_labels.items():
        content = render_lines(lines_map[key])
        if content.strip():
            body_parts.append(f"<section><h3>{label}</h3>{content}</section>")

    body = "\n".join(body_parts)

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body {{ font-family: Arial, sans-serif; font-size: 13px; color: #111; background: #fff; margin: 0; padding: 32px 40px; max-width: 820px; }}
  header {{ border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; }}
  h1 {{ margin: 0 0 4px; font-size: 22px; letter-spacing: -0.3px; }}
  h2 {{ margin: 0 0 4px; font-size: 14px; font-weight: 600; color: #333; }}
  .cv-empresa {{ margin: 0; font-style: italic; color: #555; font-size: 12px; }}
  .cv-contact {{ margin: 8px 0 0; font-size: 12px; color: #444; }}
  .cv-contact span {{ margin-right: 16px; }}
  section {{ margin-bottom: 18px; }}
  h3 {{ font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin: 0 0 8px; color: #000; }}
  p {{ margin: 0 0 6px; line-height: 1.5; }}
  ul {{ margin: 0 0 8px; padding-left: 18px; }}
  li {{ margin-bottom: 3px; line-height: 1.5; }}
</style>
</head>
<body>
<header>
  <h1>Gabriel Orlando Hidalgo</h1>
  {titulo_html}
  {empresa_html}
  <p class="cv-contact">
    <span>299-329-7977</span>
    <span>gabriel.hid.orl@gmail.com</span>
    <span>linkedin.com/in/hidalgogabrielo</span>
    <span>Plottier, Neuquén</span>
  </p>
</header>
{body}
</body>
</html>"""


def cv_content_to_pdf(cv_text: str, cargo: str = "", empresa: str = "") -> bytes:
    """Genera un PDF limpio y ATS-friendly desde el texto del CV."""
    from fpdf import FPDF
    import re

    pdf = FPDF()
    pdf.set_margins(20, 20, 20)
    pdf.add_page()

    # Encabezado
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 8, "Gabriel Orlando Hidalgo", new_x="LMARGIN", new_y="NEXT")
    if cargo:
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(60, 60, 60)
        label = f"{cargo}" + (f" — {empresa}" if empresa else "")
        pdf.cell(0, 6, label, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 5, "299-329-7977  |  gabriel.hid.orl@gmail.com  |  linkedin.com/in/hidalgogabrielo  |  Plottier, Neuquén", new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(0, 0, 0)
    pdf.line(20, pdf.get_y() + 2, 190, pdf.get_y() + 2)
    pdf.ln(6)

    section_labels = {
        "OBJETIVO": "OBJETIVO PROFESIONAL",
        "EXPERIENCIA": "EXPERIENCIA LABORAL",
        "EDUCACION": "EDUCACIÓN",
        "CERTIFICACIONES": "CERTIFICACIONES",
        "HABILIDADES": "HABILIDADES TÉCNICAS",
    }

    # Parsear secciones
    sections_order = list(section_labels.keys())
    current = None
    lines_map: dict[str, list[str]] = {k: [] for k in sections_order}
    for line in cv_text.split("\n"):
        stripped = line.strip()
        matched = re.match(r"\[(\w+)\]", stripped)
        if matched:
            key = matched.group(1).upper()
            if key in lines_map:
                current = key
                continue
        if current:
            lines_map[current].append(stripped)

    def safe_text(s: str) -> str:
        return s.encode("latin-1", errors="replace").decode("latin-1")

    for key in sections_order:
        lines = [l for l in lines_map[key] if l]
        if not lines:
            continue
        # Título de sección
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(0, 6, section_labels[key], new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(150, 150, 150)
        pdf.line(20, pdf.get_y(), 190, pdf.get_y())
        pdf.ln(2)
        # Contenido
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(30, 30, 30)
        for line in lines:
            if line.startswith("- "):
                pdf.set_x(24)
                pdf.multi_cell(0, 5, safe_text("• " + line[2:]), new_x="LMARGIN", new_y="NEXT")
            else:
                pdf.multi_cell(0, 5, safe_text(line), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    return bytes(pdf.output())
