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
from webapp.exceptions import handle_exceptions
from flask import request

LOGIN_URL = "https://login.ubuntu.com"
# Only works with VPN
# Change when deployed to production
ANBOXCLOUD_API_BASE = "https://staging.demo-api.anbox-cloud.io/"
ANBOXCLOUD_API_TOKEN = "1.0/token"
ANBOXCLOUD_API_LOGIN = "1.0/login"
HEADERS = {
    "Accept": "application/json, application/hal+json",
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
}

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
    stateless=True,
    safe_roots=[],
    extension_responses=[MacaroonResponse])


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


def request_macaroon(params):
    url = "".join([ANBOXCLOUD_API_BASE, ANBOXCLOUD_API_TOKEN])
    response = requests.get(url=url, headers=HEADERS, params=params)
    handle_exceptions(response)
    body = response.json()
    return body


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
    url = "".join([ANBOXCLOUD_API_BASE, ANBOXCLOUD_API_LOGIN])
    flask.session["macaroon_discharge"] = resp.extensions["macaroon"].discharge
    flask.session["openid"] = {
        "identity_url": resp.identity_url,
        "email": resp.email,
    }
    root = flask.session["macaroon_root"]
    discharge = flask.session["macaroon_discharge"]
    headers = get_authorization_header(root, discharge)
    authorization_code = "root={} discharge={}".format(root, discharge)
    invitation_code = flask.session["invitation_code"]
    data = json.dumps(
        {
            "provider": "usso",
            "authorization_code": authorization_code,
            "invitation_code": invitation_code,
        }
    )
    response = requests.post(url=url, headers=headers, data=data)
    handle_exceptions(response)

    return flask.redirect("/demo")


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
                        "stale-if-error=86400"
                    }
                )

    return response


@app.route("/logout")
def logout():
    """
    Empty the session, used to logout.
    """
    flask.session.pop("openid", None)
    flask.session.pop("macaroon_root", None)
    flask.session.pop("macaroon_discharge", None)

    return flask.redirect(open_id.get_next_url())


@app.route("/login", methods=["GET", "POST"])
@open_id.loginhandler
def login_handler():
    if "openid" in flask.session and "macaroon_root" in flask.session:
        return flask.redirect(open_id.get_next_url())

    params = [("provider", "usso")]
    root = request_macaroon(params)
    token = root["metadata"]["token"]
    # API to check if user already exists goes here
    # Ideal: If user exists return code else do not include in POST body
    invitation_code = request.args.get("invitation_code")
    flask.session["invitation_code"] = invitation_code
    location = urlparse(LOGIN_URL).hostname
    (caveat,) = [
        c for c in Macaroon.deserialize(token).third_party_caveats()
        if c.location == location
    ]
    openid_macaroon = MacaroonRequest(caveat_id=caveat.caveat_id)

    flask.session["macaroon_root"] = token
    return open_id.try_login(
        LOGIN_URL,
        ask_for=["email"],
        extensions=[openid_macaroon]
    )


@app.route("/demo")
@login_required
def demo():
    return flask.render_template("demo.html")
