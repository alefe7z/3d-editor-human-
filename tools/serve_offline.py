# SPDX-License-Identifier: GPL-3.0-or-later
"""Serve the bundled editor and models on the local computer."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from shutil import copy2, copytree
from tempfile import TemporaryDirectory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    assets = root / "output"
    if not (assets / "base_body.glb").is_file():
        parser.error("output/base_body.glb is missing. Use a complete copy of the repository.")

    with TemporaryDirectory(prefix="charactercreator-") as directory:
        stage = Path(directory)
        copytree(root / "web", stage, dirs_exist_ok=True)
        for pattern in ("*.glb", "*.json"):
            for asset in assets.glob(pattern):
                copy2(asset, stage / asset.name)
        handler = partial(SimpleHTTPRequestHandler, directory=directory)
        with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
            host, port = server.server_address
            print(f"Open http://{host}:{port}/?lang=en (Ctrl+C to stop)", flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass


if __name__ == "__main__":
    main()
