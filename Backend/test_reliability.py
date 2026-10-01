import importlib
import io
import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace
from fastapi import HTTPException
from fastapi.testclient import TestClient
from request_limits import RequestLimiter
from sqlalchemy.dialects import postgresql
from cryptography.hazmat.primitives.asymmetric import rsa
import jwt
import time

with patch("faster_whisper.WhisperModel"):
    main = importlib.import_module("main")


class ReliabilityTests(unittest.TestCase):
    def test_limits_are_owner_scoped_expire_and_return_retry_after(self):
        clock = [0]
        limiter = RequestLimiter(lambda: clock[0])
        limiter.check("a", "minutes", 1)
        limiter.check("b", "minutes", 1)
        with self.assertRaises(HTTPException) as raised:
            limiter.check("a", "minutes", 1)
        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(raised.exception.headers["Retry-After"], "60")
        clock[0] = 61
        limiter.check("a", "minutes", 1)

    def test_protected_routes_reject_missing_auth_without_database_calls(self):
        with TestClient(main.app) as client, patch.object(main, "get_database_engine") as database:
            for method, path, body in [
                ("get", "/meetings", None), ("get", "/meetings/search?q=test", None),
                ("post", "/meetings", {"title": "T", "type": "live", "transcript": "T"}),
                ("post", "/generate-minutes", {"transcript": "T"}),
                ("post", "/assistant/chat", {"message": "T"}),
                ("post", "/summaries/weekly", {"start_date": "2026-09-01", "end_date": "2026-09-02"}),
                ("get", "/transcription-jobs/00000000-0000-0000-0000-000000000001", None),
            ]:
                response = client.request(method, path, json=body)
                self.assertEqual(response.status_code, 401, path)
            for path in ("/transcribe", "/transcription-jobs"):
                self.assertEqual(client.post(path, files={"file": ("a.wav", b"audio")}).status_code, 401)
            database.assert_not_called()

    def test_bad_payloads_rejected_and_minutes_response_validated(self):
        user = main.AuthenticatedUser("validation-test")
        with patch.object(main, "load_dotenv"), patch.dict(main.os.environ, {"GEMINI_API_KEY": "test"}), patch.object(main.genai, "Client") as client:
            client.return_value.models.generate_content.return_value.text = '{"summary": 3}'
            with self.assertRaises(HTTPException) as raised:
                main.generate_minutes(main.MinutesRequest(transcript="Speech"), user)
            self.assertEqual(raised.exception.status_code, 502)
        with self.assertRaises(ValueError):
            main.MinutesRequest(transcript="a" * 500001)

    def test_diagnostics_never_log_provider_content_or_credentials(self):
        output = io.StringIO()
        with patch("sys.stderr", output):
            main.print_gemini_diagnostic(RuntimeError("jwt password api-key sensitive transcript"), "api-key")
            main.print_gemini_failure("transient", RuntimeError("jwt password api-key"), "api-key")
        for secret in ("jwt", "password", "api-key", "sensitive transcript"):
            self.assertNotIn(secret, output.getvalue())

    def test_websocket_requires_token(self):
        with self.assertRaises(HTTPException) as raised:
            main.get_websocket_user(SimpleNamespace(headers={}))
        self.assertEqual(raised.exception.status_code, 401)

    def test_signed_jwt_validates_issuer_audience_expiry_and_subject(self):
        private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        jwks = Mock()
        jwks.get_signing_key_from_jwt.return_value.key = private.public_key()
        settings = ("https://example.test/auth/v1", "authenticated", "https://example.test/jwks")
        claims = {"iss": settings[0], "aud": settings[1], "sub": "account-a", "exp": int(time.time()) + 60}
        with patch.object(main, "get_supabase_jwt_settings", return_value=settings), patch.object(main, "supabase_jwks_client", jwks), patch.object(main, "supabase_jwks_url", settings[2]):
            self.assertEqual(main.verify_supabase_access_token(jwt.encode(claims, private, algorithm="RS256")).id, "account-a")
            for changed in ({"aud": "wrong"}, {"iss": "wrong"}, {"sub": ""}, {"exp": 1}):
                with self.assertRaises(HTTPException) as raised:
                    main.verify_supabase_access_token(jwt.encode({**claims, **changed}, private, algorithm="RS256"))
                self.assertEqual(raised.exception.status_code, 401)

    def test_semantic_query_enforces_owner_before_distance_limit(self):
        with patch.object(main, "get_database_engine"), patch.object(main, "Session") as session:
            session.return_value.__enter__.return_value.execute.return_value.all.return_value = []
            main.retrieve_semantic_chunks([0.0] * main.EMBEDDING_DIMENSION, 5, "account-a")
            statement = session.return_value.__enter__.return_value.execute.call_args.args[0]
        compiled = statement.compile(dialect=postgresql.dialect())
        self.assertIn("meetings.owner_id =", str(compiled))
        self.assertIn("account-a", compiled.params.values())
        self.assertIn("LIMIT", str(compiled))
