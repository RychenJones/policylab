# PolicyLab CI/CD setup

Prepared November 14, 2026 for the existing `RychenJones/policylab` checkout. The repository was renamed; registry, source-label and future OIDC references use the current name. Infrastructure installation and credentials are a separate task. Keep `ENABLE_POLICYLAB_DEPLOYMENT` unset or `false` until explicitly authorized.

## Files and verification

The prepared bundle is imported on `deploy/policylab-ci` from current main:

- `Dockerfile`
- `.dockerignore`
- `.github/workflows/policylab.yml`
- `deployment/compose.yaml`
- `deployment/policylab-deploy.py`
- `deployment/policylab-ci.py`
- `deployment/tests/`: offline helper checks and production-image smoke test

The Dockerfile publishes the backend and copied frontend assets together. The workflow builds the production image and runs the existing Node24 tests against it, with API_TEST_URL explicitly set. PRs only verify; main publishes `ghcr.io/rychenjones/policylab:sha-<commit>`. Deployment is skipped until ENABLE_POLICYLAB_DEPLOYMENT=true. The official third-party actions are pinned to verified commit SHAs. .NET base-image tags resolve when built; deployment uses the resulting immutable application digest.

The image smoke test checks published HTML/JavaScript/CSS against source, health JSON, and a real seven-field simulation with five annual snapshots and conserved percentages. It requires `API_TEST_URL`; it cannot silently skip. Offline Python tests mock external operations and cover argument rejection, forced-command restrictions, successful release/rollback, failed pull/revision/readiness, first-release cleanup and pending transaction recovery. They do not validate actual server behavior.

Run offline checks with Node 24+ and Python 3:

```text
node --test frontend/tests/*.test.js
python -m unittest discover -s deployment/tests -v
```

Per the user's instruction, production image build and execution run in GitHub Actions only; local Docker testing is excluded. The existing live API test skips without `API_TEST_URL` during offline runs. CI explicitly sets it for both the existing suite and `deployment/tests/image.test.mjs` against the running production image.

## Remaining configuration — before enabling deployment

1. Have the repository administrator create environment `policylab-production` and restrict its deployment branches to `main` only. Do not add a mandatory approval per update unless desired. No admin access for Codex is necessary if the owner configures these settings.
2. Create a Tailscale federated CI identity restricted to this repository/environment. The workflow's environment makes its default GitHub OIDC subject `repo:RychenJones/policylab:environment:policylab-production`. Require the correct issuer, audience and repository identity; use the branch-restricted GitHub environment above. Grant only writable auth_keys with `tag:policylab-ci`, following the current Tailscale federation instructions. Configure the effective tailnet policy to permit that tag to **100.92.60.55:22 only**; inspect pre-existing broad rules so the new CI identity does not inherit broader access. Do not replace the entire tailnet policy with a sample.
3. Install and verify the target files as described below. Generate a project-specific SSH key privately; install only its public key for the restricted deploy account. Store the private key directly in GitHub's encrypted environment secrets, never in this bundle or chat. Obtain the SSH host key from CT8001 itself, not an unverified network scan.
4. Add environment secrets: `TS_CLIENT_ID`, `TS_AUDIENCE`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`. The latter must contain the verified key entry for `100.92.60.55`. No long-lived Tailscale OAuth secret is required by this OIDC design.
5. Ensure CT8001 can pull the GHCR image: make the package public if intended, or provision read-only registry authentication privately on CT8001. The workflow's GITHUB_TOKEN handles publication; no PAT is needed for that job.
6. Validate SSH restrictions, a successful release, a failed-readiness rollback and the public app before turning on automatic deployment. Set repository variable `ENABLE_POLICYLAB_DEPLOYMENT=true` only when ready, then run the workflow on main. A workflow_dispatch on main is provided for the first deployment.

## Target installation contract — not yet installed

- Root-owned `/opt/policylab/compose.yaml` from this bundle; directory mode0755. The helper owns `/opt/policylab/release.env` and `/var/lib/policylab-deploy/`. Do not let the deploy user modify them or the Compose file.
- Root-owned executable `/usr/local/sbin/policylab-deploy.py` and `/usr/local/bin/policylab-ci.py`, mode0755; Python3 and sudo installed in CT8001.
- Dedicated unprivileged `deploy` account with a usable login shell, no Docker-group membership and no password sign-in. Root-owned authorized_keys containing `restrict,command="/usr/local/bin/policylab-ci.py" <public-key>`; no generic SSH access is needed for CI.
- Sudoers entry validated with visudo: `deploy ALL=(root) NOPASSWD: /usr/local/sbin/policylab-deploy.py`. Only this fixed helper may run as root; its arguments are strictly validated.
- Configure OpenSSH with root/password/interactive authentication disabled and `AllowUsers deploy`. Limit port22 to the Tailscale interface using a persistent effective firewall rule; leave it unavailable on the LAN. SSH was previously disabled on this guest and has not yet been enabled by this bundle.
- The helper starts a detached systemd release job, takes an exclusive lock, pulls the fixed repository by digest, verifies its revision label and waits for the expected image plus real health JSON. A failed pull leaves the current app alone. Failed readiness restores the previous successful image, or stops the failed first release, while returning failure. Process interruption leaves pending.json and blocks later changes until the operator reconciles actual state.
- Image rollback does not roll back data. This app currently needs no database migrations; none are implemented here. No broad image pruning or volume deletion is included.

## Verification status

Local checks cover the offline Node suite, mocked Python helper tests, workflow/Compose structure and whitespace. GitHub Actions is the acceptance check for the production image and live API suite; inspect the PR's verification result for the exact commit. Local Docker validation is intentionally excluded. SSH restrictions, target installation and real deployment/rollback remain untested and belong to the separate infrastructure task. Keep deployment disabled until those prerequisites are complete and the user explicitly authorizes resuming.

References: https://github.com/tailscale/github-action and https://tailscale.com/docs/features/workload-identity-federation .
