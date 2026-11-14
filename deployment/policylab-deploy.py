#!/usr/bin/python3
"""Root-owned, fixed-target release helper. Install only after target review."""
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request
import uuid

ROOT = Path('/opt/policylab')
STATE = Path('/var/lib/policylab-deploy')
REPO = 'ghcr.io/rychenjones/policylab'


def parse(args):
    if args == ['rollback']:
        return args
    if (len(args) == 3 and args[0] == 'deploy'
            and re.fullmatch(r'sha256:[a-f0-9]{64}', args[1])
            and re.fullmatch(r'[a-f0-9]{40}', args[2])):
        return args
    raise ValueError('Expected deploy <sha256:digest> <commit> or rollback')


def run(*args, timeout=600):
    return subprocess.run(args, check=True, capture_output=True, text=True,
                          timeout=timeout).stdout.strip()


def read(name):
    p = STATE / name
    return json.loads(p.read_text()) if p.exists() else None


def atomic(path, value):
    tmp = path.with_name(path.name + '.tmp')
    with tmp.open('w') as stream:
        os.chmod(tmp, 0o600)
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(tmp, path)


def compose(*args):
    return run('/usr/bin/docker', 'compose', '--project-directory', str(ROOT),
               '--env-file', str(ROOT / 'release.env'), '-f', str(ROOT / 'compose.yaml'), *args)


def launch(release):
    image = REPO + '@' + release['digest']
    atomic(ROOT / 'release.env', 'POLICYLAB_IMAGE=' + image + '\n')
    compose('up', '-d', '--no-deps', '--pull', 'never', 'app')
    for _ in range(30):
        try:
            actual = json.loads(run('/usr/bin/docker', 'inspect', 'policylab-app'))[0]
            with urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=2) as response:
                healthy = json.load(response).get('status') == 'ok'
            if actual['State']['Running'] and actual['Config']['Image'] == image and healthy:
                return
        except (OSError, ValueError, subprocess.SubprocessError):
            pass
        time.sleep(2)
    raise RuntimeError('Release failed readiness')


def worker(args):
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE / 'lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if read('pending.json'):
            raise RuntimeError('Unfinished transaction: operator must reconcile pending.json first')
        current = read('current.json')
        target = read('previous.json') if args == ['rollback'] else dict(digest=args[1], commit=args[2])
        if not target:
            raise RuntimeError('No previous successful release')
        image = REPO + '@' + target['digest']
        run('/usr/bin/docker', 'pull', image)  # Old service remains running if this fails.
        revision = run('/usr/bin/docker', 'image', 'inspect', '--format',
                       '{{index .Config.Labels "org.opencontainers.image.revision"}}', image)
        if revision != target['commit']:
            raise RuntimeError('Image revision does not match requested commit')
        transaction = dict(target=target, previous=current, stage='replacing')
        atomic(STATE / 'pending.json', json.dumps(transaction))
        try:
            launch(target)
            if current:
                atomic(STATE / 'previous.json', json.dumps(current))
            atomic(STATE / 'current.json', json.dumps(target))
        except Exception as error:
            transaction['failure'] = str(error)
            atomic(STATE / 'last-failure.json', json.dumps(transaction))
            if current:
                launch(current)  # Failure here deliberately preserves pending.json.
            else:
                compose('stop', 'app')
            (STATE / 'pending.json').unlink()
            raise RuntimeError('Deployment failed; previous release restored or first release stopped') from error
        (STATE / 'pending.json').unlink()
        print('Release healthy:', target['digest'], flush=True)


def main():
    args = sys.argv[1:]
    is_worker = args[:1] == ['--worker']
    args = parse(args[1:] if is_worker else args)
    if os.geteuid() != 0 or os.uname().nodename != 'policylab':
        raise RuntimeError('Run only as root on policylab')
    os.environ.clear()
    os.environ.update(PATH='/usr/sbin:/usr/bin:/sbin:/bin', HOME='/root')
    if is_worker:
        worker(args)
    else:
        # Detached service survives loss of SSH; --wait returns its failure to CI.
        subprocess.run(['/usr/bin/systemd-run', '--wait', '--pipe', '--collect',
                        '--unit=policylab-release-' + uuid.uuid4().hex,
                        '/usr/bin/python3', '/usr/local/sbin/policylab-deploy.py',
                        '--worker', *args], check=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Release failed:', error, file=sys.stderr)
        sys.exit(1)
