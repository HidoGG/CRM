"""Tests de render de plantillas, inferencia de empresa/contacto y schemas."""
import pytest
from pydantic import ValidationError

from modules.crm_service import render_template
from modules.ocr_service import infer_company, infer_contact, infer_status
from modules.schemas import ContactCreate, ScheduleCreate


def test_render_template_replaces_placeholders():
    template = {"subject": "CV - {company}", "body": "{name},\n\nHola desde {company}."}
    contact = {"name": "Ana", "company": "YPF", "email": "ana@ypf.com"}
    out = render_template(template, contact)
    assert out["subject"] == "CV - YPF"
    assert out["body"] == "Ana,\n\nHola desde YPF."


def test_render_template_without_name_drops_orphan_line():
    template = {"subject": "CV - {company}", "body": "{name},\n\nHola desde {company}."}
    contact = {"name": "", "company": "YPF", "email": "x@ypf.com"}
    out = render_template(template, contact)
    assert "{name}" not in out["body"]
    assert not out["body"].startswith(",")


def test_render_template_without_company_uses_fallback():
    template = {"subject": "CV - {company}", "body": "{name}: {company}"}
    contact = {"name": "Ana", "company": None, "email": "a@b.com"}
    out = render_template(template, contact)
    assert out["subject"] == "CV - su empresa"


def test_infer_company_overrides_and_tlds():
    assert infer_company("ypf.com") == "YPF"
    assert infer_company("slb.com") == "SLB"
    assert infer_company("empresa.com.ar") == "Empresa"
    assert infer_company("meieryfischer.com.ar") == "Meieryfischer"
    assert infer_company("") is None


def test_infer_contact_personal_vs_generic():
    assert infer_contact("juan.perez@x.com") == "Juan Perez"
    assert infer_contact("info@x.com") == "A quien corresponda"
    assert infer_contact("rrhh@x.com") == "A quien corresponda"
    assert infer_contact("jp2024@x.com") == "A quien corresponda"  # solo iniciales


def test_infer_status_from_contact():
    assert infer_status("A quien corresponda") == "revisar"
    assert infer_status("Juan Perez") == "mantener"


def test_contact_create_normalizes_and_validates_email():
    c = ContactCreate(email="  Foo@BAR.com ", name="Test")
    assert c.email == "foo@bar.com"
    with pytest.raises(ValidationError):
        ContactCreate(email="no-es-email", name="Test")


def test_schedule_create_bounds():
    s = ScheduleCreate(name="Normal")
    assert s.interval_minutes == 30 and s.start_hour_art == 8
    with pytest.raises(ValidationError):
        ScheduleCreate(name="X", start_hour_art=25)
    with pytest.raises(ValidationError):
        ScheduleCreate(name="X", interval_minutes=0)
