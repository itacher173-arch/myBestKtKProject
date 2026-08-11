"""CLI для публикации текущей базы знаний в Qdrant."""

from __future__ import annotations

import argparse
import json

from backend.rag.service import ensure_index


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    result = ensure_index(force=args.force)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result.get("ok"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
