import functools
import os

import flask

from canonicalwebteam.flask_base.app import FlaskBase
from flask_openid import OpenID


LOGIN_URL = "https://login.ubuntu.com"

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


@app.route("/")
def index():
    return flask.render_template("index.html")


@app.route("/thank-you")
def thank_you():
    return flask.render_template("thank-you.html")


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

    return open_id.try_login(LOGIN_URL, ask_for=["email"])


@app.route("/demo")
@login_required
def demo():
    return flask.render_template("demo.html")
