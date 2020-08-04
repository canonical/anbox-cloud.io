import os
from urllib.parse import urlparse

import flask
import requests
import talisker
from flask import request

from canonicalwebteam.discourse_docs import (
    DiscourseAPI,
    DiscourseDocs,
    DocParser,
)
from canonicalwebteam.flask_base.app import FlaskBase
from flask_openid import OpenID
from pymacaroons import Macaroon
from webapp.macaroons import MacaroonRequest, MacaroonResponse
from posixpath import join as url_join
from canonicalwebteam import image_template


LOGIN_URL = "https://login.ubuntu.com"
ANBOXCLOUD_API_BASE = "https://demo-api.anbox-cloud.io"

session = requests.Session()
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

# Discourse docs
session = talisker.requests.get_session()

discourse_docs = DiscourseDocs(
    parser=DocParser(
        api=DiscourseAPI(
            base_url="https://discourse.ubuntu.com/", session=session
        ),
        index_topic_id=17029,
        url_prefix="/docs",
    ),
    document_template="docs/document.html",
    url_prefix="/docs",
)
discourse_docs.init_app(app)


def _api_request(url_path, method="GET", params=None, json=None, headers=None):
    """
    Make API calls to the anbox API, passing any 401 errors to Flask to handle
    """

    response = session.request(
        method,
        f"{ANBOXCLOUD_API_BASE.rstrip('/')}/{url_join(url_path).lstrip('/')}",
        params=params,
        json=json,
        headers=headers,
    )

    if response.status_code == 401:
        flask.abort(401, response.json())

    response.raise_for_status()

    return response.json()


def login_required(func):
    """
    Decorator that checks if a user is logged in, and redirects
    to login page if not.
    """

    def is_user_logged_in(*args, **kwargs):
        if "authentication_token" not in flask.session:
            return flask.redirect("/login?next=" + flask.request.path)

        # Validate authentication token
        return func(*args, **kwargs)

    return is_user_logged_in


@app.context_processor
def utility_processor():
    return {"image": image_template}


@app.route("/")
def index():
    return flask.render_template("index.html")


@app.route("/thank-you")
def thank_you():
    return flask.render_template("thank-you.html")


@app.route("/terms")
def terms():
    return flask.render_template("terms.html")


@app.route("/privacy")
def privacy():
    return flask.render_template("privacy.html")


@open_id.after_login
def after_login(resp):
    """
    1. Get Macaroon discharge
    2. Post payload with discharge and root (API requirements)
    3. Empty session and add new token for Anbox-cloud API
    """

    root = flask.session["macaroon_root"]
    discharge = resp.extensions["macaroon"].discharge
    data = {
        "provider": "usso",
        "authorization_code": f"root={root} discharge={discharge}",
        "invitation_code": flask.session["invitation_code"],
        "accept_tos": True,
    }
    response = _api_request("1.0/login", method="POST", json=data)
    flask.session.pop("macaroon_root", None)
    flask.session["authentication_token"] = response["metadata"]["token"]

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
    Logout by removing the `authentication_token` from the session
    """
    flask.session.pop("authentication_token", None)

    return flask.redirect(open_id.get_next_url())


@app.route("/login", methods=["GET", "POST"])
@open_id.loginhandler
def login_handler():
    if "authentication_token" in flask.session:
        return flask.redirect(open_id.get_next_url())
    flask.session["invitation_code"] = request.args.get("invitation_code")
    response = _api_request(
        url_path="/1.0/token", method="GET", params={"provider": "usso"}
    )
    root = response["metadata"]["token"]
    location = urlparse(LOGIN_URL).hostname
    (caveat,) = [
        c
        for c in Macaroon.deserialize(root).third_party_caveats()
        if c.location == location
    ]
    openid_macaroon = MacaroonRequest(caveat_id=caveat.caveat_id)

    flask.session["macaroon_root"] = root
    return open_id.try_login(
        LOGIN_URL, ask_for=["email"], extensions=[openid_macaroon]
    )


@app.route("/demo")
@login_required
def demo():
    authentication_token = flask.session["authentication_token"]
    authorization_header = {
        "Authorization": f"macaroon root={authentication_token}"
    }
    # to be removed in the future
    _api_request("/1.0/instances", headers=authorization_header)

    content = flask.render_template(
        "demo.html", ANBOXCLOUD_API_BASE=ANBOXCLOUD_API_BASE
    )
    resp = flask.make_response(content)
    resp.set_cookie("api_token", authentication_token)
    return resp


@app.errorhandler(401)
def handle_unauthorised(error):
    """
    Handle 401 errors using flask as opposed to requests
    """
    if error.description["error_code"] == 900:
        flask.session.pop("authentication_token", None)
        return flask.redirect("/login?next=" + flask.request.path)

    return (
        flask.render_template("401.html", error=error.description["error"]),
        401,
    )
