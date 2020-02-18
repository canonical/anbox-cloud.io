# Anbox Cloud Demo site

[![CircleCI build status](https://circleci.com/gh/canonical-web-and-design/anbox-cloud.io.svg?style=shield)](https://circleci.com/gh/canonical-web-and-design/anbox-cloud.io) [![Code coverage](https://codecov.io/gh/canonical-web-and-design/anbox-cloud.io/branch/master/graph/badge.svg)](https://codecov.io/gh/canonical-web-and-design/anbox-cloud.io)

Anbox Cloud is the mobile cloud computing platform for running Android at high scale in any cloud. It is portable across x86 and ARM architectures, with GPU and GPGPU support. Canonical will help you deploy your applications to accelerate your time-to-market. Anbox Cloud comes bundled with a long-term commercial support offering.

## Architecture overview

This website is written with the help of the [flask](http://flask.pocoo.org/) framework. In order to use functionality that multiply our websites here at Canonical, we import the [base-flask-extension](https://github.com/canonical-web-and-design/canonicalwebteam.flask-base) module.


## Development

- Run `./run` inside the root of the repository and all dependencies will automatically be installed. Afterwards the website will be available at <http://localhost:8043>.
- To access the Anbox streaming demo you will need an invitation code. You can access it here `http://localhost:8043/login?next=/demo&invitation_code={invitation_code}`
- If you are part of the webteam, you can find an invitation code in lastPass in Anbox cloud demo
