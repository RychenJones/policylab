#!/usr/bin/python3
"""Use as root-owned authorized_keys forced command; no shell evaluation."""
import os
import re
import sys

request = os.environ.get('SSH_ORIGINAL_COMMAND', '')
if not re.fullmatch(r'(deploy sha256:[0-9a-f]{64} [0-9a-f]{40}|rollback)', request):
    sys.exit('Unsupported deployment request')
os.execv('/usr/bin/sudo', ['sudo', '-n', '/usr/local/sbin/policylab-deploy.py', *request.split()])
