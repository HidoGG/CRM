"""Agente de RRHH personalizado para búsqueda laboral de Gabriel Hidalgo.

Usa Groq (llama-3.3-70b-versatile) — API gratuita, compatible con OpenAI SDK.
"""
from __future__ import annotations

import ipaddress
import json
import os
import socket
from typing import Optional
from urllib.parse import urlparse

from openai import AsyncOpenAI
from sqlmodel import Session, text

from modules.database import engine, now_utc

# ── Protección SSRF — whitelist de dominios y bloqueo de IPs privadas ─────────

_ALLOWED_DOMAINS: frozenset[str] = frozenset({
    "linkedin.com", "www.linkedin.com",
    "computrabajo.com", "ar.computrabajo.com",
    "bumeran.com", "www.bumeran.com",
    "zonajobs.com.ar", "www.zonajobs.com.ar",
    "indeed.com", "ar.indeed.com",
    "empleos.clarin.com",
    "trabajando.com", "www.trabajando.com",
})

_BLOCKED_IP_RANGES = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local / AWS metadata
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]


def _is_safe_url(url: str) -> tuple[bool, str]:
    """Valida que una URL sea segura antes de hacer un request externo.

    Retorna (is_safe, reason_if_not). Chequea:
    - Scheme debe ser https
    - Hostname debe estar en _ALLOWED_DOMAINS
    - IP resuelta no debe ser privada/reservada
    """
    try:
        parsed = urlparse(url)
        if parsed.scheme != "https":
            return False, "Solo se permiten URLs HTTPS."
        hostname = parsed.hostname or ""
        if not hostname:
            return False, "URL sin hostname."
        # Whitelist check — comparar hostname completo y base domain (últimos 2 segmentos)
        base_domain = ".".join(hostname.split(".")[-2:])
        allowed_bases = {".".join(d.split(".")[-2:]) for d in _ALLOWED_DOMAINS}
        if hostname not in _ALLOWED_DOMAINS and base_domain not in allowed_bases:
            return False, f"Dominio no permitido: {hostname}"
        # IP check — evita SSRF via DNS rebinding
        try:
            ip = ipaddress.ip_address(socket.gethostbyname(hostname))
            for blocked in _BLOCKED_IP_RANGES:
                if ip in blocked:
                    return False, "Acceso denegado."
        except (socket.gaierror, ValueError):
            return False, "No se pudo resolver el dominio."
        return True, ""
    except Exception:
        return False, "URL inválida."


def _fetch_url(url: str) -> str:
    """Descarga el contenido de una URL validando primero contra SSRF.

    Usar esta función en lugar de requests.get() directamente.
    Retorna el texto de la response o lanza ValueError si la URL no es segura.
    """
    import requests

    safe, reason = _is_safe_url(url)
    if not safe:
        raise ValueError(f"URL bloqueada por política de seguridad: {reason}")
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    return response.text

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

2. Cuando recibas un aviso (imagen, PDF o texto), generá TODO AUTOMÁTICAMENTE en UNA SOLA respuesta sin esperar que el usuario pida nada más. Usá exactamente este formato:

───────────────────────────────
🎯 ANÁLISIS DEL PUESTO

Empresa: [nombre]
Cargo: [puesto]
Encaje: Alto ✓ / Medio ~ / Bajo ✗
Motivo: [1-2 líneas explicando por qué]

📋 CV A USAR: [nombre del CV de los 4 disponibles]
Tip: [qué sección/logro del CV enfatizar para este puesto específico]

🔑 KEYWORDS ATS DETECTADAS
Incluí estas palabras exactas en el CV y el email para pasar los filtros automáticos:
[listado separado por comas, 6-12 keywords extraídas del aviso]

📨 ENVIAR A
```
[email de contacto/postulación si está visible en el aviso. Si no, escribir: No visible en el aviso — buscalo en el portal o aviso original]
```

───────────────────────────────
📧 ASUNTO DEL EMAIL
```
[asunto aquí — específico, menciona el puesto y un diferenciador clave de Gabriel]
```

✉️ CUERPO DEL EMAIL
```
[cuerpo completo aquí]
```
───────────────────────────────

Reglas para el email:
- Asunto: menciona el cargo + 1 diferenciador clave (ej: "Control de Pozos certificado")
- Cuerpo: usá UNA de las 3 plantillas base de abajo como estructura, adaptándola al aviso
- Reemplazá {name} con el nombre del reclutador si está en el aviso; si no, usá "Estimado/a equipo de selección"
- Reemplazá {company} con el nombre real de la empresa
- Párrafo de presentación: ajustá al perfil específico que pide el aviso
- Párrafo de logros: destacá 2-3 certificaciones/experiencias más relevantes para ESE aviso, con keywords del aviso
- Párrafo de cierre: disponibilidad inmediata + call to action claro
- Tono: profesional pero humano, directo, sin frases corporativas vacías
- Firmá como: Gabriel Hidalgo | gabriel.hid.orl@gmail.com | 299-329-7977
- Usá las keywords ATS detectadas de forma natural en el cuerpo

━━━ PLANTILLAS BASE DE EMAIL ━━━
Elegí la más afín al puesto y adaptala. NO la copies literal — personalizala para el aviso específico.

PLANTILLA 1 — Petróleo y Gas / Pulling / Torre / Well Control:
---
Buenos días, {name}

Quisiera acercarle mi CV para ser considerado en las búsquedas actuales o futuras que se desarrollen en {company}.

Soy Técnico Superior en Petróleo y Gas (I.S.E.T. N° 812), con experiencia en operaciones de campo en intervención de pozos, mantenimiento de equipos de pozo, control de sistemas hidráulicos y aplicación de protocolos HSE en locación. Me desempeñé bajo diagramas rotativos en entornos de alta exigencia operativa, alcanzando la categoría IV con habilitación para Enganchador.

Cuento con certificaciones vigentes de Well Control (ITP y PAE), Coiled Tubing, H2S Alive y Trabajo en Altura, entre otras. Adicionalmente, me encuentro cursando la Tecnicatura Universitaria en Programación (UTN), formación que complementa mi perfil técnico y me permite adaptarme con facilidad a los sistemas y tecnologías utilizados en la industria.

Resido en Neuquén, poseo carnet de conducir vigente y disponibilidad inmediata para trabajar bajo regímenes rotativos.

Adjunto mi CV para su consideración y quedo a disposición para ampliar cualquier información que consideren necesaria.

Muchas gracias por su tiempo.

Saludos cordiales,
Gabriel Hidalgo
Técnico Superior en Petróleo y Gas
299-329-7977
---

PLANTILLA 2 — Mantenimiento Industrial / Hidráulica / Automatización / Instrumentación:
---
Estimado/a {name}

Me comunico para dejar mi CV a consideración para posiciones técnicas en el área de mantenimiento industrial, sistemas hidráulicos o automatización que se desarrollen en {company}.

Soy Técnico Superior con experiencia en mantenimiento preventivo y correctivo de sistemas hidráulicos de alta presión, instrumentación y automatización de procesos (Fundación YPF, 336 hs.). Me desempeñé en el sector de servicios industriales petroleros (DLS Argentina) y en el área hidráulica industrial (Fluodinámica S.A.), con certificaciones HSE vigentes y capacidad de trabajo en campo bajo regímenes rotativos.

Cuento con formación en programación (UTN, en curso) orientada a la digitalización y automatización de procesos industriales.

Adjunto mi CV. Quedo a disposición para ampliar información o coordinar una entrevista.

Saludos cordiales,
Gabriel Orlando Hidalgo
299-329-7977
Plottier, Neuquén | Disponibilidad inmediata | Licencia B1
---

PLANTILLA 3 — Operativo / Logístico / Seguridad / Multirol:
---
Estimado/a {name}

Les escribo para presentar mi CV a consideración para posiciones operativas, logísticas o de seguridad industrial, que se desarrollen en {company}.

Soy Técnico Superior con experiencia en operaciones de campo, gestión de seguridad (HSE), coordinación logística y atención técnica a clientes. Trabajé en entornos de alta exigencia bajo procedimientos estrictos y regímenes rotativos, con múltiples certificaciones de seguridad industrial vigentes (H2S Alive, Trabajo en Altura, RCP, SSMA). Tengo perfil polivalente con facilidad para adaptarme a distintos contextos operativos.

Cuento con disponibilidad inmediata y licencia de conducir B1 vigente.

Adjunto mi CV. Quedo a disposición para cualquier consulta.

Saludos cordiales,
Gabriel Orlando Hidalgo
299-329-7977
Plottier, Neuquén | Disponibilidad inmediata | Licencia B1
---

3. Después de generar el email, llamá SIEMPRE a la herramienta guardar_resumen automáticamente con los datos del análisis.

4. Si el usuario hace preguntas de seguimiento (cómo llenar un formulario, qué responder, cómo mejorar algo), respondé de forma concreta con ejemplos.

5. Si el usuario pega un nuevo aviso, repetí el proceso completo desde el paso 2."""

# ── Definición de tools ───────────────────────────────────────────────────────

_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "guardar_resumen",
            "description": "Guarda en la base de datos un resumen de la búsqueda analizada. Llamá esta herramienta AUTOMÁTICAMENTE inmediatamente después de generar el email, sin esperar confirmación del usuario.",
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


def _fetch_url(url: str) -> str:
    """Descarga una URL y extrae el texto visible. Devuelve el texto o mensaje de error."""
    import requests
    from html.parser import HTMLParser

    class _TextExtractor(HTMLParser):
        def __init__(self):
            super().__init__()
            self._skip = False
            self.parts: list[str] = []

        def handle_starttag(self, tag, attrs):
            if tag in ("script", "style", "nav", "footer", "head", "noscript"):
                self._skip = True

        def handle_endtag(self, tag):
            if tag in ("script", "style", "nav", "footer", "head", "noscript"):
                self._skip = False

        def handle_data(self, data):
            if not self._skip:
                stripped = data.strip()
                if stripped:
                    self.parts.append(stripped)

    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        }
        resp = requests.get(url, headers=headers, timeout=12)
        resp.raise_for_status()
        extractor = _TextExtractor()
        extractor.feed(resp.text)
        text = "\n".join(extractor.parts)
        return text[:10000]
    except Exception as exc:
        return (
            f"No se pudo acceder al enlace ({exc}). "
            "Por favor pegá el texto del aviso directamente o subí una captura de pantalla."
        )


async def run_chat(
    session_id: int,
    history: list[dict],
    user_text: str,
    image_b64: Optional[str] = None,
    image_mime: str = "image/jpeg",
) -> str:
    """Envía el mensaje al agente Groq (Llama) y devuelve su respuesta."""

    # Si el usuario pegó una URL, la descargamos y la incluimos como texto
    if user_text and not image_b64 and user_text.strip().startswith(("http://", "https://")):
        url = user_text.strip()
        fetched = _fetch_url(url)
        user_text = f"Analizá este aviso de trabajo (fuente: {url}):\n\n{fetched}"

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
