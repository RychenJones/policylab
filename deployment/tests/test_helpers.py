"""Offline helper checks. Never contact Docker, SSH, systemd or the target host."""
import importlib.util
import json
from pathlib import Path
import runpy
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

DEPLOYMENT = Path(__file__).resolve().parents[1]
# fcntl is Linux-only; the stub allows testing transaction logic on Windows.
try:
    import fcntl
except ImportError:
    sys.modules['fcntl'] = types.SimpleNamespace(LOCK_EX=2, LOCK_NB=4, flock=Mock())
spec = importlib.util.spec_from_file_location('release_helper', DEPLOYMENT / 'policylab-deploy.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
DIGEST = 'sha256:' + 'a' * 64
COMMIT = 'b' * 40
CURRENT = dict(digest='sha256:' + 'c' * 64, commit='d' * 40)
TARGET = dict(digest=DIGEST, commit=COMMIT)


class Helpers(unittest.TestCase):
    def test_strict_arguments(self):
        for args in [['rollback'], ['deploy', DIGEST, COMMIT]]:
            self.assertEqual(helper.parse(args), args)
        for args in [[], ['--worker'], ['rollback', 'extra'], ['deploy', DIGEST.upper(), COMMIT],
                     ['deploy', DIGEST, COMMIT + ';id'], ['deploy', 'latest', COMMIT]]:
            with self.assertRaises(ValueError):
                helper.parse(args)

    def test_forced_command(self):
        for command in ['rollback', f'deploy {DIGEST} {COMMIT}']:
            with patch.dict('os.environ', {'SSH_ORIGINAL_COMMAND': command}, clear=True), patch('os.execv') as execute:
                runpy.run_path(str(DEPLOYMENT / 'policylab-ci.py'))
                execute.assert_called_once_with('/usr/bin/sudo',
                    ['sudo', '-n', '/usr/local/sbin/policylab-deploy.py', *command.split()])
        for command in ['', 'sh', 'rollback\n', 'rollback extra', f'deploy {DIGEST} {COMMIT};id']:
            with patch.dict('os.environ', {'SSH_ORIGINAL_COMMAND': command}, clear=True), patch('os.execv') as execute:
                with self.assertRaises(SystemExit):
                    runpy.run_path(str(DEPLOYMENT / 'policylab-ci.py'))
                execute.assert_not_called()

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.state = Path(self.directory.name)
        self.patcher = patch.object(helper, 'STATE', self.state)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def save(self, name, value):
        (self.state / name).write_text(json.dumps(value))

    def test_success_and_explicit_rollback(self):
        self.save('current.json', CURRENT)
        with patch.object(helper, 'run', return_value=COMMIT), patch.object(helper, 'launch') as launch:
            helper.worker(['deploy', DIGEST, COMMIT])
            launch.assert_called_once_with(TARGET)
        self.assertEqual(helper.read('current.json'), TARGET)
        self.assertEqual(helper.read('previous.json'), CURRENT)
        self.assertIsNone(helper.read('pending.json'))
        with patch.object(helper, 'run', return_value=CURRENT['commit']), patch.object(helper, 'launch') as launch:
            helper.worker(['rollback'])
            launch.assert_called_once_with(CURRENT)
        self.assertEqual(helper.read('current.json'), CURRENT)
        self.assertEqual(helper.read('previous.json'), TARGET)

    def test_failed_readiness_restores_current(self):
        self.save('current.json', CURRENT)
        with patch.object(helper, 'run', return_value=COMMIT), patch.object(helper, 'launch', side_effect=[RuntimeError('unhealthy'), None]) as launch:
            with self.assertRaises(RuntimeError):
                helper.worker(['deploy', DIGEST, COMMIT])
        self.assertEqual([call.args[0] for call in launch.call_args_list], [TARGET, CURRENT])
        self.assertEqual(helper.read('current.json'), CURRENT)
        self.assertIsNone(helper.read('pending.json'))
        self.assertIsNotNone(helper.read('last-failure.json'))

    def test_failed_first_release_stops_app(self):
        with patch.object(helper, 'run', return_value=COMMIT), patch.object(helper, 'launch', side_effect=RuntimeError('unhealthy')), patch.object(helper, 'compose') as compose:
            with self.assertRaises(RuntimeError):
                helper.worker(['deploy', DIGEST, COMMIT])
            compose.assert_called_once_with('stop', 'app')
        self.assertIsNone(helper.read('current.json'))
        self.assertIsNone(helper.read('pending.json'))

    def test_failed_restoration_preserves_pending(self):
        self.save('current.json', CURRENT)
        with patch.object(helper, 'run', return_value=COMMIT), patch.object(helper, 'launch', side_effect=RuntimeError('unhealthy')):
            with self.assertRaises(RuntimeError):
                helper.worker(['deploy', DIGEST, COMMIT])
        self.assertIsNotNone(helper.read('pending.json'))

    def test_pending_transaction_blocks_changes(self):
        self.save('pending.json', dict(target=TARGET))
        with patch.object(helper, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'Unfinished transaction'):
                helper.worker(['deploy', DIGEST, COMMIT])
            run.assert_not_called()

    def test_pull_failure_or_wrong_revision_does_not_replace_app(self):
        for options in [dict(side_effect=RuntimeError('pull failed')), dict(return_value='wrong-revision')]:
            with patch.object(helper, 'run', **options), patch.object(helper, 'launch') as launch:
                with self.assertRaises(RuntimeError):
                    helper.worker(['deploy', DIGEST, COMMIT])
                launch.assert_not_called()
            self.assertIsNone(helper.read('pending.json'))


if __name__ == '__main__':
    unittest.main()
