"""
Corrige nombres de empresa en la tabla contacts.
Cada corrección fue verificada con búsqueda en internet.
"""
import psycopg

DIRECT_URL = (
    "postgresql://postgres:com_911recapoit10"
    "@db.wnfpfjhofcfsdqlbbxiv.supabase.co:5432/postgres"
)

# (email_pattern, nuevo_nombre)
# email_pattern usa LIKE de SQL: % = cualquier cadena
DOMAIN_FIXES = [
    # ── Verificadas con búsquedas en internet ──────────────────────────────
    ("%@consultorasei.com",          "Grupo SEI"),
    ("%@tracegroup.com.ar",          "Trace Group S.A."),
    ("%@cnsapag.com.ar",             "CN SAPAG S.A."),
    ("%@quintanawellpro.com",        "Quintana WellPro S.A."),
    ("%@serialrh.com",               "Serial RH"),
    ("%@skaneu.com.ar",              "Skaneu S.A."),
    ("%@bacssa.com",                 "BACS S.A."),
    ("%@grupobrako.com.ar",          "Grupo BRAKO"),
    ("%@axisaustral.com.ar",         "Axis Austral"),
    ("%@ibcarg.com",                 "IBC ARG"),
    ("%@wpssrl.com.ar",              "Wellbore Petrol Services"),
    ("%@tetratec.com",               "TETRA Technologies"),
    ("%@dgconsultores.com.ar",       "DG Consultores"),
    ("%@pccomahue.com.ar",           "PC del Comahue"),
    ("%@tuboscope.com.ar",           "Tuboscope Vetco"),
    ("%@consultorahrs.com.ar",       "Consultora HRS"),
    ("%@sacde.com.ar",               "SACDE"),
    ("%@bakerhughes.com",            "Baker Hughes"),
    ("%@exprogroup.com",             "Expro Group"),
    # ── Nombres de dominio mal formateados ─────────────────────────────────
    ("%@imgsrl.com.ar",              "IMG SRL"),
    ("%@polyarsacif.com.ar",         "POLYAR SACIF"),
    ("%@opensrl.com.ar",             "Open SRL"),
    ("%@soipesrl.com.ar",            "SOIPE SRL"),
    ("%@transbox.com.ar",            "Transbox"),
    ("%@comercialargentina.com.ar",  "Comercial Argentina"),
    ("%@cimsesrl.com.ar",            "CIMSE SRL"),
    ("%@cisingenieria.com",          "CIS Ingeniería"),
    ("%@codesin.com.ar",             "CODESIN"),
    ("%@ecokit.com.ar",              "ECOKIT"),
    ("%@edvsa.com",                  "EDVSA"),
    ("%@altamoreehijos.com.ar",      "Altamore e Hijos"),
    ("%@artegrafneuquen.com.ar",     "Artegraff Neuquén"),
    ("%@bminspecciones.com",         "BM Inspecciones"),
    ("%@cabarcosmotores.com.ar",     "Cabarcos Motores"),
    ("%@caslaralquiler.com",         "CASLAR Alquiler"),
    ("%@cemelar.com.ar",             "CEMELAR"),
    ("%@santacruzoyg.com.ar",        "Santa Cruz O&G"),
    ("%@copgo.com",                  "COPGO"),
    ("%@alcoservicios.com.ar",       "Alco Servicios"),
    ("%@cgs-srl.com.ar",             "CGS SRL"),
    ("%@leimat.com.ar",              "LEIMAT"),
    ("%@falkensrl.com.ar",           "FALKEN SRL"),
    ("%@rjingenieria.com.ar",        "RJ Ingeniería"),
    ("%@pgasrl.com.ar",              "PGA SRL"),
    ("%@metalurgicarp.com.ar",       "Metalúrgica RP"),
    ("%@milruedas.com.ar",           "Mil Ruedas"),
    ("%@rolcka.com",                 "ROLCKA"),
    ("%@sermasa.com.ar",             "SERMASA"),
    ("%@sermico.com.ar",             "SERMICO"),
    ("%@serviciospyc.com",           "Servicios P&C"),
    ("%@serviciospyc.com.ar",        "Servicios P&C"),
    ("%@simetra.com.ar",             "SIMETRA"),
    ("%@tecbras.com.ar",             "TECBRAS"),
    ("%@tecprecinc.com",             "TECPREC"),
    ("%@tescocorp.com",              "TESCO Corp"),
    ("%@ipeneuquen.com.ar",          "IPE Neuquén"),
    ("%@jasservicios.com.ar",        "JAS Servicios"),
    ("%@soldaduratotal.com.ar",      "Soldadura Total"),
    ("%@zillesrl.com.ar",            "Zille SRL"),
    ("%@grupocomarsa.com",           "Grupo COMARSA"),
    ("%@hidromec.com",               "HIDROMEC"),
    ("%@indarsa.com",                "INDARSA"),
    ("%@fafasociados.com",           "FAF Asociados"),
    ("%@opsargentina.com.ar",        "OPS Argentina"),
    ("%@opssrl.com",                 "OPS SRL"),
    ("%@oleontec.com.ar",            "Oleontec"),
    ("%@olentec.com.ar",             "Oleontec"),
    ("%@petrogassa.com",             "Petrogas S.A."),
    ("%@eltronadorsrl.com.ar",       "El Tronador SRL"),
    ("%@rodialsa.com",               "RODIAL S.A."),
    ("%@kitersimha.com",             "Kitersimha"),
    ("%@basani.com.ar",              "Basani"),
    ("%@brujula-sa.com",             "Brujula S.A."),
    ("%@brujula.com.ar",             "Brujula S.A."),
    ("%@segrup.com.ar",              "SEGRUP"),
    ("%@victorcontreras.com.ar",     "Víctor Contreras"),
    ("%@recyser.com.ar",             "RECYSER"),
    ("%@alphaoiltools.com.ar",       "Alpha Oil Tools"),
    ("%@msasafety.com",              "MSA Safety"),
    ("%@fundacionpotenciar.org",     "Fundación Potenciar"),
    ("%@supplypetrolero.com.ar",     "Supply Petrolero"),
    ("%@dantepinturerias.com.ar",    "Dante Pinturerías"),
    ("%@meieryfischer.com.ar",       "Meier y Fischer"),
    ("%@ecostim-es.com",             "Ecostim"),
    ("%@marami.com.ar",              "MARAMI"),
    ("%@mocciola.com.ar",            "Mocciola"),
    ("%@oldelval.com",               "OLDELVAL"),
    ("%@petrooeste.com.ar",          "Petrooeste"),
    ("%@copelnet.com.ar",            "Copelnet / INBECK"),
    ("%@hoerbiger.com",              "Hoerbiger"),
    ("%@lockwood.com.ar",            "Lockwood"),
    ("%@mauad.net",                  "Mauad"),
    ("%@siderca.com",                "Siderca (Tenaris)"),
    ("%@tausa.com.ar",               "TAUSA"),
    ("%@bolland.com.ar",             "Bolland"),
    ("%@sbl.com",                    "SBL"),
    ("%@comaseg.com.ar",             "COMASEG"),
    ("%@metalurgica-smr.com.ar",     "Metalúrgica SMR"),
    ("%@aesa.com.ar",                "AESA"),
    ("%@seep.com.ar",                "SEEP"),
    ("%@petreven.com",               "Petreven"),
]

# Emails exactos donde el dominio es genérico pero la empresa es conocida
EXACT_EMAIL_FIXES = [
    ("adm.ecoaike@gmail.com",           "Ecoaike"),
    ("cgssrl.recepcion@speedy.com.ar",  "CGS SRL"),
    ("segumax@infovia.com.ar",          "SEGUMAX"),
    ("paradigmasconsultora@gmail.com",  "Paradigmas Consultora"),
    ("geyproestudio@gmail.com",         "Geypro Estudio"),
    ("metalurgica.mara@gmail.com",      "Metalúrgica Mara"),
    ("seguridadprivadagrupo@gmail.com", "Seguridad Privada Grupo"),
    ("rolckasrl@gmail.com",             "ROLCKA"),
    ("consultorarrhhmkt@gmail.com",     "Consultora RRHH"),
    ("foodpatagonia@hotmail.com",       "Food Patagonia"),
    ("neuquenfoodpatagonia@hotmail.com","Food Patagonia"),
    ("tdcarg@hotmail.com",              "TDC ARG"),
    ("rioconstrucciones@yahoo.com.ar",  "Río Construcciones"),
    ("servipsrl@outlook.com",           "SERVIP SRL"),
]

print("Conectando a Supabase...")
with psycopg.connect(DIRECT_URL, autocommit=False) as conn:
    total_updated = 0

    # Primero los exactos (mayor prioridad)
    with conn.cursor() as cur:
        for email, new_name in EXACT_EMAIL_FIXES:
            cur.execute(
                "UPDATE contacts SET company = %s WHERE lower(email) = lower(%s) AND company != %s",
                (new_name, email, new_name)
            )
            if cur.rowcount:
                print(f"  EXACT  {email:<45} → {new_name}")
                total_updated += cur.rowcount

    # Luego por dominio
    with conn.cursor() as cur:
        for pattern, new_name in DOMAIN_FIXES:
            cur.execute(
                "UPDATE contacts SET company = %s WHERE lower(email) LIKE lower(%s) AND company != %s",
                (new_name, pattern, new_name)
            )
            if cur.rowcount:
                print(f"  DOMAIN {pattern:<45} → {new_name}  ({cur.rowcount} filas)")
                total_updated += cur.rowcount

    conn.commit()
    print(f"\n✅ Total actualizados: {total_updated} contactos")

    # Verificación final
    with conn.cursor() as cur:
        cur.execute("""
            SELECT company, COUNT(*) as n
            FROM contacts
            GROUP BY company
            ORDER BY company
        """)
        rows = cur.fetchall()
        print(f"\nResumen de empresas ({len(rows)} únicas):")
        for r in rows:
            print(f"  {r[1]:3}  {r[0]}")
