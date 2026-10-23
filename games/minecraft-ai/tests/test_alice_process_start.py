"""Evidence that a Linux Node PID birth is not a Bedrock spawn event."""
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
SPEC = importlib.util.spec_from_file_location(
    "alice_mint_ops", ROOT / "scripts" / "alice-mint.py")
MINT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MINT)


class VerifiedProcessStartTests(unittest.TestCase):
    def test_produces_epoch_ms_from_verified_linux_tick_and_kernel_boot(self):
        # Linux btime UTC seconds + stat.starttime clock ticks (not any
        # Minecraft spawn timestamp).
        started = MINT.verified_process_start_ms(
            "12000", proc_stat="cpu 1 2 3 4\nbtime 1700000000\n",
            ticks_per_second=100, now_ms=1700000200000)
        self.assertEqual(started, 1700000120000)

    def test_refuses_invalid_or_future_process_clock(self):
        for tick in ("NaN", "-1", "100.4", "00003", "10000000", ""):
            value = MINT.verified_process_start_ms(
                tick, proc_stat="btime 1700000000\n", ticks_per_second=100,
                now_ms=1700000200000)
            self.assertIsNone(value, tick)

    def test_refuses_unavailable_boot_evidence_without_guessing(self):
        for proc_stat in ("cpu 0 1 2\n", "btime secret\n", "btime 1\nbtime 2\n"):
            self.assertIsNone(MINT.verified_process_start_ms(
                "100", proc_stat=proc_stat, ticks_per_second=100,
                now_ms=1700000200000))


if __name__ == "__main__":
    unittest.main()
