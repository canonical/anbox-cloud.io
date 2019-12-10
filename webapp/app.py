from canonicalwebteam.flask_base.app import FlaskBase
from flask import render_template

# Rename your project below
app = FlaskBase(
    __name__,
    "anbox-cloud.io",
    template_folder="../templates",
    static_folder="../static",
    template_404="404.html",
    template_500="500.html",
)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/demo")
def demo():
    return render_template("index.html")


@app.route("/demo/login")
def login():
    greeting = "Please login to view the demo"
    return render_template("login/index.html", greeting=greeting)


@app.route("/demo/registration")
def registration():
    greeting = "If you have an access code provided by Anbox"
    return render_template("login/registration.html", greeting=greeting)
