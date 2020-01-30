import functools
import os
from urllib.parse import urlparse

import flask
import requests

from canonicalwebteam.flask_base.app import FlaskBase
from flask_openid import OpenID
from pymacaroons import Macaroon
from webapp.macaroons import MacaroonRequest, MacaroonResponse

LOGIN_URL = "https://login.ubuntu.com"
# Only works with VPN
# Change when deployed to production
ANBOXCLOUD_API_BASE = "https://staging.demo-api.anbox-cloud.io/"

app = FlaskBase(
    __name__,
    "anbox-cloud.io",
    template_folder="../templates",
    static_folder="../static",
    template_404="404.html",
    template_500="500.html",
)

app.secret_key = os.environ["SECRET_KEY"]
open_id = OpenID(
    stateless=True, safe_roots=[], extension_responses=[MacaroonResponse]
)


def login_required(func):
    """
    Decorator that checks if a user is logged in, and redirects
    to login page if not.
    """

    @functools.wraps(func)
    def is_user_logged_in(*args, **kwargs):
        if "openid" not in flask.session:
            return flask.redirect("/login?next=" + flask.request.path)

        return func(*args, **kwargs)

    return is_user_logged_in


def request_macaroon():
    url = f"{ANBOXCLOUD_API_BASE}/1.0/token"
    response = requests.get(
        url=url,
        headers={
            "Accept": "application/json, application/hal+json",
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
        },
        params=[("provider", "usso")],
    )
    response.raise_for_status()
    return response.json()


@app.route("/")
def index():
    return flask.render_template("index.html")


@app.route("/thank-you")
def thank_you():
    return flask.render_template("thank-you.html")


@open_id.after_login
def after_login(resp):
    flask.session["macaroon_discharge"] = resp.extensions["macaroon"].discharge
    flask.session["openid"] = {
        "identity_url": resp.identity_url,
        "email": resp.email,
    }
    return flask.redirect(open_id.get_next_url())


@app.after_request
def add_headers(response):
    """
    Generic rules for headers to add to all requests

    - X-Hostname: Mention the name of the host/pod running the application
    - Cache-Control: Add cache-control headers for public and private pages
    """

    if response.status_code == 200:
        if flask.session:
            response.headers["Cache-Control"] = "private"
        else:
            # Only add caching headers to successful responses
            if not response.headers.get("Cache-Control"):
                response.headers["Cache-Control"] = ", ".join(
                    {
                        "public",
                        "max-age=61",
                        "stale-while-revalidate=300",
                        "stale-if-error=86400",
                    }
                )

    return response


@app.route("/logout")
def logout():
    """
    Empty the session, used to logout.
    """
    flask.session.pop("openid", None)

    return flask.redirect(open_id.get_next_url())


@app.route("/login", methods=["GET", "POST"])
@open_id.loginhandler
def login_handler():
    if "openid" in flask.session and "macaroon_root" in flask.session:
        return flask.redirect(open_id.get_next_url())

    root = request_macaroon()
    token = root["metadata"]["token"]
    location = urlparse(LOGIN_URL).hostname
    (caveat,) = [
        c
        for c in Macaroon.deserialize(token).third_party_caveats()
        if c.location == location
    ]
    openid_macaroon = MacaroonRequest(caveat_id=caveat.caveat_id)

    flask.session["macaroon_root"] = token
    return open_id.try_login(
        LOGIN_URL, ask_for=["email"], extensions=[openid_macaroon]
    )


@app.route("/demo")
@login_required
def demo():
    return flask.render_template("demo.html")
