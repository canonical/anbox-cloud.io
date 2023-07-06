import flask
from geolite2 import geolite2

ip_reader = geolite2.reader()


def get_user_country_by_ip():
    client_ip = flask.request.headers.get(
        "X-Real-IP", flask.request.remote_addr
    )
    ip_location = ip_reader.get(client_ip)

    try:
        country_code = ip_location["country"]["iso_code"]
    except KeyError:
        # geolite2 can't identify IP address
        country_code = None
    except Exception:
        # Errors not documented in the geolite2 module
        country_code = None

    response = flask.jsonify(
        {
            "client_ip": client_ip,
            "country_code": country_code,
        }
    )
    response.cache_control.private = True

    return response
