"""Agente de RRHH personalizado para búsqueda laboral de Gabriel Hidalgo.

Usa Google Gemini (google-generativeai) con function calling nativo.
Modelo por defecto: gemini-3.5-flash.
"""
from __future__ import annotations

import base64 as b64_module
import io
import ipaddress
import os
import socket
from typing import Optional
from urllib.parse import urlparse

import google.generativeai as genai
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

genai.configure(api_key=os.environ["GEMINI_API_KEY"])
_MODEL_NAME = os.getenv("CAREER_GEMINI_MODEL", "gemini-3.5-flash")

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

2. Cuando recibas un aviso de trabajo (imagen, PDF, link o texto pegado), respondé SIEMPRE
   con este formato EXACTO — mismos títulos, emojis y separadores, sin cambiarlos, sin
   resumirlos ni saltear secciones:

───────────────────────────────
🎯 ANÁLISIS DEL PUESTO

Empresa: [nombre de la empresa, o "No especificada" si el aviso no la menciona]
Cargo: [nombre del puesto]
Encaje: [Alto/Medio/Bajo] ✓
Motivo: [1-3 líneas, basado en el perfil real de Gabriel]

📋 CV A USAR: [uno de los 4 CVs disponibles]
Tip: [qué destacar de su experiencia/certificaciones para ESTE puesto puntual]

🔑 KEYWORDS ATS DETECTADAS
Incluí estas palabras exactas en el CV y el email para pasar los filtros automáticos:
[keywords del aviso, separadas por coma]

📨 ENVIAR A
[email de la empresa si el aviso lo menciona, o "No especificado" si no aparece]

───────────────────────────────
📧 ASUNTO DEL EMAIL
[asunto específico, menciona el puesto y un diferenciador clave]

✉️ CUERPO DEL EMAIL
[email de 3 párrafos máximo, tono profesional pero natural (no corporativo):
 párrafo 1 = conexión con el puesto y propuesta de valor;
 párrafo 2 = 2-3 logros/certificaciones más relevantes para ESE puesto;
 párrafo 3 = cierre con disponibilidad y llamado a la acción]
───────────────────────────────

3. Generá el análisis Y el email completos en el mismo mensaje, sin preguntar antes si
   redactás el email — Gabriel lo quiere listo para copiar de una.

4. Si el usuario pregunta cómo llenar un formulario o qué responder (y no es un aviso nuevo
   para analizar), respondé en lenguaje natural, sin forzar el template de arriba — dá una
   respuesta concreta con ejemplos.

5. Apenas termines de armar el análisis y el email del paso 2-3 (en ese mismo turno, ANTES de
   mostrárselo a Gabriel, sin esperar que él confirme nada aparte), llamá a la herramienta
   guardar_resumen para registrar la búsqueda (empresa, cargo, resumen de requisitos, CV
   recomendado, asunto y cuerpo del email). Esto es automático cada vez que analizás un aviso
   nuevo — habilita el botón de generar CV y actualiza el título de la búsqueda en su
   historial. Si más adelante el análisis cambia (otro CV, email reescrito), volvé a llamar la
   herramienta para actualizar lo guardado.

6. NUNCA inventes ni exageres datos, logros, certificaciones o experiencia de Gabriel que no
   estén en su perfil real de arriba. No copies frases textuales del aviso como si fueran su
   experiencia. Evaluá el encaje con honestidad — si es Medio o Bajo, decilo así, no lo
   infles a Alto para quedar bien."""


# ── Tool (función Python — Gemini extrae el schema automáticamente) ───────────

def _make_guardar_resumen(session_id: int):
    """Crea la función tool con session_id capturado en el closure."""

    def guardar_resumen(
        empresa: str,
        cargo: str,
        resumen_requisitos: str,
        cv_recomendado: str,
        asunto_email: str,
        cuerpo_email: str,
    ) -> str:
        """Guarda en la base de datos un resumen de la búsqueda analizada.
        Usá esta herramienta cuando el usuario confirme que va a aplicar,
        que quiere guardar la búsqueda, o cuando el email generado esté listo.

        Args:
            empresa: Nombre de la empresa que publica la búsqueda.
            cargo: Nombre del puesto o cargo.
            resumen_requisitos: 2-4 líneas con los requisitos clave del aviso.
            cv_recomendado: Cuál de los 4 CVs usar para esta búsqueda.
            asunto_email: Asunto del email generado (cadena vacía si no se generó).
            cuerpo_email: Cuerpo del email generado (cadena vacía si no se generó).
        """
        title = f"{empresa} — {cargo}" if empresa and cargo else (cargo or empresa or "Búsqueda sin título")
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
                    "resumen":    resumen_requisitos,
                    "asunto":     asunto_email,
                    "cuerpo":     cuerpo_email,
                    "now":        now_utc(),
                    "session_id": session_id,
                },
            )
            db.commit()
        return f"Búsqueda guardada: {title}"

    return guardar_resumen


# ── Función principal de chat ────────────────────────────────────────────────

async def run_chat(
    session_id: int,
    history: list[dict],
    user_text: str,
    image_b64: Optional[str] = None,
    image_mime: str = "image/jpeg",
) -> str:
    """
    Envía el mensaje del usuario al agente Gemini y devuelve su respuesta.
    Maneja el bucle de function calling internamente.
    """
    import PIL.Image

    guardar_resumen_fn = _make_guardar_resumen(session_id)

    model = genai.GenerativeModel(
        model_name=_MODEL_NAME,
        system_instruction=_SYSTEM_PROMPT,
        tools=[guardar_resumen_fn],
    )

    # Convertir historial previo al formato de Gemini (user/model)
    gemini_history = []
    for m in history:
        role = "model" if m["role"] == "assistant" else "user"
        gemini_history.append({"role": role, "parts": [m["content"]]})

    chat = model.start_chat(history=gemini_history)

    # Construir el contenido del mensaje actual
    if image_b64:
        image_bytes = b64_module.b64decode(image_b64)
        pil_image = PIL.Image.open(io.BytesIO(image_bytes))
        parts = [pil_image, user_text or "Analizá esta imagen."]
    else:
        parts = [user_text]

    # Bucle de agentic loop: continuar mientras Gemini quiera llamar funciones
    response = chat.send_message(parts)

    while True:
        # Revisar si hay function calls
        fn_calls = [p.function_call for p in response.parts if p.function_call.name]

        if not fn_calls:
            # Sin function calls → extraer texto y devolver
            text_parts = [p.text for p in response.parts if hasattr(p, "text") and p.text]
            return "\n".join(text_parts).strip() or "Sin respuesta del agente."

        # Ejecutar todas las function calls
        fn_responses = []
        for fn_call in fn_calls:
            args = dict(fn_call.args)
            if fn_call.name == "guardar_resumen":
                result = guardar_resumen_fn(**args)
            else:
                result = f"Función '{fn_call.name}' no reconocida."

            fn_responses.append(
                genai.protos.Part(
                    function_response=genai.protos.FunctionResponse(
                        name=fn_call.name,
                        response={"result": result},
                    )
                )
            )

        # Enviar resultados y continuar el loop
        response = chat.send_message(fn_responses)
