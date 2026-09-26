#!/usr/bin/env python3
"""
scripts/bump-version.py — the real fix for a bug demonstrated 3 times in a
row this session (0.39.79, 0.39.80, and the 0.39.81 attempt this replaces):
a naive prepend of a new "system: '0.X',  // [comment]" line before the old
one produces two duplicate object keys. JS keeps the LAST one, so
require('./lib/version.js').system silently evaluates to the OLD version
even when package.json (edited separately, correctly) says the new one —
exactly the kind of declared-vs-real drift this whole session exists to
catch, caused by my own tooling instead of found in someone else's code.

Real fix, not more vigilance: read the file, find the existing
`system: '<old>',   // <rest of line>` line via regex (not string
matching against a specific version, so this keeps working next time
too), build ONE new line with the new version prepended before the old
line's own comment, replace the single old line with the single new
line. Never two keys, structurally, not because someone remembered to
check.

Usage: python3 scripts/bump-version.py <new_version> <comment_text>
  <comment_text> is the raw text for the [0.X: ...] block, WITHOUT the
  brackets or version number — this script adds those.
"""
import re
import sys
import json
import pathlib

def main():
    if len(sys.argv) != 3:
        print("usage: bump-version.py <new_version> <comment_text>", file=sys.stderr)
        sys.exit(1)
    new_version, comment_text = sys.argv[1], sys.argv[2]

    root = pathlib.Path(__file__).resolve().parent.parent
    version_file = root / 'lib' / 'version.js'
    package_file = root / 'package.json'

    content = version_file.read_text()

    # Find the real, single existing system: line — regex, not a hardcoded
    # old-version string, so this script doesn't need editing every bump.
    m = re.search(r"^(\s*)system:\s*'([\d.]+)',(.*)$", content, re.MULTILINE)
    if not m:
        print("ERROR: could not find a real `system: '<version>',` line — refusing to guess.", file=sys.stderr)
        sys.exit(1)

    indent, old_version, old_rest = m.group(1), m.group(2), m.group(3)
    new_line = f"{indent}system: '{new_version}',   // [{new_version}: {comment_text}]{old_rest}"

    new_content = content[:m.start()] + new_line + content[m.end():]

    # Structural check before writing anything — exactly one system: key,
    # and it must be the new version. Refuse to write a broken file.
    check_count = len(re.findall(r"^\s*system:\s*'[\d.]+',", new_content, re.MULTILINE))
    if check_count != 1:
        print(f"ERROR: post-edit check found {check_count} system: keys, expected exactly 1 — refusing to write.", file=sys.stderr)
        sys.exit(1)

    version_file.write_text(new_content)

    pkg = json.loads(package_file.read_text())
    pkg['version'] = new_version
    # json.dumps + manual formatting to match this repo's existing 2-space style
    package_file.write_text(json.dumps(pkg, indent=2) + '\n')

    print(f"OK: {old_version} -> {new_version}, exactly 1 system: key confirmed, package.json synced.")

if __name__ == '__main__':
    main()
