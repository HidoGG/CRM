from fastapi import FastAPI
from app.database import create_db_and_tables

app = FastAPI(title="CRM IA Local API", version="1.0.0")

@app.on_event("startup")
def on_startup():
    # Inicializa las tablas si no existen al arrancar la app.
    create_db_and_tables()

@app.get("/health")
def health_check():
    return {"status": "ok", "app": "CRM IA Local API"}
