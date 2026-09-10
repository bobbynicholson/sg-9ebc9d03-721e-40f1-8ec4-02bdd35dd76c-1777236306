#!/usr/bin/env python3
"""Strip ' -- ' from non-comment lines across the codebase.

Bobby's hard rule: no em dashes and no double hyphens, anywhere a user
or client might read it. Email templates and UI strings have already
been rewritten by hand. This script catches the long tail of card
labels, tooltip strings and inline JSX text we have not touched.

Comments (// or * lines) are left alone. Backticks, single quotes and
double quotes are not parsed; we just substitute on lines that are
not pure comments.
"""
from __future__ import annotations
import os
import sys

SCAN_DIRS = ["src/pages", "src/components", "src/lib", "src/services"]
SKIP_FILES = {
    # Already rewritten by hand; do not touch.
    "src/lib/composeEmail.ts",
    # Strip script itself.
}


def transform_line(line: str) -> str:
    stripped = line.lstrip()
    if (
        stripped.startswith("//")
        or stripped.startswith("*")
        or stripped.startswith("/*")
    ):
        return line
    if " -- " in line:
        return line.replace(" -- ", ", ")
    return line


def norm(p: str) -> str:
    return p.replace(os.sep, "/")


def main() -> int:
    count = 0
    for root in SCAN_DIRS:
        for dirpath, _, filenames in os.walk(root):
            for fn in filenames:
                if not (fn.endswith(".tsx") or fn.endswith(".ts")):
                    continue
                fp = norm(os.path.join(dirpath, fn))
                if any(skip in fp for skip in SKIP_FILES):
                    continue
                try:
                    with open(fp, "r", encoding="utf-8") as f:
                        content = f.read()
                except UnicodeDecodeError:
                    continue
                lines = content.split("\n")
                out = [transform_line(l) for l in lines]
                new = "\n".join(out)
                if new != content:
                    with open(fp, "w", encoding="utf-8", newline="\n") as f:
                        f.write(new)
                    count += 1
    print(f"files changed: {count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
