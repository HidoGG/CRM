"""
Migración puntual: asigna follow_up_date a contactos con next_action='enviar'
que no tienen fecha de seguimiento asignada.

Esto corrige los 79 contactos históricos que quedaron sin fecha cuando el scheduler
enviaba emails pero no actualizaba contacts.follow_up_date.

Ejecutar UNA sola vez desde backend/:
    cd backend && python ../tools/run_migration_follow_up_date.py
"""
import sys
import os

# Asegurar que modules/ esté en el path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/../backend")

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "../backend/.env"))

from modules.database import get_session
from sqlalchemy import text

def run():
    with get_session() as session:
        # Verificar cuántos hay antes
        count_before = session.execute(text(
            "SELECT COUNT(*) FROM contacts WHERE next_action = 'enviar' AND follow_up_date IS NULL"
        )).scalar()
        print(f"Contactos con next_action='enviar' y sin fecha: {count_before}")

        if count_before == 0:
            print("Nada que migrar.")
            return

        result = session.execute(text("""
            UPDATE contacts
            SET follow_up_date = CURRENT_DATE + 3
            WHERE next_action = 'enviar' AND follow_up_date IS NULL
        """))
        print(f"Contactos actualizados: {result.rowcount}")

        count_after = session.execute(text(
            "SELECT COUNT(*) FROM contacts WHERE next_action = 'enviar' AND follow_up_date IS NULL"
        )).scalar()
        print(f"Contactos sin fecha restantes: {count_after}")

if __name__ == "__main__":
    run()
