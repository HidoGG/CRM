"""Agente de RRHH personalizado para búsqueda laboral de Gabriel Hidalgo.

Usa OpenAI Agents SDK con GPT-4o. Tiene acceso al perfil completo del usuario
y herramientas para analizar avisos, generar emails y verificar ATS.
"""
from __future__ import annotations

import base64
import os
from typing import Optional

from agents import Agent, Runner, function_tool
from sqlmodel import Session, text

from modules.database import engine, now_utc

# ── System prompt con perfil completo ────────────────────────────────────────

_SYSTEM_PROMPT = """
Sos un consultor experto en RRHH, reclutamiento en Oil & Gas Argentina,
optimización de CVs para sistemas ATS, y búsqueda laboral en la Patagonia.
Tenés más de 15 años de experiencia ayudando a técnicos industriales a
conseguir empleo en la cuenca neuquina.

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
  Materias clave: Automatismos y Control, Mediciones e Instalaciones Eléctricas,
  Mecánica de Fluidos, Sistemas Integrados de Gestión, Perforación y Terminación
  de Pozos, Producción, Captación y Tratamiento de Gas, Mantenimiento y Confiabilidad

• Tecnicatura en Programación — UTN | En curso
  POO, estructuras de datos, bases de datos, desarrollo de software industrial

━━━ EXPERIENCIA LABORAL ━━━
Fluodinámica S.A. — Jun 2025 – Sep 2025 (contrato temporal, Neuquén)
  Técnico en Mantenimiento – Sistemas Hidráulicos y Soporte Técnico
  • Armado, prueba hidráulica y certificación de mangueras de alta presión
  • Verificación de presiones y estanqueidad bajo normas técnicas
  • Asesoramiento técnico a clientes industriales (selección de componentes,
    especificaciones de presión, compatibilidad de materiales)
  • Control de stock, gestión logística, coordinación con proveedores

DLS Argentina — Dic 2023 – Mar 2025 (Neuquén)
  Operario de Pulling / Intervención de Pozos
  Ingresante Cat. I → Peón Práctico Cat. IV | Habilitado Enganchador
  (Desvinculación: reducción de personal masiva de la empresa, ~60 personas)
  • Ejecución de maniobras críticas en torre y boca de pozo bajo estándares HSE
  • Enganchador en torre: enganche/desenganche de varillas y tubulares en altura;
    corrida y corte de cable de aparejo y pistoneo
  • Montaje y desmontaje de BOP, pruebas de certificación en boca de pozo
  • Control y mantenimiento preventivo: BOP, bombas de ahogo, sistemas hidráulicos
  • Gestión de fluidos de completación y control de niveles en pileta
  • Aplicación de protocolos Well Control y HSE en todas las etapas
  • Trabajo en altura ×3 renovaciones, H2S Alive, RCP vigentes

Hotel Amerian — Ene 2014 – Feb 2016 | Empleado de Recepción
Ejército Argentino — May 2011 – Jul 2012 | Soldado Voluntario

━━━ CERTIFICACIONES (504+ hs) ━━━
Fundación YPF (336 hs totales, 84 hs c/u):
  • Instrumentación Industrial Nivel Inicial (sensores, transmisores, lazos de control)
  • Automatización Nivel Inicial (lógica de control, automatismos, control discreto/continuo)
  • Instalaciones Eléctricas Nivel Inicial (tableros, protecciones, cableado industrial)
  • Energías Renovables Nivel Inicial (fotovoltaica, integración a red)

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
Preferencia: no torre si hay alternativa, pero acepta si es necesario
Disponibilidad: inmediata

━━━ INSTRUCCIONES DE COMPORTAMIENTO ━━━
1. Respondé SIEMPRE en español rioplatense. Sé directo y concreto.
2. Cuando recibas un aviso de trabajo (imagen, PDF o texto):
   - Extraé empresa, cargo, requisitos técnicos y blandos
   - Evaluá el nivel de encaje de Gabriel (alto/medio/bajo) y por qué
   - Indicá cuál CV usar de los 4 disponibles
   - Ofrecé generar el email personalizado
3. Cuando generes un email:
   - Asunto: específico, menciona el puesto y un diferenciador clave
   - Cuerpo: 3 párrafos máximo, tono profesional pero natural (no corporativo)
   - Párrafo 1: conexión con el puesto y propuesta de valor
   - Párrafo 2: 2-3 logros/certificaciones más relevantes para ESE puesto
   - Párrafo 3: cierre con disponibilidad y call to action
4. Si el usuario pregunta cómo llenar un formulario o qué responder en una situación,
   dá una respuesta concreta con ejemplos de qué escribir o decir.
5. Cuando el usuario confirme que va a aplicar a una búsqueda, preguntá si querés
   que guarde un resumen de esa búsqueda para referencia futura.
"""

# ── Herramientas (tools) ─────────────────────────────────────────────────────

@function_tool
def guardar_resumen_busqueda(
    session_id: int,
    empresa: str,
    cargo: str,
    resumen_requisitos: str,
    cv_recomendado: str,
    asunto_email: str,
    cuerpo_email: str,
) -> str:
    """
    Guarda en la base de datos un resumen de la búsqueda analizada.
    Usar cuando el usuario confirme que quiere guardar la búsqueda o que va a aplicar.

    Args:
        session_id: ID de la sesión actual (provisto por el sistema)
        empresa: Nombre de la empresa que publica la búsqueda
        cargo: Nombre del puesto o cargo
        resumen_requisitos: 2-4 líneas con los requisitos clave del aviso
        cv_recomendado: Cuál de los 4 CVs usar (ej: "CV Petróleo y Gas")
        asunto_email: Asunto del email generado
        cuerpo_email: Cuerpo del email generado
    """
    with Session(engine) as db:
        title = f"{empresa} — {cargo}" if empresa and cargo else (cargo or empresa or "Búsqueda sin título")
        db.execute(
            text("""
                UPDATE career_sessions
                SET title = :title,
                    company = :empresa,
                    role = :cargo,
                    summary = :resumen,
                    email_subject = :asunto,
                    email_body = :cuerpo,
                    updated_at = :now
                WHERE id = :session_id
            """),
            {
                "title": title[:200],
                "empresa": empresa,
                "cargo": cargo,
                "resumen": resumen_requisitos,
                "asunto": asunto_email,
                "cuerpo": cuerpo_email,
                "now": now_utc(),
                "session_id": session_id,
            },
        )
        db.commit()
    return f"Búsqueda guardada: {title}"


# ── Definición del agente ────────────────────────────────────────────────────

def build_agent(session_id: int) -> Agent:
    """Construye el agente con el session_id inyectado en el tool."""

    @function_tool
    def guardar_resumen(
        empresa: str,
        cargo: str,
        resumen_requisitos: str,
        cv_recomendado: str,
        asunto_email: str,
        cuerpo_email: str,
    ) -> str:
        """
        Guarda en la base de datos un resumen de la búsqueda analizada.
        Usar cuando el usuario diga que va a aplicar o quiera guardar la búsqueda.

        Args:
            empresa: Nombre de la empresa
            cargo: Nombre del puesto o cargo
            resumen_requisitos: 2-4 líneas con los requisitos clave
            cv_recomendado: Cuál de los 4 CVs usar
            asunto_email: Asunto del email generado (o vacío si no se generó)
            cuerpo_email: Cuerpo del email generado (o vacío si no se generó)
        """
        return guardar_resumen_busqueda(
            session_id=session_id,
            empresa=empresa,
            cargo=cargo,
            resumen_requisitos=resumen_requisitos,
            cv_recomendado=cv_recomendado,
            asunto_email=asunto_email,
            cuerpo_email=cuerpo_email,
        )

    return Agent(
        name="AsistenteHR",
        instructions=_SYSTEM_PROMPT,
        model=os.getenv("OPENAI_MODEL", "gpt-4o"),
        tools=[guardar_resumen],
    )


# ── Función principal de chat ────────────────────────────────────────────────

async def run_chat(
    session_id: int,
    history: list[dict],
    user_text: str,
    image_b64: Optional[str] = None,
    image_mime: str = "image/jpeg",
) -> str:
    """
    Ejecuta el agente con el historial de la sesión y el nuevo mensaje del usuario.
    Devuelve el texto de respuesta del agente.

    Args:
        session_id: ID de la sesión en DB (para el tool guardar_resumen)
        history: Lista de dicts {"role": "user"|"assistant", "content": "..."}
                 con los mensajes anteriores de la sesión
        user_text: Texto del mensaje actual del usuario
        image_b64: Imagen en base64 (opcional)
        image_mime: MIME type de la imagen
    """
    # Construir el contenido del mensaje actual
    if image_b64:
        user_content = [
            {
                "type": "image_url",
                "image_url": {"url": f"data:{image_mime};base64,{image_b64}"},
            },
            {"type": "text", "text": user_text or "Analizá esta imagen."},
        ]
    else:
        user_content = user_text

    # Construir el input completo: historial previo + mensaje actual
    input_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in history
    ]
    input_messages.append({"role": "user", "content": user_content})

    agent = build_agent(session_id)
    result = await Runner.run(agent, input_messages)
    return str(result.final_output)
