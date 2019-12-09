# Canonical Webteam Website-Boilerplate

[![CircleCI build status](https://circleci.com/gh/canonical-web-and-design/canonicalwebteam.website-boilerplate.svg?style=shield)](https://circleci.com/gh/canonical-web-and-design/canonicalwebteam.website-boilerplate) [![Code coverage](https://codecov.io/gh/canonical-web-and-design/canonicalwebteam.website-boilerplate/branch/master/graph/badge.svg)](https://codecov.io/gh/canonical-web-and-design/canonicalwebteam.website-boilerplate)

This is a flask website boilerplate

## Usage

1. Click `Use this template` button on [GitHub](https://help.github.com/en/articles/creating-a-repository-from-a-template) to create a new repo from this one.

2. Clone the new repository locally.

```bash
git clone {link-to-the-new-repo}
```

3. Navigate to your {new-project-directory}:

```bash
cd {new-project-directory}
```

4. Open `requirements.txt` file and make sure you are using the latest version of [canonicalwebteam.flask-base](https://pypi.org/project/canonicalwebteam.flask-base/).

5. Change `PORT` number in the `.env` file considering [current projects port list](https://canonical-web-and-design.github.io/practices/project-structure/ports.html).

6. Run your project:

```bash
./run
```
