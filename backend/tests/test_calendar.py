"""Tests de la lógica de calendario ART: ventanas, domingos y distribución de lotes."""
from datetime import datetime, timezone

from modules.crm_service import (
    ART_TZ,
    _is_sending_day,
    _next_slot_start_art,
    _next_working_day,
    calc_job_scheduled_at,
)


def art(year, month, day, hour=0, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=ART_TZ)


# 2026-06-08 es lunes; 2026-06-13 sábado; 2026-06-14 domingo.

def test_sunday_is_not_sending_day():
    assert _is_sending_day(art(2026, 6, 13)) is True   # sábado
    assert _is_sending_day(art(2026, 6, 14)) is False  # domingo
    assert _is_sending_day(art(2026, 6, 8)) is True    # lunes


def test_next_working_day_skips_sunday():
    assert _next_working_day(art(2026, 6, 13)).day == 15  # sábado → lunes
    assert _next_working_day(art(2026, 6, 12)).day == 13  # viernes → sábado


def test_slot_within_window_returns_now():
    now = art(2026, 6, 8, 10, 30)  # lunes 10:30, ventana 8-18
    assert _next_slot_start_art(8, 18, now=now) == now


def test_slot_before_window_returns_window_start():
    now = art(2026, 6, 8, 6, 0)
    assert _next_slot_start_art(8, 18, now=now) == art(2026, 6, 8, 8, 0)


def test_slot_after_window_rolls_to_next_day():
    now = art(2026, 6, 8, 19, 0)  # lunes 19:00 → martes 8:00
    assert _next_slot_start_art(8, 18, now=now) == art(2026, 6, 9, 8, 0)


def test_slot_saturday_evening_rolls_to_monday():
    now = art(2026, 6, 13, 19, 0)  # sábado 19:00 → lunes 8:00 (salta domingo)
    assert _next_slot_start_art(8, 18, now=now) == art(2026, 6, 15, 8, 0)


def test_slot_on_sunday_rolls_to_monday():
    now = art(2026, 6, 14, 11, 0)  # domingo → lunes 8:00
    assert _next_slot_start_art(8, 18, now=now) == art(2026, 6, 15, 8, 0)


def test_calc_returns_utc_aware():
    schedule = {"start_hour_art": 8, "end_hour_art": 18, "interval_minutes": 30}
    result = calc_job_scheduled_at(schedule, 0, now=art(2026, 6, 8, 10, 0))
    assert result.tzinfo is not None
    assert result.utcoffset().total_seconds() == 0
    # ART = UTC-3 → 10:00 ART = 13:00 UTC
    assert result == datetime(2026, 6, 8, 13, 0, tzinfo=timezone.utc)


def test_calc_spaces_jobs_by_interval():
    schedule = {"start_hour_art": 8, "end_hour_art": 18, "interval_minutes": 30}
    now = art(2026, 6, 8, 10, 0)
    j0 = calc_job_scheduled_at(schedule, 0, now=now)
    j3 = calc_job_scheduled_at(schedule, 3, now=now)
    assert (j3 - j0).total_seconds() == 3 * 30 * 60


def test_calc_overflows_to_next_working_day():
    # Lunes 17:00, ventana hasta 18:00 → quedan 60 min.
    # job_index=4, interval=30 → remaining=120 > 60 → martes 8:00 + 60 min = 9:00
    schedule = {"start_hour_art": 8, "end_hour_art": 18, "interval_minutes": 30}
    result = calc_job_scheduled_at(schedule, 4, now=art(2026, 6, 8, 17, 0))
    assert result.astimezone(ART_TZ) == art(2026, 6, 9, 9, 0)


def test_calc_overflow_skips_sunday():
    # Sábado 17:30, ventana 8-18 → quedan 30 min.
    # job_index=2, interval=60 → remaining=120 > 30 → lunes 8:00 + 90 min = 9:30
    schedule = {"start_hour_art": 8, "end_hour_art": 18, "interval_minutes": 60}
    result = calc_job_scheduled_at(schedule, 2, now=art(2026, 6, 13, 17, 30))
    assert result.astimezone(ART_TZ) == art(2026, 6, 15, 9, 30)
