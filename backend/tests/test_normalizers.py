"""Tests de normalizadores y parsers de fecha (puros, sin DB)."""
from datetime import date, datetime, timedelta, timezone

from modules.crm_service import (
    clean_optional,
    infer_follow_up_date_for_action,
    merge_notes,
    normalize_email,
    normalize_follow_up_date,
    normalize_next_action,
    normalize_status,
    parse_iso_date,
    parse_iso_datetime,
)


def test_normalize_status_accepts_valid_values():
    for value in ("mantener", "revisar", "seguimiento", "prioridad", "sacar", "portal"):
        assert normalize_status(value) == value
    assert normalize_status("  Mantener ") == "mantener"


def test_normalize_status_falls_back_to_revisar():
    assert normalize_status("inexistente") == "revisar"
    assert normalize_status(None) == "revisar"


def test_normalize_next_action():
    assert normalize_next_action("ENVIAR") == "enviar"
    assert normalize_next_action("cualquiercosa") == "revisar_manual"
    assert normalize_next_action(None) == "revisar_manual"


def test_normalize_follow_up_date_from_string():
    assert normalize_follow_up_date("2026-06-12") == date(2026, 6, 12)
    assert normalize_follow_up_date("") is None
    assert normalize_follow_up_date("no-es-fecha") is None
    assert normalize_follow_up_date(None) is None


def test_normalize_follow_up_date_passthrough_objects():
    d = date(2026, 6, 12)
    assert normalize_follow_up_date(d) == d
    dt = datetime(2026, 6, 12, 15, 30, tzinfo=timezone.utc)
    assert normalize_follow_up_date(dt) == d


def test_infer_follow_up_date_for_action():
    today = datetime.now(timezone.utc).date()
    assert infer_follow_up_date_for_action("enviar") == today + timedelta(days=3)
    assert infer_follow_up_date_for_action("seguir") == today + timedelta(days=7)
    assert infer_follow_up_date_for_action("portal") is None
    assert infer_follow_up_date_for_action(None) is None


def test_parse_iso_datetime_polymorphic():
    aware = datetime(2026, 6, 12, 10, 0, tzinfo=timezone.utc)
    assert parse_iso_datetime(aware) == aware
    naive = datetime(2026, 6, 12, 10, 0)
    assert parse_iso_datetime(naive) == aware
    assert parse_iso_datetime("2026-06-12T10:00:00+00:00") == aware
    assert parse_iso_datetime("2026-06-12T10:00:00Z") == aware
    assert parse_iso_datetime("2026-06-12T10:00:00") == aware  # naive = UTC
    assert parse_iso_datetime("basura") is None
    assert parse_iso_datetime(None) is None


def test_parse_iso_date_polymorphic():
    assert parse_iso_date(date(2026, 6, 12)) == date(2026, 6, 12)
    assert parse_iso_date(datetime(2026, 6, 12, 23, 0)) == date(2026, 6, 12)
    assert parse_iso_date("2026-06-12") == date(2026, 6, 12)
    assert parse_iso_date("") is None


def test_normalize_email():
    assert normalize_email("  Foo@Bar.COM ") == "foo@bar.com"
    assert normalize_email("") is None
    assert normalize_email(None) is None


def test_clean_optional():
    assert clean_optional("  hola  ") == "hola"
    assert clean_optional("   ") is None
    assert clean_optional(None) is None


def test_merge_notes():
    assert merge_notes("a", "b") == "a\nb"
    assert merge_notes(None, "b") == "b"
    assert merge_notes("a", None) == "a"
    assert merge_notes(None, None) is None
