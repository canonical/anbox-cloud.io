import functools
import os

import flask
import requests

from urllib.parse import urlparse
from pymacaroons import Macaroon
from canonicalwebteam.flask_base.app import FlaskBase
from flask_openid import OpenID


LOGIN_URL = "https://login.ubuntu.com"
# Only works with VPN
# Change when deployed to production
ANBOXCLOUD_API_BASE = "https://staging.demo-api.anbox-cloud.io/"
ANBOXCLOUD_API_TOKEN = "1.0/token"
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
open_id = OpenID(stateless=True, safe_roots=[])


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
    # api_session = requests.Session(timeout=(1, 6))
    # permissions
    permissions = {}
    response = requests.get(url=url, headers=HEADERS, params=params)
    if not response.ok:
        print("Unknown error from api %s", response.status_code)
        # raise ApiResponseError("Unknown error from api", response.status_code)

    try:
        body = response.json()
    except ValueError as decode_error:
        print("JSON decoding failed:  %s", decode_error)
        # api_error_exception = ApiResponseDecodeError(
        #     "JSON decoding failed: {}".format(decode_error)
        # )
        # raise api_error_exception
    return body


@app.route("/")
def index():
    return flask.render_template("index.html")


@open_id.after_login
def after_login(resp):
    flask.session["openid"] = {
        "identity_url": resp.identity_url,
        "email": resp.email,
    }
    return flask.redirect(open_id.get_next_url())


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
    if "openid" in flask.session:
        return flask.redirect(open_id.get_next_url())

    params = [
        ("provider", "usso")
    ]
    root = request_macaroon(params)
    token = root['metadata']['token']
    location = urlparse(LOGIN_URL).hostname
    caveat, = [
        c
        for c in Macaroon.deserialize(token).third_party_caveats()
        if c.location == location
    ]
    print(caveat)
    openid_macaroon = [
        ("caveat_id", caveat.caveat_id)
    ]
    flask.session["macaroon_root"] = root
    return open_id.try_login(LOGIN_URL, ask_for=["email"], extensions=[openid_macaroon])


@app.route("/demo")
@login_required
def demo():
    return flask.render_template("demo.html")
