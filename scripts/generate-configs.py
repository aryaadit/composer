#!/usr/bin/env python3
"""
Generate TypeScript config files from the Composer venue sheet.

Reads reference tabs from docs/composer_venue_sheet_curated.xlsx and
emits typed config files to src/config/generated/. These files are
committed to git so production builds don't need the xlsx.

Workflow:
  1. Update Google Sheet (add a neighborhood, tweak vibe scoring, etc.)
  2. Export as xlsx to docs/
  3. Run: python3 scripts/generate-configs.py
  4. Commit the generated files
  5. Deploy

Usage:
  python3 scripts/generate-configs.py
"""

from __future__ import annotations
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
XLSX_PATH = ROOT / "docs" / "composer_venue_sheet_curated.xlsx"
OUT_DIR = ROOT / "src" / "config" / "generated"

# ═══════════════════════════════════════════════════════════════════════
# xlsx parser — reads a named sheet, returns list[list[str]]
# ═══════════════════════════════════════════════════════════════════════

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PKG = "http://schemas.openxmlformats.org/package/2006/relationships"


def _col_num(ref: str) -> int:
    m = re.match(r"([A-Z]+)", ref or "")
    if not m:
        return 0
    n = 0
    for c in m.group(1):
        n = n * 26 + (ord(c) - 64)
    return n


def _load_shared_strings(z: zipfile.ZipFile) -> list[str]:
    shared: list[str] = []
    if "xl/sharedStrings.xml" in z.namelist():
        with z.open("xl/sharedStrings.xml") as f:
            tree = ET.parse(f)
            for si in tree.getroot().findall(f"{{{NS_MAIN}}}si"):
                shared.append(
                    "".join(t.text or "" for t in si.iter(f"{{{NS_MAIN}}}t"))
                )
    return shared


def _resolve_sheet_file(z: zipfile.ZipFile, sheet_name: str) -> str | None:
    with z.open("xl/workbook.xml") as f:
        wb = ET.parse(f).getroot()
    target_rid = None
    for s in wb.find(f"{{{NS_MAIN}}}sheets").findall(f"{{{NS_MAIN}}}sheet"):
        if s.get("name") == sheet_name:
            target_rid = s.get(f"{{{NS_R}}}id")
            break
    if not target_rid:
        return None
    with z.open("xl/_rels/workbook.xml.rels") as f:
        rels = ET.parse(f).getroot()
    for r in rels.findall(f"{{{NS_PKG}}}Relationship"):
        if r.get("Id") == target_rid:
            return "xl/" + r.get("Target")
    return None


def parse_sheet(xlsx_path: Path, sheet_name: str) -> list[list[str]]:
    """Read a named sheet and return dense rows of strings."""
    z = zipfile.ZipFile(xlsx_path)
    shared = _load_shared_strings(z)
    target_file = _resolve_sheet_file(z, sheet_name)
    if not target_file:
        print(f"WARNING: sheet '{sheet_name}' not found", file=sys.stderr)
        return []
    with z.open(target_file) as f:
        tree = ET.parse(f).getroot()
    rows: list[list[str]] = []
    for row in tree.iter(f"{{{NS_MAIN}}}row"):
        cells: list[tuple[int, str]] = []
        for c in row.findall(f"{{{NS_MAIN}}}c"):
            ref = c.get("r") or ""
            t = c.get("t")
            v = c.find(f"{{{NS_MAIN}}}v")
            inline = c.find(f"{{{NS_MAIN}}}is")
            if t == "s" and v is not None:
                idx = int(v.text) if v.text and v.text.lstrip("-").isdigit() else -1
                val = shared[idx] if 0 <= idx < len(shared) else ""
            elif t == "inlineStr" and inline is not None:
                val = "".join(
                    x.text or "" for x in inline.iter(f"{{{NS_MAIN}}}t")
                )
            elif v is not None:
                val = v.text or ""
            else:
                val = ""
            cells.append((_col_num(ref), val))
        if not cells:
            continue
        maxc = max(c for c, _ in cells)
        dense = [""] * maxc
        for c, v in cells:
            dense[c - 1] = v
        rows.append(dense)
    return rows


def split_csv(s: str) -> list[str]:
    """Split a comma-separated cell, trim each token, drop empties."""
    return [t.strip() for t in s.split(",") if t.strip()]


def is_slug(s: str) -> bool:
    """True if the string looks like a snake_case slug (not a display label)."""
    return bool(s) and bool(re.fullmatch(r"[a-z0-9_]+", s))


# ═══════════════════════════════════════════════════════════════════════
# Sheet readers — each returns the data needed for its output file
# ═══════════════════════════════════════════════════════════════════════


def read_vibe_scoring_matrix(xlsx: Path) -> dict[str, dict]:
    """Returns {slug: {label, tags[]}} from the Vibe Scoring Matrix tab."""
    rows = parse_sheet(xlsx, "Vibe Scoring Matrix")
    result: dict[str, dict] = {}
    for r in rows[3:]:  # skip title, description, headers
        slug = (r[0] if len(r) > 0 else "").strip()
        if not slug or not is_slug(slug):
            continue
        label = (r[1] if len(r) > 1 else "").strip()
        tags_raw = r[2] if len(r) > 2 else ""
        tags = split_csv(tags_raw)
        result[slug] = {"label": label, "tags": tags}
    return result


def read_vibe_tags(xlsx: Path) -> list[str]:
    """Returns all tag values from the Vibe Tags tab (flat list)."""
    rows = parse_sheet(xlsx, "Vibe Tags")
    tags: list[str] = []
    for r in rows[3:]:  # skip title, db info, headers
        val = (r[0] if r else "").strip()
        if is_slug(val):
            tags.append(val)
    return tags


def read_neighborhood_groups(xlsx: Path) -> list[dict]:
    """Returns [{id, label, borough, slugs[]}] from the Neighborhood Groups tab."""
    rows = parse_sheet(xlsx, "Neighborhood Groups")
    groups: list[dict] = []
    for r in rows[3:]:  # skip title, description, headers
        gid = (r[0] if len(r) > 0 else "").strip()
        if not gid or not is_slug(gid):
            continue
        label = (r[1] if len(r) > 1 else "").strip()
        borough = (r[2] if len(r) > 2 else "").strip()
        slugs = split_csv(r[3] if len(r) > 3 else "")
        groups.append({"id": gid, "label": label, "borough": borough, "slugs": slugs})
    return groups


def read_all_neighborhoods(xlsx: Path) -> list[str]:
    """Returns all storage slug values from the Neighborhoods tab."""
    rows = parse_sheet(xlsx, "Neighborhoods")
    slugs: list[str] = []
    for r in rows[3:]:  # skip title, db info, headers
        val = (r[0] if r else "").strip()
        if is_slug(val) and val not in slugs:
            slugs.append(val)
    return slugs


def read_stop_roles(xlsx: Path) -> list[dict]:
    """Returns [{value, serves_as[]}] from the Stop Roles tab."""
    rows = parse_sheet(xlsx, "Stop Roles")
    roles: list[dict] = []
    for r in rows[3:]:  # skip title, db info, headers
        val = (r[0] if len(r) > 0 else "").strip()
        if not val or not is_slug(val):
            continue
        serves_as = split_csv(r[3] if len(r) > 3 else val)
        roles.append({"value": val, "serves_as": serves_as})
    return roles


def read_budget_tiers(xlsx: Path) -> list[dict]:
    """Returns [{slug, label, tiers[]}] from the Budget Tiers tab."""
    rows = parse_sheet(xlsx, "Budget Tiers")
    tiers: list[dict] = []
    for r in rows[3:]:  # skip title, description, headers
        slug = (r[0] if len(r) > 0 else "").strip()
        if not slug or not is_slug(slug):
            continue
        label = (r[1] if len(r) > 1 else "").strip()
        tiers_raw = r[2] if len(r) > 2 else ""
        # Parse "1, 2, 3, 4" or "1.0" etc.
        tier_nums = [int(float(t.strip())) for t in tiers_raw.split(",") if t.strip()]
        tiers.append({"slug": slug, "label": label, "tiers": tier_nums})
    return tiers


def read_occasions(xlsx: Path) -> list[str]:
    """Returns all occasion tag values from the Occasion Tags tab."""
    rows = parse_sheet(xlsx, "Occasion Tags")
    tags: list[str] = []
    for r in rows[3:]:  # skip title, db info, headers
        val = (r[0] if r else "").strip()
        if is_slug(val):
            tags.append(val)
    return tags


def read_categories(xlsx: Path) -> list[str]:
    """Returns all category values from the Categories tab."""
    rows = parse_sheet(xlsx, "Categories")
    cats: list[str] = []
    for r in rows[3:]:  # skip title, db info, headers
        val = (r[0] if r else "").strip()
        if is_slug(val) and val not in cats:
            cats.append(val)
    return cats


# ═══════════════════════════════════════════════════════════════════════
# TypeScript emitters
# ═══════════════════════════════════════════════════════════════════════

HEADER = (
    "// AUTO-GENERATED — DO NOT EDIT\n"
    f"// Source: docs/composer_venue_sheet_curated.xlsx\n"
    f"// Generated: {datetime.now(timezone.utc).isoformat()}\n\n"
)


def quote(s: str) -> str:
    return f'"{s}"'


def emit_string_array(name: str, values: list[str], as_const: bool = False) -> str:
    items = ", ".join(quote(v) for v in values)
    suffix = " as const" if as_const else ""
    type_ann = "" if as_const else ": string[]"
    return f"export const {name}{type_ann} = [{items}]{suffix};\n"


def emit_vibes(xlsx: Path) -> str:
    matrix = read_vibe_scoring_matrix(xlsx)
    all_tags = read_vibe_tags(xlsx)

    # Scored tags = union of all tags in the scoring matrix
    scored_set: set[str] = set()
    for entry in matrix.values():
        scored_set.update(entry["tags"])

    scored = [t for t in all_tags if t in scored_set]
    cross_cutting = [t for t in all_tags if t not in scored_set]

    lines = [HEADER]

    # VIBE_VENUE_TAGS
    lines.append("export const VIBE_VENUE_TAGS: Record<string, string[]> = {\n")
    for slug, entry in matrix.items():
        tags = ", ".join(quote(t) for t in entry["tags"])
        lines.append(f"  {slug}: [{tags}],\n")
    lines.append("};\n\n")

    # VIBE_DISPLAY_LABELS
    lines.append("export const VIBE_DISPLAY_LABELS: Record<string, string> = {\n")
    for slug, entry in matrix.items():
        lines.append(f"  {slug}: {quote(entry['label'])},\n")
    lines.append("};\n\n")

    # Scored + cross-cutting arrays
    lines.append(emit_string_array("SCORED_VIBE_TAGS", scored))
    lines.append("\n")
    lines.append(emit_string_array("CROSS_CUTTING_VIBE_TAGS", cross_cutting))

    return "".join(lines)


def emit_neighborhoods(xlsx: Path) -> str:
    groups = read_neighborhood_groups(xlsx)
    all_hoods = read_all_neighborhoods(xlsx)

    lines = [HEADER]

    # Type
    lines.append(
        "export interface NeighborhoodGroup {\n"
        "  label: string;\n"
        "  borough: string;\n"
        "  slugs: string[];\n"
        "}\n\n"
    )

    # NEIGHBORHOOD_GROUPS
    lines.append("export const NEIGHBORHOOD_GROUPS: Record<string, NeighborhoodGroup> = {\n")
    for g in groups:
        slugs = ", ".join(quote(s) for s in g["slugs"])
        lines.append(
            f"  {g['id']}: {{\n"
            f"    label: {quote(g['label'])},\n"
            f"    borough: {quote(g['borough'])},\n"
            f"    slugs: [{slugs}],\n"
            f"  }},\n"
        )
    lines.append("};\n\n")

    # ALL_NEIGHBORHOODS
    lines.append(emit_string_array("ALL_NEIGHBORHOODS", all_hoods))

    return "".join(lines)


def emit_stop_roles(xlsx: Path) -> str:
    roles = read_stop_roles(xlsx)

    lines = [HEADER]

    # ROLE_EXPANSION
    lines.append("export const ROLE_EXPANSION: Record<string, string[]> = {\n")
    for r in roles:
        serves = ", ".join(quote(s) for s in r["serves_as"])
        lines.append(f"  {r['value']}: [{serves}],\n")
    lines.append("};\n\n")

    # ALL_STOP_ROLES
    all_roles = [r["value"] for r in roles]
    lines.append(emit_string_array("ALL_STOP_ROLES", all_roles, as_const=True))

    return "".join(lines)


def emit_budgets(xlsx: Path) -> str:
    tiers = read_budget_tiers(xlsx)

    lines = [HEADER]

    lines.append(
        "export interface BudgetTier {\n"
        "  label: string;\n"
        "  tiers: number[];\n"
        "}\n\n"
    )

    lines.append("export const BUDGET_TIERS: Record<string, BudgetTier> = {\n")
    for t in tiers:
        tier_nums = ", ".join(str(n) for n in t["tiers"])
        lines.append(
            f"  {t['slug']}: {{\n"
            f"    label: {quote(t['label'])},\n"
            f"    tiers: [{tier_nums}],\n"
            f"  }},\n"
        )
    lines.append("};\n")

    return "".join(lines)


def emit_occasions(xlsx: Path) -> str:
    tags = read_occasions(xlsx)
    return HEADER + emit_string_array("OCCASIONS", tags, as_const=True)


def emit_categories(xlsx: Path) -> str:
    cats = read_categories(xlsx)
    return HEADER + emit_string_array("CATEGORIES", cats, as_const=True)


# ═══════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════

OUTPUTS: list[tuple[str, callable]] = [
    ("vibes.ts", emit_vibes),
    ("neighborhoods.ts", emit_neighborhoods),
    ("stop-roles.ts", emit_stop_roles),
    ("budgets.ts", emit_budgets),
    ("occasions.ts", emit_occasions),
    ("categories.ts", emit_categories),
]


def main() -> int:
    if not XLSX_PATH.exists():
        print(f"ERROR: xlsx not found at {XLSX_PATH}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for filename, emitter in OUTPUTS:
        content = emitter(XLSX_PATH)
        out_path = OUT_DIR / filename
        out_path.write_text(content)
        lines = content.count("\n")
        print(f"  ✓ {filename:25s} ({lines} lines)", file=sys.stderr)

    print(f"\nGenerated {len(OUTPUTS)} files in {OUT_DIR.relative_to(ROOT)}/", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
