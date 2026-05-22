from __future__ import annotations

import json
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import modules.crm_service as crm_service
import modules.ocr_service as ocr_service
from modules.database import init_db
from modules.crm_service import ServiceError


class CRMHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if path == "/health":
            self._send_json({"status": "ok", "service": "crm-local-api-stdlib"})

        elif path == "/contacts":
            limit = int(params.get("limit", ["100"])[0])
            offset = int(params.get("offset", ["0"])[0])
            self._send_json(crm_service.get_contacts(limit, offset))

        elif re.fullmatch(r"/contacts/\d+/history", path):
            contact_id = crm_service.extract_contact_history_id(path)
            try:
                self._send_json(crm_service.get_contact_history(contact_id))
            except ServiceError as exc:
                self._send_json({"detail": exc.message}, status=exc.status)

        elif path == "/summary":
            self._send_json(crm_service.get_summary())

        elif path == "/reporting/overview":
            self._send_json(crm_service.get_reporting_overview())

        elif path == "/reporting/export.csv":
            export_type = str(params.get("type", ["snapshots"])[0]).strip().lower()
            limit = max(1, min(int(params.get("limit", ["30"])[0]), 365))
            content, filename = crm_service.export_reporting_csv(export_type, limit)
            self._send_csv(content, filename)

        elif path == "/capabilities":
            self._send_json(ocr_service.get_runtime_capabilities())

        elif path == "/imports":
            limit = int(params.get("limit", ["50"])[0])
            offset = int(params.get("offset", ["0"])[0])
            self._send_json(crm_service.get_imports(limit, offset))

        elif path.startswith("/imports/"):
            import_id = crm_service.extract_import_id(path)
            if import_id is None:
                self._send_json({"detail": "Not found"}, status=HTTPStatus.NOT_FOUND)
            else:
                try:
                    self._send_json(crm_service.get_import_detail(import_id))
                except ServiceError as exc:
                    self._send_json({"detail": exc.message}, status=exc.status)

        else:
            self._send_json({"detail": "Not found"}, status=HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        payload = self._read_json_body()

        if path == "/contacts":
            try:
                self._send_json(crm_service.create_contact(payload), status=HTTPStatus.CREATED)
            except ServiceError as exc:
                self._send_json({"detail": exc.message}, status=exc.status)

        elif re.fullmatch(r"/contacts/\d+/execute", path):
            contact_id = crm_service.extract_contact_id(path)
            if contact_id is None:
                self._send_json({"detail": "Contact not found"}, status=HTTPStatus.NOT_FOUND)
            else:
                try:
                    self._send_json(crm_service.execute_contact_action(contact_id, payload))
                except ServiceError as exc:
                    self._send_json({"detail": exc.message}, status=exc.status)

        elif path == "/imports/mock":
            try:
                self._send_json(crm_service.create_mock_import(payload), status=HTTPStatus.CREATED)
            except ServiceError as exc:
                self._send_json({"detail": exc.message}, status=exc.status)

        elif path == "/imports/preview":
            try:
                self._send_json(crm_service.preview_import(payload), status=HTTPStatus.CREATED)
            except ServiceError as exc:
                self._send_json({"detail": exc.message}, status=exc.status)

        elif path.startswith("/imports/") and path.endswith("/confirm"):
            import_id = crm_service.extract_import_id(path)
            if import_id is None:
                self._send_json({"detail": "Import not found"}, status=HTTPStatus.NOT_FOUND)
            else:
                try:
                    self._send_json(crm_service.confirm_import(import_id, payload))
                except ServiceError as exc:
                    self._send_json({"detail": exc.message}, status=exc.status)

        else:
            self._send_json({"detail": "Not found"}, status=HTTPStatus.NOT_FOUND)

    # ------------------------------------------------------------------
    # HTTP helpers
    # ------------------------------------------------------------------

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def _send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_csv(self, content: str, filename: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = content.encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        pass


def main() -> None:
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), CRMHandler)
    print("CRM backend running on http://127.0.0.1:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
