"""Agente de RRHH personalizado para búsqueda laboral de Gabriel Hidalgo.

Usa Groq (llama-3.3-70b-versatile) — API gratuita, compatible con OpenAI SDK.
"""
from __future__ import annotations

import json
import os
from typing import Optional

from openai import AsyncOpenAI
from sqlmodel import Session, text

from modules.database import engine, now_utc

# ── Cliente ───────────────────────────────────────────────────────────────────

_client = AsyncOpenAI(
    api_key=os.environ["GROQ_API_KEY"],
    base_url="https://api.groq.com/openai/v1",
)
_MODEL = os.getenv("CAREER_MODEL", "llama-3.3-70b-versatile")

# ── System prompt con perfil completo ────────────────────────────────────────

_SYSTEM_PROMPT = """Sos un consultor experto en RRHH, reclutamiento en Oil & Gas Argentina, optimización de CVs para sistemas ATS, y búsqueda laboral en la Patagonia. Tenés más de 15 años de experiencia ayudando a técnicos industriales a conseguir empleo en la cuenca neuquina.

Tu cliente es Gabriel Hidalgo. Su perfil completo:

━━━ DATOS PERSONALES ━━━
Nombre: Gabriel Orlando Hidalgo
Ubicación: Plottier, Neuquén | Tel: 299-329-7977
Email: gabriel.hid.orl@gmail.com
LinkedIn: linkedin.com/in/hidalgogabrielo
Licencia: B1 vigente | Disponibilidad inmediata | Acepta régimen rotativo

━━━ EDUCACIÓN ━━━
• Técnico Superior en Petróleo y Gas — I.S.E.T. N° 812, Comodoro Rivadavia
  Egresado nov. 2021 | Promedio: 7,38 | Cert. N° 00847930
  Materias clave: Automatismos y Control, Mediciones e Instalaciones Eléctricas, Mecánica de Fluidos, Sistemas Integrados de Gestión, Perforación y Terminación de Pozos, Producción, Captación y Tratamiento de Gas, Mantenimiento y Confiabilidad

• Tecnicatura en Programación — UTN | En curso
  POO, estructuras de datos, bases de datos, desarrollo de software industrial

━━━ EXPERIENCIA LABORAL ━━━
Fluodinámica S.A. — Jun 2025 – Sep 2025 (contrato temporal, Neuquén)
  Técnico en Mantenimiento – Sistemas Hidráulicos y Soporte Técnico
  • Armado, prueba hidráulica y certificación de mangueras de alta presión
  • Verificación de presiones y estanqueidad bajo normas técnicas
  • Asesoramiento técnico a clientes industriales (selección de componentes, especificaciones de presión, compatibilidad de materiales)
  • Control de stock, gestión logística, coordinación con proveedores

DLS Argentina — Dic 2023 – Mar 2025 (Neuquén)
  Operario de Pulling / Intervención de Pozos
  Ingresante Cat. I → Peón Práctico Cat. IV | Habilitado Enganchador
  (Desvinculación: reducción de personal masiva ~60 personas, causa externa)
  • Maniobras críticas en torre y boca de pozo bajo estándares HSE
  • Enganchador en torre: enganche/desenganche de varillas y tubulares en altura; corrida y corte de cable de aparejo y pistoneo
  • Montaje y desmontaje de BOP, pruebas de certificación en boca de pozo
  • Control y mantenimiento preventivo: BOP, bombas de ahogo, sistemas hidráulicos
  • Gestión de fluidos de completación y control de niveles en pileta
  • Aplicación de protocolos Well Control y HSE en todas las etapas
  • Trabajo en altura ×3 renovaciones, H2S Alive, RCP vigentes

Hotel Amerian — Ene 2014 – Feb 2016 | Empleado de Recepción
Ejército Argentino — May 2011 – Jul 2012 | Soldado Voluntario

━━━ CERTIFICACIONES (504+ hs) ━━━
Fundación YPF (336 hs totales, 84 hs c/u):
  • Instrumentación Industrial Nivel Inicial
  • Automatización Nivel Inicial
  • Instalaciones Eléctricas Nivel Inicial
  • Energías Renovables Nivel Inicial

ITP Neuquén:
  • Control de Pozos — 32 hs | Cert. N° 404/21
  • Coiled Tubing (Tubería Continua) — 32 hs | Cert. N° 526/21

Global Training Technology (dic 2023):
  • Nivelación WO/PU — 100/100 | Introducción Teórica — 90/100 | Especialización WO/PU — 100/100

DLS Argentina (en contrato):
  • Well Control Introductorio PAE | Montaje/Desmontaje BOP ×3
  • Calificación Competencias Pulling Enganchador (nov 2024)
  • H2S Alive | Trabajo en Altura ×3 renovaciones | RCP y 1° Auxilios
  • SSMA | Salud Ocupacional | Gestión Medioambiente | Gestión Calidad

━━━ COMPETENCIAS TÉCNICAS ━━━
• Operaciones de pozo: Pulling pesado, BOP, tubulares, varillas, pistoneo, fluidos de completación
• Sistemas hidráulicos: alta presión, mantenimiento preventivo/correctivo, diagnóstico de fallas
• Instrumentación: sensores, transmisores, lazos de control, calibración
• Automatización: control discreto y continuo, instalaciones eléctricas industriales
• Seguridad HSE: Well Control, H2S Alive, trabajo en altura, análisis de riesgo
• Software: AutoCAD, MS Office, Google Workspace | Inglés técnico (lectura)
• Programación: POO, bases de datos (UTN, en curso)

━━━ CVs DISPONIBLES (elegir según rol) ━━━
1. CV Petróleo y Gas / Pulling / Torre
2. CV Automatización e Instrumentación Industrial
3. CV Mantenimiento Industrial / Hidráulica
4. CV Operaciones Generales / HSE / Logística

━━━ BÚSQUEDA ACTUAL ━━━
Zona: Neuquén, Río Negro, área de Neuquén (NO reubicación a otras provincias)
Preferencia: evita torre si hay alternativa, pero lo acepta
Disponibilidad: inmediata

━━━ INSTRUCCIONES ━━━
1. Respondé SIEMPRE en español rioplatense. Sé directo y concreto.
2. Cuando recibas un aviso (imagen, PDF o texto):
   - Extraé empresa, cargo, requisitos técnicos y blandos
   - Evaluá el encaje de Gabriel (alto/medio/bajo) con justificación
   - Indicá cuál CV usar de los 4 disponibles
   - Ofrecé generar el email personalizado
3. Cuando generes un email:
   - Asunto: específico, menciona el puesto y un diferenciador clave
   - Cuerpo: 3 párrafos máximos, tono profesional pero natural (no corporativo)
   - Párrafo 1: conexión con el puesto y propuesta de valor
   - Párrafo 2: 2-3 logros/certificaciones más relevantes para ESE puesto
   - Párrafo 3: cierre con disponibilidad y call to action
4. Si el usuario pregunta cómo llenar un formulario o qué responder, dá una respuesta concreta con ejemplos.
5. Cuando el usuario confirme que va a aplicar, usá la herramienta guardar_resumen para registrar la búsqueda."""

# ── Definición de tools ───────────────────────────────────────────────────────

_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "guardar_resumen",
            "description": "Guarda en la base de datos un resumen de la búsqueda analizada. Usá esta herramienta cuando el usuario confirme que va a aplicar o que quiere guardar la búsqueda.",
            "parameters": {
                "type": "object",
                "properties": {
                    "empresa":            {"type": "string", "description": "Nombre de la empresa"},
                    "cargo":              {"type": "string", "description": "Nombre del puesto"},
                    "resumen_requisitos": {"type": "string", "description": "2-4 líneas con requisitos clave"},
                    "cv_recomendado":     {"type": "string", "description": "Cuál de los 4 CVs usar"},
                    "asunto_email":       {"type": "string", "description": "Asunto del email generado (vacío si no se generó)"},
                    "cuerpo_email":       {"type": "string", "description": "Cuerpo del email generado (vacío si no se generó)"},
                },
                "required": ["empresa", "cargo", "resumen_requisitos", "cv_recomendado", "asunto_email", "cuerpo_email"],
            },
        },
    }
]


def _execute_guardar_resumen(session_id: int, args: dict) -> str:
    empresa = args.get("empresa", "")
    cargo   = args.get("cargo", "")
    title   = f"{empresa} — {cargo}" if empresa and cargo else (cargo or empresa or "Búsqueda sin título")
    with Session(engine) as db:
        db.execute(
            text("""
                UPDATE career_sessions
                SET title         = :title,
                    company       = :empresa,
                    role          = :cargo,
                    summary       = :resumen,
                    email_subject = :asunto,
                    email_body    = :cuerpo,
                    updated_at    = :now
                WHERE id = :session_id
            """),
            {
                "title":      title[:200],
                "empresa":    empresa,
                "cargo":      cargo,
                "resumen":    args.get("resumen_requisitos", ""),
                "asunto":     args.get("asunto_email", ""),
                "cuerpo":     args.get("cuerpo_email", ""),
                "now":        now_utc(),
                "session_id": session_id,
            },
        )
        db.commit()
    return f"Búsqueda guardada: {title}"


# ── Función principal de chat ────────────────────────────────────────────────

async def _describe_image(image_b64: str, image_mime: str) -> str:
    """Usa el modelo de visión de Groq para transcribir/describir la imagen."""
    vision_client = AsyncOpenAI(
        api_key=os.environ["GROQ_API_KEY"],
        base_url="https://api.groq.com/openai/v1",
    )
    resp = await vision_client.chat.completions.create(
        model="meta-llama/llama-4-scout-17b-16e-instruct",
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{image_mime};base64,{image_b64}"}},
                {"type": "text", "text": (
                    "Transcribí y describí todo el texto e información visible en esta imagen. "
                    "Si es un aviso de trabajo, extraé: empresa, cargo, requisitos, ubicación, contacto. "
                    "Sé exhaustivo y literal."
                )},
            ],
        }],
        max_tokens=1024,
    )
    return resp.choices[0].message.content or "No se pudo leer la imagen."


async def run_chat(
    session_id: int,
    history: list[dict],
    user_text: str,
    image_b64: Optional[str] = None,
    image_mime: str = "image/jpeg",
) -> str:
    """Envía el mensaje al agente Groq (Llama) y devuelve su respuesta."""

    # Groq: los modelos de visión no soportan tools, así que primero describimos
    # la imagen con el modelo de visión y luego la pasamos como texto al agente principal.
    if image_b64:
        descripcion = await _describe_image(image_b64, image_mime)
        extra = f"\n\nEl usuario adjuntó una imagen. Contenido extraído:\n{descripcion}"
        user_content = (user_text or "Analizá este aviso.") + extra
    else:
        user_content = user_text

    messages = [{"role": "system", "content": _SYSTEM_PROMPT}]
    for m in history:
        messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": user_content})

    while True:
        response = await _client.chat.completions.create(
            model=_MODEL,
            messages=messages,
            tools=_TOOLS,
            tool_choice="auto",
        )

        msg = response.choices[0].message

        if not msg.tool_calls:
            return msg.content or "Sin respuesta del agente."

        messages.append(msg)
        for tc in msg.tool_calls:
            args = json.loads(tc.function.arguments)
            if tc.function.name == "guardar_resumen":
                result = _execute_guardar_resumen(session_id, args)
            else:
                result = f"Tool '{tc.function.name}' no reconocida."
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })
