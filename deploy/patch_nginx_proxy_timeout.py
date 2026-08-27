#!/usr/bin/env python3
"""Idempotently set proxy timeouts in one nginx server/location block."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import tempfile


def _block_end(text: str, opening_brace: int) -> int:
    depth = 0
    for index in range(opening_brace, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return index + 1
    raise ValueError("unterminated nginx block")


def patch_config(
    text: str,
    *,
    server_name: str,
    location: str,
    timeout: str,
    server_marker: str = "listen 443 ssl",
) -> str:
    candidates: list[tuple[int, int, re.Match[str]]] = []
    server_name_pattern = re.compile(
        rf"(?m)^[ \t]*server_name[ \t]+[^;]*(?<![\w.-]){re.escape(server_name)}(?![\w.-])[^;]*;"
    )
    location_pattern = re.compile(
        rf"(?m)^(?P<indent>[ \t]*)location[ \t]+{re.escape(location)}[ \t]*\{{"
    )
    server_marker_pattern = re.compile(
        rf"(?m)^[ \t]*{re.escape(server_marker)}(?:[ \t]+[^;]*)?;[ \t]*$"
    )
    for candidate in re.finditer(r"(?m)^[ \t]*server[ \t]*\{", text):
        candidate_open = text.find("{", candidate.start(), candidate.end())
        candidate_end = _block_end(text, candidate_open)
        candidate_text = text[candidate_open + 1:candidate_end - 1]
        location_match = location_pattern.search(candidate_text)
        if (
            server_name_pattern.search(candidate_text)
            and server_marker_pattern.search(candidate_text)
            and location_match is not None
        ):
            candidates.append((candidate_open, candidate_end, location_match))
    if len(candidates) != 1:
        raise ValueError(
            f"expected one TLS server/location for {server_name!r} {location!r}; found {len(candidates)}"
        )
    server_open, server_end, location_match = candidates[0]
    server = text[server_open + 1:server_end - 1]
    location_open = server.find("{", location_match.start(), location_match.end())
    location_end = _block_end(server, location_open)
    block = server[location_match.start():location_end]
    indent = location_match.group("indent") + "    "

    for directive in ("proxy_read_timeout", "proxy_send_timeout"):
        pattern = rf"(?m)^[ \t]*{directive}[ \t]+[^;]+;[ \t]*\n?"
        block = re.sub(pattern, "", block)
    opening_line_end = block.find("\n") + 1
    if opening_line_end == 0:
        raise ValueError("location opening line is malformed")
    directives = (
        f"{indent}proxy_read_timeout {timeout};\n"
        f"{indent}proxy_send_timeout {timeout};\n"
    )
    block = block[:opening_line_end] + directives + block[opening_line_end:]
    patched_server = server[:location_match.start()] + block + server[location_end:]
    return text[:server_open + 1] + patched_server + text[server_end - 1:]


def write_atomic(path: Path, content: str) -> None:
    stat = path.stat()
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.chmod(temporary, stat.st_mode)
        os.chown(temporary, stat.st_uid, stat.st_gid)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def patch_file(
    path: Path,
    *,
    server_name: str,
    location: str,
    timeout: str,
    server_marker: str = "listen 443 ssl",
) -> bool:
    resolved = path.resolve(strict=True)
    original = resolved.read_text(encoding="utf-8")
    patched = patch_config(
        original,
        server_name=server_name,
        location=location,
        timeout=timeout,
        server_marker=server_marker,
    )
    if patched == original:
        return False
    write_atomic(resolved, patched)
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", type=Path, required=True)
    parser.add_argument("--server-name", required=True)
    parser.add_argument("--location", required=True)
    parser.add_argument("--timeout", default="130s")
    parser.add_argument("--server-marker", default="listen 443 ssl")
    args = parser.parse_args()
    changed = patch_file(
        args.path,
        server_name=args.server_name,
        location=args.location,
        timeout=args.timeout,
        server_marker=args.server_marker,
    )
    if changed:
        print("nginx timeout block patched")
    else:
        print("nginx timeout block already current")


if __name__ == "__main__":
    main()
