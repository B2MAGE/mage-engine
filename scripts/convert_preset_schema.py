#!/usr/bin/env python3
"""Convert legacy MAGE presets to compact v2 schema.

Legacy input examples contain top-level keys like:
- shader, path, settings, controls, camera

Compact output shape:
- version, visualizer, controls, intent, fx
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _as_number(value: Any) -> Optional[float]:
    return float(value) if _is_number(value) else None


def _as_bool(value: Any) -> Optional[bool]:
    return value if isinstance(value, bool) else None


def _extract_skybox_id(value: Any) -> Optional[int]:
    if isinstance(value, int) and value >= 0:
        return value
    if isinstance(value, str):
        text = value.strip()
        if text.isdigit():
            return int(text)
        match = re.search(r"preset(\d+)", text, re.IGNORECASE)
        if match:
            return int(match.group(1))
    return None


class BindingEntry:
    def __init__(self, key: str, value: Any, label: Optional[str], titles: List[str]) -> None:
        self.key = key
        self.value = value
        self.label = label
        self.titles = titles


class LegacySettingsIndex:
    def __init__(self, settings_root: Any) -> None:
        self.entries: List[BindingEntry] = []
        self._walk(settings_root, [])

    def _walk(self, node: Any, title_path: List[str]) -> None:
        if isinstance(node, list):
            for child in node:
                self._walk(child, title_path)
            return

        if not isinstance(node, dict):
            return

        next_path = title_path
        title = node.get("title")
        if isinstance(title, str) and title.strip():
            next_path = [*title_path, title.strip()]

        binding = node.get("binding")
        if isinstance(binding, dict):
            key = binding.get("key")
            if isinstance(key, str):
                self.entries.append(
                    BindingEntry(
                        key=key,
                        value=binding.get("value"),
                        label=node.get("label") if isinstance(node.get("label"), str) else None,
                        titles=next_path,
                    )
                )

        children = node.get("children")
        if isinstance(children, list):
            for child in children:
                self._walk(child, next_path)

    def first_by_key(self, key: str) -> Any:
        for entry in self.entries:
            if entry.key == key:
                return entry.value
        return None

    def first_by_label(self, label: str) -> Any:
        label_lower = label.strip().lower()
        for entry in self.entries:
            if entry.label and entry.label.strip().lower() == label_lower:
                return entry.value
        return None


def _convert_legacy_to_v2(data: Dict[str, Any]) -> Dict[str, Any]:
    settings = data.get("settings")
    index = LegacySettingsIndex(settings)
    visualizer_root = data.get("visualizer") if isinstance(data.get("visualizer"), dict) else {}
    state_root = data.get("state") if isinstance(data.get("state"), dict) else {}

    shader = data.get("shader") if isinstance(data.get("shader"), str) else visualizer_root.get("shader")
    shader_text = shader if isinstance(shader, str) else ""

    skybox_id = _extract_skybox_id(data.get("path"))
    if skybox_id is None:
        skybox_id = _extract_skybox_id(visualizer_root.get("skyboxPreset"))
    if skybox_id is None:
        skybox_id = _extract_skybox_id(index.first_by_key("path"))

    scale = _as_number(index.first_by_key("scale"))
    if scale is None:
        scale = _as_number(visualizer_root.get("scale"))
    if scale is None:
        scale = 10.0

    controls = data.get("controls") if isinstance(data.get("controls"), dict) else None

    time_multiplier = _as_number(index.first_by_key("TIME_MULTIPLIER"))
    if time_multiplier is None:
        time_multiplier = _as_number(state_root.get("time_multiplier"))

    cam_tilt = _as_number(index.first_by_key("camTilt"))
    if cam_tilt is None:
        cam_tilt = _as_number(state_root.get("camTilt"))
    if cam_tilt is None and isinstance(data.get("camera"), dict):
        up = (
            data.get("camera", {})
            .get("object", {})
            .get("up")
        )
        if isinstance(up, list) and len(up) >= 2 and _is_number(up[0]) and _is_number(up[1]):
            # Approximate original camTilt from camera up vector.
            cam_tilt = float(__import__("math").atan2(up[0], up[1]))

    fov = _as_number(index.first_by_label("FOV"))
    if fov is None:
        fov = _as_number(data.get("camera", {}).get("object", {}).get("fov"))

    intent: Dict[str, Any] = {
        "time_multiplier": time_multiplier if time_multiplier is not None else 1.0,
        "minimizing_factor": _as_number(index.first_by_key("minimizing_factor"))
        or _as_number(state_root.get("minimizing_factor"))
        or 0.8,
        "power_factor": _as_number(index.first_by_key("power_factor"))
        or _as_number(state_root.get("power_factor"))
        or 8.0,
        "pointerDownMultiplier": _as_number(index.first_by_key("pointerDownMultiplier"))
        or _as_number(state_root.get("pointerDownMultiplier"))
        or 0.0,
        "base_speed": _as_number(index.first_by_key("base_speed"))
        or _as_number(state_root.get("base_speed"))
        or 0.2,
        "easing_speed": _as_number(index.first_by_key("easing_speed"))
        or _as_number(state_root.get("easing_speed"))
        or 0.6,
        "camTilt": cam_tilt if cam_tilt is not None else 0.0,
        "autoRotate": _as_bool(index.first_by_key("autoRotate")),
        "autoRotateSpeed": _as_number(index.first_by_key("autoRotateSpeed")),
        "fov": fov,
    }

    # Remove nullable keys so the runtime falls back to current defaults.
    intent = {k: v for k, v in intent.items() if v is not None}

    fx: Dict[str, Any] = {
        "bloom": {
            "enabled": _as_bool(index.first_by_label("Enable Bloom")),
            "strength": _as_number(index.first_by_label("Strength")),
            "radius": _as_number(index.first_by_label("Radius")),
            "threshold": _as_number(index.first_by_label("Threshold")),
        },
        "toneMapping": {
            "method": _as_number(index.first_by_label("ToneMapping")),
            "exposure": _as_number(index.first_by_label("Exposure")),
        },
        "passes": {
            "rgbShift": _as_bool(index.first_by_label("RGBShift")),
            "dot": _as_bool(index.first_by_label("Dot FX")),
            "technicolor": _as_bool(index.first_by_label("Technicolor")),
            "luminosity": _as_bool(index.first_by_label("Luminosity")),
            "afterImage": _as_bool(index.first_by_label("After Image")),
            "sobel": _as_bool(index.first_by_label("Sobel")),
            "glitch": _as_bool(index.first_by_label("Glitch")),
            "colorify": _as_bool(index.first_by_label("Colorify")),
            "halftone": _as_bool(index.first_by_label("Halftone")),
            "gammaCorrection": _as_bool(index.first_by_label("Gamma Correction")),
            "kaleid": _as_bool(index.first_by_label("Kaleid")),
            "outputPass": _as_bool(index.first_by_label("Output Pass")),
        },
    }

    # Drop null fx values to avoid writing noisy placeholders.
    fx["bloom"] = {k: v for k, v in fx["bloom"].items() if v is not None}
    fx["toneMapping"] = {k: v for k, v in fx["toneMapping"].items() if v is not None}
    fx["passes"] = {k: v for k, v in fx["passes"].items() if v is not None}

    out: Dict[str, Any] = {
        "version": "2.0.0",
        "visualizer": {
            "shader": shader_text,
            "skyboxPreset": skybox_id if skybox_id is not None else 0,
            "scale": scale,
        },
        "controls": controls,
        "intent": intent,
        "fx": fx,
    }

    # Keep optional audio references if they exist in older payloads.
    audio_path = data.get("audioPath")
    if isinstance(audio_path, str) and audio_path.strip():
        out["audioPath"] = audio_path
    elif isinstance(data.get("audio"), str) and data["audio"].strip():
        out["audioPath"] = data["audio"]

    return out


def convert_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    # Already in new shape: normalize version and return as-is.
    if isinstance(data.get("visualizer"), dict) and (
        isinstance(data.get("intent"), dict) or isinstance(data.get("fx"), dict)
    ):
        normalized = dict(data)
        normalized.setdefault("version", "2.0.0")
        return normalized

    return _convert_legacy_to_v2(data)


def _load_json(path: Path) -> Dict[str, Any]:
    raw = path.read_text(encoding="utf-8")
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("Top-level JSON must be an object")
    return parsed


def _write_json(path: Path, payload: Dict[str, Any], compact: bool) -> None:
    if compact:
        text = json.dumps(payload, separators=(",", ":"), ensure_ascii=True)
    else:
        text = json.dumps(payload, indent=2, ensure_ascii=True)
    path.write_text(text + "\n", encoding="utf-8")


def _iter_json_files(input_path: Path) -> Iterable[Path]:
    if input_path.is_file():
        yield input_path
        return
    for candidate in sorted(input_path.rglob("*.json")):
        if candidate.is_file():
            yield candidate


def _target_path(src: Path, input_root: Path, output_root: Optional[Path], in_place: bool) -> Path:
    if in_place or output_root is None:
        return src
    relative = src.relative_to(input_root)
    return output_root / relative


def run(input_path: Path, output_path: Optional[Path], in_place: bool, compact: bool, dry_run: bool) -> Tuple[int, int]:
    if not input_path.exists():
        raise FileNotFoundError(f"Input path not found: {input_path}")

    files = list(_iter_json_files(input_path))
    converted = 0
    failed = 0

    if not files:
        print("No JSON files found.")
        return converted, failed

    if input_path.is_file() and output_path and not in_place:
        targets = {files[0]: output_path}
    else:
        targets = {
            src: _target_path(src, input_path if input_path.is_dir() else src.parent, output_path, in_place)
            for src in files
        }

    for src in files:
        try:
            payload = _load_json(src)
            new_payload = convert_payload(payload)
            dst = targets[src]

            if dry_run:
                print(f"[DRY-RUN] {src} -> {dst}")
                converted += 1
                continue

            dst.parent.mkdir(parents=True, exist_ok=True)
            _write_json(dst, new_payload, compact=compact)
            converted += 1
            print(f"Converted: {src} -> {dst}")
        except Exception as exc:  # noqa: BLE001 - CLI tool should continue on per-file errors.
            failed += 1
            print(f"Failed: {src} ({exc})")

    return converted, failed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert legacy MAGE preset JSON schema to compact v2 schema."
    )
    parser.add_argument("input", help="Input JSON file or directory")
    parser.add_argument(
        "-o",
        "--output",
        help="Output file (single input file) or output directory (directory input)",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite source file(s)",
    )
    parser.add_argument(
        "--compact",
        action="store_true",
        help="Write minified JSON instead of pretty JSON",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be converted without writing files",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve() if args.output else None

    if args.output and args.in_place:
        print("Use either --output or --in-place, not both.")
        return 2

    converted, failed = run(
        input_path=input_path,
        output_path=output_path,
        in_place=args.in_place,
        compact=args.compact,
        dry_run=args.dry_run,
    )

    print(f"Done. Converted: {converted}, Failed: {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
