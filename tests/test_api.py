import unittest
import pymacaroons
import responses
from webapp.app import app, _api_request, ANBOXCLOUD_API_BASE


class TestApi(unittest.TestCase):
    def setUp(self):
        """
        Set up Flask app for testing
        """
        app.testing = True
        self.client = app.test_client()

    @responses.activate
    def test_login(self):
        """Emulates test client login in the store.

        Fill current session with `openid`, `macaroon_root` and
        `macaroon_discharge`.

        Return the expected `Authorization` header for further verification
        in API requests.
        """
        # Basic root/discharge macaroons pair.
        # Modify this with anbox-cloud requirements
        root = pymacaroons.Macaroon("test", "testing", "a_key")
        root.add_third_party_caveat("3rd", "a_caveat-key", "a_ident")
        discharge = pymacaroons.Macaroon("3rd", "a_ident", "a_caveat_key")

        # Could be improved using real session
        # self.client.session_transaction()
        data = {
            "provider": "usso",
            "authorization_code": f"root={root} discharge={discharge}",
            "invitation_code": "ABCDE12",
        }
        headers = {"Authorization": f"macaroon root={root}"}

        # Create mock response
        responses.add(
            responses.Response(
                method="POST",
                url=f"{ANBOXCLOUD_API_BASE}/1.0/login",
                status=200,
                json=data,
                headers=headers,
            )
        )

        # Make API call
        response = _api_request("/1.0/login", method="POST", json=data)
        self.assertEqual(response, data)
