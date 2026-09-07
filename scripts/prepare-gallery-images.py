#!/usr/bin/env python3
"""Encode ordinary photographic gallery sources without changing their content.

Run with Python 3 and Pillow installed. Sources remain in assets/examples/natural-sources.
"""

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "examples" / "natural-sources"
DESTINATION = ROOT / "public" / "gallery-images"
SOURCES = sorted(SOURCE.glob("*.png"))


def main() -> None:
    if not SOURCES:
        raise SystemExit(f"No gallery source PNGs found in {SOURCE}")
    DESTINATION.mkdir(parents=True, exist_ok=True)
    total_bytes = 0
    for source in SOURCES:
        with Image.open(source) as original:
            image = ImageOps.exif_transpose(original).convert("RGB")
            for suffix, size, quality in [("", 1200, 88), ("-thumb", 400, 80)]:
                derivative = image.copy()
                derivative.thumbnail((size, size), Image.Resampling.LANCZOS)
                destination = DESTINATION / f"natural-{source.stem}{suffix}.webp"
                derivative.save(destination, "WEBP", quality=quality, method=6)
                total_bytes += destination.stat().st_size
    print(f"Encoded {len(SOURCES)} studies into {len(SOURCES) * 2} WebP assets ({total_bytes / 1024 / 1024:.2f} MiB).")


if __name__ == "__main__":
    main()
