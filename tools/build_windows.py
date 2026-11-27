# SPDX-License-Identifier: GPL-3.0-or-later
"""Build a portable Windows executable with all editor assets embedded."""
import argparse
import os
from pathlib import Path
from shutil import copy2, copytree
import subprocess
from tempfile import TemporaryDirectory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--go", default="go", help="Path to the Go compiler")
    parser.add_argument("--arch", choices=("amd64", "arm64"), default="amd64")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    assets = root / "output"
    if not (assets / "base_body.glb").is_file():
        parser.error("output/base_body.glb is missing. Use a complete copy of the repository.")

    target = root / "build" / f"CharacterCreator-windows-{args.arch}.exe"
    target.parent.mkdir(parents=True, exist_ok=True)
    compiler = str(Path(args.go).resolve()) if Path(args.go).is_file() else args.go
    with TemporaryDirectory(prefix="charactercreator-build-") as directory:
        stage = Path(directory)
        site = stage / "site"
        copytree(root / "web", site)
        for pattern in ("*.glb", "*.json"):
            for asset in assets.glob(pattern):
                copy2(asset, site / asset.name)
        for notice in ("LICENSE", "LICENSE-NOTES.md"):
            copy2(root / notice, site)
        copy2(root / "tools" / "offline_launcher.go", stage / "main.go")
        env = {**os.environ, "GOOS": "windows", "GOARCH": args.arch, "CGO_ENABLED": "0",
               "GOTOOLCHAIN": "local", "GOFLAGS": "", "GOPROXY": "off"}
        subprocess.run([compiler, "build", "-trimpath", "-ldflags=-s -w",
                        "-o", str(target), "main.go"], cwd=stage, env=env, check=True)
    print(target)


if __name__ == "__main__":
    main()
