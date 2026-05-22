from pathlib import Path
from sqlmodel import create_engine, Session, SQLModel
# Import models to ensure they are registered with SQLModel's metadata
from app.models import Contact, Import, ImportCandidate, History, ReportingSnapshot

DATA_DIR = Path.home() / "AppData" / "Local" / "CRMIA"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{DATA_DIR}/crm.sqlite3"

# connect_args = {"check_same_thread": False} permite acceder a SQLite desde multiples workers en FastAPI,
# respetando la Regla de Oro que hablamos antes.
engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
