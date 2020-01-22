import functools
import json
import os
from urllib.parse import urlparse

import flask
import requests

from canonicalwebteam.flask_base.app import FlaskBase
from flask_openid import OpenID
from pymacaroons import Macaroon
from webapp.macaroons import MacaroonRequest, MacaroonResponse
from flask import request

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
        if "authentication_token" not in flask.session:
            return flask.redirect("/login?next=" + flask.request.path)

        # Validate authentication token
        
        return func(*args, **kwargs)

    return is_user_logged_in


def get_authorization_header(root, discharge):
    """
    Bind root and discharge macaroons and return the authorization header.
    """

    bound = Macaroon.deserialize(root).prepare_for_request(
        Macaroon.deserialize(discharge)
    )
    value = "Macaroon root={}, discharge={}".format(root, bound.serialize())
    authorization = {"Authorization": value}
    return authorization



@app.route("/")
def index():
    return flask.render_template("index.html")


@open_id.after_login
def after_login(resp):
    root = flask.session["macaroon_root"]
    discharge = resp.extensions["macaroon"].discharge
    authorization_code = f"root={root} discharge={discharge}"
    invitation_code = flask.session["invitation_code"]
    data = json.dumps(
        {
            "provider": "usso",
            "authorization_code": authorization_code,
            "invitation_code": invitation_code,
        }
    )
    response = requests.post(url=f"{ANBOXCLOUD_API_BASE}/1.0/login", data=data)
    response.raise_for_status()
    # Once get token
    # Empty macaroon_root
    # Add token to session["authentication_token"]


    return flask.redirect(open_id.get_next_url())


@app.after_request
def add_headers(response):
    """
    Generic rules for headers to add to all requests

    - X-Hostname: Mention the name of the host/pod running the application
    - Cache-Control: Add cache-control headers for public and private pages
    """

    # response.headers["X-Hostname"] = socket.gethostname()

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
    flask.session.pop("authentication_token", None)
    flask.session.pop("macaroon_root", None)
    flask.session.pop("macaroon_discharge", None)

    return flask.redirect(open_id.get_next_url())


@app.route("/login", methods=["GET", "POST"])
@open_id.loginhandler
def login_handler():
    if (
        "authentication_token" in flask.session
        and "macaroon_root" in flask.session
        and "macaroon_discharge" in flask.session
    ):
        return flask.redirect(open_id.get_next_url())

    root = requests.get(
        url=f"{ANBOXCLOUD_API_BASE}/1.0/token",
        params=[("provider", "usso")],
    )
    root.raise_for_status()

    token = root["metadata"]["token"]
    # We do not handle invitation code for now.
    # It is embedded in the macaroon but might in the future
    invitation_code = request.args.get("invitation_code")
    flask.session["invitation_code"] = invitation_code
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
    # logout link in the 401 page
    return flask.render_template("demo.html")
