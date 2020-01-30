import unittest
from webapp.app import app


class TestRoutes(unittest.TestCase):
    def setUp(self):
        """
        Set up Flask app for testing
        """
        app.testing = True
        self.client = app.test_client()

    def tearDown(self):
        pass

    def test_homepage(self):
        """
        When given the index URL,
        we should return a 200 status code
        """

        self.assertEqual(self.client.get("/").status_code, 200)

    def test_thank_you(self):
        """
        When given the index URL,
        we should return a 200 status code
        """

        self.assertEqual(self.client.get("/thank-you").status_code, 200)

    def test_not_found(self):
        """
        When given a non-existent URL,
        we should return a 404 status code
        """

        self.assertEqual(self.client.get("/not-found-url").status_code, 404)

    def test_demo_no_session(self):
        """
        Demo page should redirect to login if no session.
        """
        response = self.client.get("/demo")
        demo_uri = "http://localhost/login?next=/demo"
        self.assertEqual(self.client.get("/demo").status_code, 302)
        self.assertEqual(response.location, demo_uri)

    def test_demo_login(self):
        """
        Demo page should be accessible if
        authentication_token (anbox-cloud API) session not empty.
        """
        with self.client.session_transaction() as s:
            self.assertTrue("authentication_token" not in s)

    def test_logout(self):
        """
        When given the index URL,
        we should return a 302 status code
        """
        self.test_demo_login()
        self.assertEqual(self.client.get("/logout").status_code, 302)
