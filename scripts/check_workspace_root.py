#!/usr/bin/env python3
"""Fail fast when commands run outside the approved Native Minute checkout."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

EXPECTED_ROOT = Path("/Users/karasawatakahiro/Developer/native-minute").resolve()
FORBIDDEN_ROOT = Path("/Users/karasawatakahiro/Desktop/native-minute")


def get_git_root() -> Path | None:
    try:
        output = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            stderr=subprocess.STDOUT,
            text=True,
        ).strip()
    except subprocess.CalledProcessError as exc:
        detail = exc.output.strip() or str(exc.returncode)
        print(f"workspace check failed: could not resolve git root ({detail})", file=sys.stderr)
        return None

    return Path(output).resolve()


def main() -> int:
    cwd = Path.cwd().resolve()
    git_root = get_git_root()

    if FORBIDDEN_ROOT.exists():
        print(f"workspace check failed: forbidden checkout exists at {FORBIDDEN_ROOT}", file=sys.stderr)
        return 1

    if git_root is None:
        return 1

    if cwd != EXPECTED_ROOT:
        print(f"workspace check failed: cwd is {cwd}; expected {EXPECTED_ROOT}", file=sys.stderr)
        return 1

    if git_root != EXPECTED_ROOT:
        print(f"workspace check failed: git root is {git_root}; expected {EXPECTED_ROOT}", file=sys.stderr)
        return 1

    print(f"workspace check passed: {git_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
