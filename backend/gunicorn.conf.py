# Gunicorn reads ./gunicorn.conf.py from its working directory (/app in the
# image) on its own, so neither the image CMD nor the k8s command names it.


def when_ready(server):
    # Once, from the master process: lets `kubectl logs` show which build
    # this pod runs. See openspec/specs/app-version.
    from core.version import version_line

    server.log.info(version_line("backend"))
