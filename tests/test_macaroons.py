import unittest

from webapp.app import app
from webapp.macaroons import MacaroonRequest


class TestMacaroons(unittest.TestCase):
    def setUp(self):
        """
        Set up Flask app for testing
        """
        app.testing = True
        self.caveat_id = "caveat_id"
        self.request_result = {"caveat_id": self.caveat_id}
        self.discharge = "my_discharge"
        self.response_result = {"discharge": self.discharge}

    def test_request(self):
        """
    Should return always the same structure
    """

        openid_macaroon = MacaroonRequest(caveat_id=self.caveat_id)
        self.assertEqual(
            openid_macaroon.getExtensionArgs(), self.request_result
        )
