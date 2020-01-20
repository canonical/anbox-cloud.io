import requests
import sys


def handle_exceptions(request):
    try:
        request
        request.raise_for_status()
    except requests.exceptions.Timeout:
        # Maybe set up for a retry, or continue in a retry loop
        print("Request timed out")
    except requests.exceptions.TooManyRedirects:
        # Tell the user their URL was bad and try a different one
        print("Too many redirects")
    except requests.exceptions.RequestException as e:
        # catastrophic error. bail.
        print("Catastrophic error {}".format(e))
        sys.exit(1)
