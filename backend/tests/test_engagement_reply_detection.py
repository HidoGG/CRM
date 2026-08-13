"""Tests del fallback de detección de respuestas por remitente (sin DB, sin red).

Cubre modules.engagement_service._find_reply_in_thread y
_find_reply_by_sender_search: la lógica que decide si un envío tuvo
respuesta, incluyendo el caso de auto-responders que rompen el threading
de Gmail (ver docstring de _find_reply_by_sender_search).
"""
from datetime import datetime, timezone

from modules.engagement_service import (
    _find_reply_by_sender_search,
    _find_reply_in_thread,
    _resolve_reply_thread_id,
)

MY_EMAIL = "gabriel.hid.orl@gmail.com"


def _msg(msg_id, from_addr, subject="RE: hola", extra_headers=None):
    headers = [{"name": "From", "value": from_addr}, {"name": "Subject", "value": subject}]
    for k, v in (extra_headers or {}).items():
        headers.append({"name": k, "value": v})
    return {"id": msg_id, "payload": {"headers": headers}}


class FakeThreads:
    def __init__(self, thread_id_to_result):
        self._by_id = thread_id_to_result

    def get(self, userId, id, format, metadataHeaders):  # noqa: A002
        return _Executable(self._by_id[id])


class FakeMessages:
    def __init__(self, list_result=None, get_by_id=None, raise_on_get_ids=None):
        self._list_result = list_result or {"messages": []}
        self._get_by_id = get_by_id or {}
        self._raise_on_get_ids = raise_on_get_ids or set()
        self.last_list_query = None

    def list(self, userId, q, maxResults):  # noqa: A002
        self.last_list_query = q
        return _Executable(self._list_result)

    def get(self, userId, id, format, metadataHeaders):  # noqa: A002
        if id in self._raise_on_get_ids:
            return _Executable(None, raise_exc=RuntimeError("boom"))
        return _Executable(self._get_by_id[id])


class _Executable:
    def __init__(self, value, raise_exc=None):
        self._value = value
        self._raise_exc = raise_exc

    def execute(self):
        if self._raise_exc:
            raise self._raise_exc
        return self._value


class FakeUsers:
    def __init__(self, threads=None, messages=None):
        self._threads = threads
        self._messages = messages

    def threads(self):
        return self._threads

    def messages(self):
        return self._messages


class FakeService:
    def __init__(self, threads=None, messages=None):
        self._users = FakeUsers(threads=threads, messages=messages)

    def users(self):
        return self._users


# ── _find_reply_in_thread ────────────────────────────────────────────────────

def test_find_reply_in_thread_returns_reply_from_other_party():
    thread = {"messages": [
        _msg("m1", f"{MY_EMAIL}"),
        _msg("m2", "rrhh@empresa.com", subject="RE: postulacion"),
    ]}
    service = FakeService(threads=FakeThreads({"t1": thread}))
    result = _find_reply_in_thread(service, MY_EMAIL, "t1")
    assert result is not None
    assert result["id"] == "m2"
    assert result["thread_id"] == "t1"
    assert result["subject"] == "RE: postulacion"


def test_find_reply_in_thread_no_reply_yet_single_message():
    thread = {"messages": [_msg("m1", MY_EMAIL)]}
    service = FakeService(threads=FakeThreads({"t1": thread}))
    assert _find_reply_in_thread(service, MY_EMAIL, "t1") is None


def test_find_reply_in_thread_ignores_bounce_notifications():
    thread = {"messages": [
        _msg("m1", MY_EMAIL),
        _msg("m2", "mailer-daemon@googlemail.com", subject="Delivery Status Notification (Failure)"),
    ]}
    service = FakeService(threads=FakeThreads({"t1": thread}))
    assert _find_reply_in_thread(service, MY_EMAIL, "t1") is None


def test_find_reply_in_thread_returns_none_on_api_error():
    class RaisingThreads:
        def get(self, **kwargs):
            return _Executable(None, raise_exc=RuntimeError("quota exceeded"))
    service = FakeService(threads=RaisingThreads())
    assert _find_reply_in_thread(service, MY_EMAIL, "t1") is None


# ── _find_reply_by_sender_search (fallback por threading roto) ────────────────

def test_find_reply_by_sender_search_finds_message_after_send():
    sent_at = datetime(2026, 7, 30, 11, 10, tzinfo=timezone.utc)
    reply_dt = datetime(2026, 7, 30, 15, 41, tzinfo=timezone.utc)
    contact_email = "amelamed@calfrac.com"
    messages = FakeMessages(
        list_result={"messages": [{"id": "reply1"}]},
        get_by_id={"reply1": {
            "id": "reply1",
            "threadId": "brand-new-thread",
            "internalDate": str(int(reply_dt.timestamp() * 1000)),
            "payload": {"headers": [
                {"name": "From", "value": contact_email},
                {"name": "Subject", "value": "Respuesta automática: hola"},
            ]},
        }},
    )
    service = FakeService(messages=messages)
    result = _find_reply_by_sender_search(service, contact_email, sent_at)
    assert result is not None
    assert result["id"] == "reply1"
    assert result["thread_id"] == "brand-new-thread"
    # el query debe usar epoch (segundos), no fecha, y excluir chats/sent
    assert f"after:{int(sent_at.timestamp())}" in messages.last_list_query
    assert "-in:chats" in messages.last_list_query
    assert "-in:sent" in messages.last_list_query


def test_find_reply_by_sender_search_skips_message_older_than_send():
    sent_at = datetime(2026, 7, 30, 11, 10, tzinfo=timezone.utc)
    older_dt = datetime(2026, 7, 29, 10, 0, tzinfo=timezone.utc)  # anterior al envío
    contact_email = "info@empresa.com"
    messages = FakeMessages(
        list_result={"messages": [{"id": "old1"}]},
        get_by_id={"old1": {
            "id": "old1",
            "threadId": "t9",
            "internalDate": str(int(older_dt.timestamp() * 1000)),
            "payload": {"headers": [{"name": "From", "value": contact_email}]},
        }},
    )
    service = FakeService(messages=messages)
    # Gmail's after: es granularidad de día — puede devolver algo de antes del
    # envio ese mismo dia; internalDate debe filtrarlo igual.
    assert _find_reply_by_sender_search(service, contact_email, sent_at) is None


def test_find_reply_by_sender_search_skips_bounce_notifications():
    sent_at = datetime(2026, 7, 30, 11, 10, tzinfo=timezone.utc)
    reply_dt = datetime(2026, 7, 30, 12, 0, tzinfo=timezone.utc)
    contact_email = "info@empresa.com"
    messages = FakeMessages(
        list_result={"messages": [{"id": "bounce1"}]},
        get_by_id={"bounce1": {
            "id": "bounce1",
            "threadId": "t9",
            "internalDate": str(int(reply_dt.timestamp() * 1000)),
            "payload": {"headers": [{"name": "From", "value": "mailer-daemon@googlemail.com"}]},
        }},
    )
    service = FakeService(messages=messages)
    assert _find_reply_by_sender_search(service, contact_email, sent_at) is None


def test_find_reply_by_sender_search_no_results():
    sent_at = datetime(2026, 7, 30, 11, 10, tzinfo=timezone.utc)
    service = FakeService(messages=FakeMessages(list_result={"messages": []}))
    assert _find_reply_by_sender_search(service, "info@empresa.com", sent_at) is None


def test_find_reply_by_sender_search_rejects_missing_internal_date():
    # Sin internalDate confiable no se puede confirmar que es posterior al
    # envío — debe descartarse en vez de aceptarse a ciegas (antes era al
    # revés: "0" es falsy y el guard no se disparaba).
    sent_at = datetime(2026, 7, 30, 11, 10, tzinfo=timezone.utc)
    contact_email = "info@empresa.com"
    messages = FakeMessages(
        list_result={"messages": [{"id": "no_date"}]},
        get_by_id={"no_date": {
            "id": "no_date",
            "threadId": "t9",
            "payload": {"headers": [{"name": "From", "value": contact_email}]},
        }},
    )
    service = FakeService(messages=messages)
    assert _find_reply_by_sender_search(service, contact_email, sent_at) is None


def test_find_reply_by_sender_search_rejects_malformed_internal_date():
    sent_at = datetime(2026, 7, 30, 11, 10, tzinfo=timezone.utc)
    contact_email = "info@empresa.com"
    messages = FakeMessages(
        list_result={"messages": [{"id": "bad_date"}]},
        get_by_id={"bad_date": {
            "id": "bad_date",
            "threadId": "t9",
            "internalDate": "not-a-number",
            "payload": {"headers": [{"name": "From", "value": contact_email}]},
        }},
    )
    service = FakeService(messages=messages)
    assert _find_reply_by_sender_search(service, contact_email, sent_at) is None


def test_find_reply_by_sender_search_returns_none_on_list_error():
    class RaisingMessages(FakeMessages):
        def list(self, **kwargs):
            return _Executable(None, raise_exc=RuntimeError("boom"))
    service = FakeService(messages=RaisingMessages())
    sent_at = datetime(2026, 7, 30, 11, 10, tzinfo=timezone.utc)
    assert _find_reply_by_sender_search(service, "info@empresa.com", sent_at) is None


def test_find_reply_by_sender_search_skips_candidate_that_fails_get_then_tries_next():
    sent_at = datetime(2026, 7, 30, 11, 10, tzinfo=timezone.utc)
    reply_dt = datetime(2026, 7, 30, 12, 0, tzinfo=timezone.utc)
    contact_email = "info@empresa.com"
    messages = FakeMessages(
        list_result={"messages": [{"id": "broken"}, {"id": "good"}]},
        get_by_id={"good": {
            "id": "good",
            "threadId": "t9",
            "internalDate": str(int(reply_dt.timestamp() * 1000)),
            "payload": {"headers": [{"name": "From", "value": contact_email}]},
        }},
        raise_on_get_ids={"broken"},
    )
    service = FakeService(messages=messages)
    result = _find_reply_by_sender_search(service, contact_email, sent_at)
    assert result is not None
    assert result["id"] == "good"


# ── _resolve_reply_thread_id ───────────────────────────────────────────────────

def test_resolve_reply_thread_id_uses_new_thread_when_present():
    # Caso típico del fallback: la respuesta cayó en un thread distinto al
    # que abrió nuestro envío original (threading roto por el auto-responder).
    job = {"thread_id": "original-thread"}
    reply = {"thread_id": "brand-new-thread"}
    assert _resolve_reply_thread_id(reply, job) == "brand-new-thread"


def test_resolve_reply_thread_id_keeps_original_thread_when_reply_in_same_thread():
    # Caso típico del chequeo por thread (_find_reply_in_thread): la
    # respuesta está en el mismo thread que abrimos.
    job = {"thread_id": "t1"}
    reply = {"thread_id": "t1"}
    assert _resolve_reply_thread_id(reply, job) == "t1"


def test_resolve_reply_thread_id_falls_back_to_job_thread_when_missing():
    job = {"thread_id": "original-thread"}
    reply = {"thread_id": ""}
    assert _resolve_reply_thread_id(reply, job) == "original-thread"
