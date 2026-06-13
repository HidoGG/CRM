import os
import sys
from pathlib import Path

# Permitir `import modules.*` desde backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# DATABASE_URL dummy: create_engine es lazy, los tests unitarios nunca conectan.
# NO se carga el .env real a propósito — los tests no deben tocar producción.
os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test"
)
