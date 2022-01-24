import unittest
from webapp.app import app


class TestRoutes(unittest.TestCase):
    def setUp(self):
        """
        Set up Flask app for testing
        """
        app.testing = True
        self.client = app.test_client()

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

    def test_contact_us(self):
        """
        When given the index URL,
        we should return a 200 status code
        """

        self.assertEqual(self.client.get("/contact-us").status_code, 200)

    def test_not_found(self):
        """
        When given a non-existent URL,
        we should return a 404 status code
        """

        self.assertEqual(self.client.get("/not-found-url").status_code, 404)

    def test_logout(self):
        """
        When given the index URL,
        we should return a 302 status code
        """
        self.assertEqual(self.client.get("/logout").status_code, 302)

    def test_terms(self):
        """
        When given the index URL,
        we should return a 200 status code
        """

        self.assertEqual(self.client.get("/terms").status_code, 200)

    def test_privacy(self):
        """
        When given the index URL,
        we should return a 200 status code
        """

        self.assertEqual(self.client.get("/privacy").status_code, 200)

    def test_docs(self):
        """
        When given the index URL,
        we should return a 200 status code
        """

        self.assertEqual(self.client.get("/docs").status_code, 200)
