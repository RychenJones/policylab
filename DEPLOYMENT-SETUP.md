# PolicyLab: one-time deployment

Manually clone GitHub main on the Linux server, build the app there, and start it
with Docker Compose. The C# host serves both the API and JavaScript frontend.
Nothing automatically pulls, publishes or deploys future commits.

## Before starting

- Git, Docker Engine and Docker Compose v2 must already be installed on the server.
- Run as an account allowed to use Docker, in a directory it owns.
- The server needs internet access to GitHub, Microsoft container images and .NET
  package sources during the build. No .NET SDK installation on the server is needed.
- These deployment files must first be committed and merged into main. Until then,
  cloning main will not include them. Do not merge just by following this document.
- Port `127.0.0.1:8080` and container name `policylab-app` must be available, or
  belong to this same Compose application. Stop if an unrelated service uses them.

## First deployment

On the server, run each command only if the previous command succeeded:

```bash
git clone --branch main --single-branch https://github.com/RychenJones/policylab.git policylab
cd policylab
git rev-parse HEAD
docker compose -f deployment/compose.yaml up -d --build
```

Save the printed commit alongside your deployment notes. Compose builds from the
checked-out source using the Dockerfile, including the published frontend assets.
It keeps the app running after the terminal closes and restarts it after a reboot
when the Docker service starts. Startup does not by itself prove HTTP readiness.

Once startup completes, check:

```bash
docker compose -f deployment/compose.yaml ps
curl --fail --show-error http://127.0.0.1:8080/api/health
```

Health should return `{"status":"ok"}`. If startup is still in progress, retry the
health request after a few seconds. For errors, inspect:

```bash
docker compose -f deployment/compose.yaml logs --tail=100 app
```

The app listens only on the server's loopback interface. Use the existing approved
proxy/public-access arrangement to reach it from your browser; this procedure does
not change that configuration. Open the page and run a scenario to verify the UI
and API together.

## If the server already has this checkout

Use its existing repository directory instead of cloning again. Check
`git status --short` first; resolve local edits before continuing. Then:

```bash
git switch main
git pull --ff-only origin main
git rev-parse HEAD
docker compose -f deployment/compose.yaml up -d --build
```

Stop on any error. Pulling source alone does not replace the running app; the
Compose command rebuilds and starts the checked-out version. Updates remain manual.

## Scope and verification

The former GitHub publishing/deployment workflow, SSH release helpers and their
dedicated tests have been removed. Their earlier versions remain in Git history.
No registry login, CI deployment identity, GitHub deployment secrets or release
environment file is needed for this public-repository source build.

No automatic rollback is provided. Keep the recorded commit for troubleshooting;
check logs and health after every manual release. The container retains its
read-only filesystem, temporary `/tmp`, loopback binding and resource limits.

Local Docker testing is excluded at the user's request. Server build, HTTP health,
browser simulation and existing public access must be verified during the manual
deployment. No server or deployment credentials were accessed by this refactor.

References: [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/),
[Git pull](https://git-scm.com/docs/git-pull).
