import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agent_cycle as agent


class AgentCycleTests(unittest.TestCase):
    def test_new_repeated_and_recovered(self):
        history = [{"checks": [{"id": "a", "status": "failed"}, {"id": "b", "status": "failed"}]}]
        results = [{"id": "a", "status": "passed"}, {"id": "b", "status": "failed"}, {"id": "c", "status": "blocked"}]
        self.assertEqual([row["trend"] for row in agent.transitions(results, history)],
                         ["recovered", "repeated", "new"])

    def test_history_retention(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state" / "history.json"
            agent.write_history(path, list(range(40)))
            self.assertEqual(agent.read_history(path), list(range(10, 40)))

    def test_model_only_receives_short_evidence(self):
        events = [{"id": "solver", "status": "failed", "trend": "new"}]
        with patch.object(agent, "build_opener") as builder:
            opener = builder.return_value
            response = opener.open.return_value.__enter__.return_value
            response.read.return_value = json.dumps({"response": '{"check":"solver"}'}).encode()
            self.assertEqual(agent.infer(events, "qwen2.5:0.5b")["check"], "solver")
            request = opener.open.call_args.args[0]
            self.assertEqual(request.full_url, "http://127.0.0.1:11434/api/generate")
            payload = json.loads(request.data)
            self.assertLess(len(payload["prompt"]), 500)
            self.assertEqual(payload["options"]["num_ctx"], 2048)
            response.read.return_value = b'{"response":"{\"check\":\"inventado\",\"action\":\"ok\"}"}'
            with self.assertRaises(ValueError):
                agent.infer(events, "qwen2.5:0.5b")

    @patch.object(agent.subprocess, "run")
    def test_check_gets_no_secret_environment(self, run):
        run.return_value.returncode = 0
        with patch.dict(agent.os.environ, {"API_KEY": "synthetic", "GH_TOKEN": "synthetic"}):
            self.assertEqual(agent.run_check(("check", "Test", ["test"]))["status"], "passed")
        self.assertNotIn("API_KEY", run.call_args.kwargs["env"])
        self.assertNotIn("GH_TOKEN", run.call_args.kwargs["env"])


if __name__ == "__main__":
    unittest.main()
