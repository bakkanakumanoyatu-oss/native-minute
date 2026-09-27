#!/usr/bin/env python3
"""Fail fast when commands run outside the approved Native Minute checkout."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

EXPECTED_ROOT = Path("/Users/karasawatakahiro/Developer/native-minute").resolve()
WORKTREE_PARENT = EXPECTED_ROOT.parent
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

    if cwd != git_root:
        print(f"workspace check failed: cwd is {cwd}; git root is {git_root}", file=sys.stderr)
        return 1

    if git_root != EXPECTED_ROOT:
        # An isolated sibling worktree is allowed only when Git says its common
        # repository is the approved Developer checkout. Never trust the path alone.
        try:
            common_dir = Path(subprocess.check_output(
                ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
                text=True,
            ).strip()).resolve()
        except subprocess.CalledProcessError:
            common_dir = None
        if git_root.parent != WORKTREE_PARENT or common_dir != EXPECTED_ROOT / ".git":
            print(f"workspace check failed: unapproved worktree {git_root}", file=sys.stderr)
            return 1

    print(f"workspace check passed: {git_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
