"""Convert InteriorGS scene → SPEC v2.2 scene_graph.json（0330 标准流程，已参数化）。

PI-approved mappings (2026-08-27):
  coords: (x,y,z)_Zup -> (x, z, -y)_Yup; polygon [x,y] -> [x, -y]; origin=house_center
  rooms: infer from instances; open living+dining stays living_room;
         washer+sink room = bathroom named 洗衣间; fridge-only = kitchen
  lamps: only table_lamp / floor_lamp; exclude downlights
  polygon: Douglas-Peucker 0.08m

house_center 偏移（ox, oz）每场景独立计算，禁止套用 0330 的 0.573/-1.087。
"""
from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from pathlib import Path

DATA_ROOT = Path(r"E:\科研\ventureD_data\interiorgs")
REPO_ROOT = Path(__file__).resolve().parents[2]
DP_EPS = 0.08
DOOR_MAX_DIST = 0.45

# Order matters: more specific keywords first.
LABEL_TO_CAT: list[tuple[tuple[str, ...], str]] = [
    (("multi person sofa", "sofa combination", "armchair"), "sofa"),
    (("sofa",), "sofa"),
    (("tv cabinet", "television"), "tv_cabinet"),
    (("tv",), "tv_cabinet"),
    (("teatable", "tea table", "coffee table"), "coffee_table"),
    (("bedside table", "nightstand"), "bedside_table"),
    (("wardrobe",), "wardrobe"),
    (("bookcase combination", "bookshelf", "bookcase"), "bookshelf"),
    (("dining table",), "dining_table"),
    (("desk",), "desk"),
    (("high chair",), "chair"),
    (("chair",), "chair"),
    (("stool",), "chair"),
    (("refrigerator", "fridge"), "refrigerator"),
    (("gas stoves", "integrated cooktop", "cooktop"), "stove"),
    (("stove",), "stove"),
    (("washing machine",), "washing_machine"),
    (("squatting toilets", "closestool"), "toilet"),
    (("toilet",), "toilet"),
    (("shower room", "shower head", "bathtub"), "shower"),
    (("shower",), "shower"),
    (("basin cabinet", "washing station"), "sink"),
    (("faucet",), "sink"),
    (("basin",), "sink"),
    (("curtain",), "curtain"),
    (("green plants", "flowerpot", "flowers"), "plant"),
    (("plant",), "plant"),
    (("floor lamp", "table lamp"), "lamp"),  # movable lamps only
    (("cupboard", "wall cabinet", "storage cabinet", "wine cabinet"), "cabinet"),
    (("cabinet",), "cabinet"),
    (("functional bed", "bed combination", "mattress"), "bed"),
    (("bed",), "bed"),
]


def r3(v: float) -> float:
    return round(float(v), 3)


def shoelace(poly: list[list[float]]) -> float:
    n = len(poly)
    if n < 3:
        return 0.0
    a = 0.0
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        a += x1 * y2 - x2 * y1
    return a / 2.0


def ensure_ccw(poly: list[list[float]]) -> list[list[float]]:
    if shoelace(poly) < 0:
        return list(reversed(poly))
    return poly


def perp_dist(p: list[float], a: list[float], b: list[float]) -> float:
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def rdp(points: list[list[float]], eps: float) -> list[list[float]]:
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    idx, dmax = 0, 0.0
    for i in range(1, len(points) - 1):
        d = perp_dist(points[i], a, b)
        if d > dmax:
            idx, dmax = i, d
    if dmax > eps:
        left = rdp(points[: idx + 1], eps)
        right = rdp(points[idx:], eps)
        return left[:-1] + right
    return [points[0], points[-1]]


def simplify_closed(poly: list[list[float]], eps: float) -> list[list[float]]:
    if len(poly) <= 3:
        return poly
    closed = poly + [poly[0]]
    simple = rdp(closed, eps)
    if simple and simple[0] == simple[-1]:
        simple = simple[:-1]
    if len(simple) < 3:
        return simplify_closed(poly, eps * 0.5) if eps > 0.02 else poly
    return simple


def point_in_poly(x: float, y: float, poly: list[list[float]]) -> bool:
    n = len(poly)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def dist_point_poly(x: float, y: float, poly: list[list[float]]) -> float:
    if point_in_poly(x, y, poly):
        return 0.0
    n = len(poly)
    best = 1e9
    for i in range(n):
        best = min(best, perp_dist([x, y], poly[i], poly[(i + 1) % n]))
    return best


def centroid(poly: list[list[float]]) -> tuple[float, float]:
    if not poly:
        return 0.0, 0.0
    return sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)


def bbox_center(corners: list[dict]) -> tuple[float, float, float]:
    xs = [c["x"] for c in corners]
    ys = [c["y"] for c in corners]
    zs = [c["z"] for c in corners]
    n = len(corners)
    return sum(xs) / n, sum(ys) / n, sum(zs) / n


def bbox_size(corners: list[dict]) -> tuple[float, float, float]:
    xs = [c["x"] for c in corners]
    ys = [c["y"] for c in corners]
    zs = [c["z"] for c in corners]
    return max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)


def zup_to_yup(x: float, y: float, z: float) -> tuple[float, float, float]:
    return x, z, -y


def map_label(label: str) -> str | None:
    low = label.lower().replace("_", " ")
    if "downlight" in low:
        return None
    for kws, cat in LABEL_TO_CAT:
        for kw in kws:
            pat = r"(^|[^a-z])" + re.escape(kw) + r"([^a-z]|$)"
            if re.search(pat, low):
                if kw == "bed" and "embedded" in low:
                    continue
                return cat
    return None


def infer_kind(cats: set[str]) -> str:
    """Return internal kind: laundry | bathroom | kitchen | bedroom | living | study | entrance | other."""
    if "washing_machine" in cats and "toilet" not in cats and "shower" not in cats:
        return "laundry"
    if "toilet" in cats or "shower" in cats:
        return "bathroom"
    if "stove" in cats or "refrigerator" in cats:
        return "kitchen"
    if "bed" in cats:
        return "bedroom"
    if "sofa" in cats or "tv_cabinet" in cats or "coffee_table" in cats:
        return "living"
    if "dining_table" in cats:
        return "living"  # PI: do not split dining
    if "desk" in cats:
        return "study"
    if not cats:
        return "entrance"
    return "other"


def shortest_path(graph: dict[str, set[str]], start: str, goal: str) -> list[str] | None:
    if start == goal:
        return [start]
    q = [start]
    prev = {start: None}
    while q:
        cur = q.pop(0)
        for nb in sorted(graph.get(cur, [])):
            if nb in prev:
                continue
            prev[nb] = cur
            if nb == goal:
                path = [goal]
                while prev[path[-1]] is not None:
                    path.append(prev[path[-1]])
                path.reverse()
                return path
            q.append(nb)
    return None


def _unique_room_ids(
    id_of: dict[int, str], name_of: dict[int, str], raw_rooms: list[dict]
) -> None:
    """同一推断 id 出现多次时加后缀（0330 无重复，不改变其产出）。"""
    counts: dict[str, int] = {}
    for rr in raw_rooms:
        rid = id_of[rr["idx"]]
        counts[rid] = counts.get(rid, 0) + 1
    seen: dict[str, int] = {}
    for rr in raw_rooms:
        i = rr["idx"]
        rid = id_of[i]
        if counts[rid] == 1:
            continue
        seen[rid] = seen.get(rid, 0) + 1
        n = seen[rid]
        if n == 1:
            continue
        id_of[i] = f"{rid}_{n}"
        name_of[i] = f"{name_of[i]}{n}"


def _ceiling_height(structure: dict) -> float:
    heights = [
        float(w["height"])
        for w in (structure.get("walls") or [])
        if isinstance(w, dict) and w.get("height") is not None
    ]
    if not heights:
        return 2.8
    return round(heights[0], 2)


def main() -> None:
    parser = argparse.ArgumentParser(description="InteriorGS → SPEC scene_graph")
    parser.add_argument("--scene-id", required=True, help="如 0469_840829")
    parser.add_argument("--data-root", type=Path, default=DATA_ROOT)
    parser.add_argument("--out", type=Path, default=None, help="默认 mock/{scene_id}/scene_graph.json")
    args = parser.parse_args()
    scene_id = args.scene_id.strip()
    scene_dir = args.data_root / "scenes" / scene_id
    world_id = f"w_{scene_id}"
    out_path = args.out or (REPO_ROOT / "mock" / scene_id / "scene_graph.json")
    if not (scene_dir / "structure.json").is_file() or not (scene_dir / "labels.json").is_file():
        raise SystemExit(f"缺少 structure/labels: {scene_dir}")

    structure = json.loads((scene_dir / "structure.json").read_text(encoding="utf-8"))
    labels = json.loads((scene_dir / "labels.json").read_text(encoding="utf-8"))

    raw_rooms = []
    for i, r in enumerate(structure["rooms"]):
        poly = [[float(p[0]), float(p[1])] for p in r["profile"]]
        raw_rooms.append({"idx": i, "poly": poly, "area": abs(shoelace(poly))})

    assigned: dict[int, list[dict]] = defaultdict(list)
    for inst in labels:
        bb = inst.get("bounding_box")
        if not bb:
            continue
        cx, cy, cz = bbox_center(bb)
        sx, sy, sz = bbox_size(bb)
        cat = map_label(str(inst.get("label") or ""))
        rec = {
            "ins_id": str(inst.get("ins_id")),
            "label": inst.get("label"),
            "center": (cx, cy, cz),
            "size": (sx, sy, sz),
            "cat": cat,
        }
        hit = None
        for rr in raw_rooms:
            if point_in_poly(cx, cy, rr["poly"]):
                hit = rr["idx"]
                break
        if hit is not None:
            assigned[hit].append(rec)

    kinds = []
    for rr in raw_rooms:
        cats = {it["cat"] for it in assigned[rr["idx"]] if it["cat"]}
        kinds.append(infer_kind(cats))

    bedroom_idxs = [rr["idx"] for rr, k in zip(raw_rooms, kinds) if k == "bedroom"]
    bedroom_idxs.sort(key=lambda i: raw_rooms[i]["area"], reverse=True)
    master_idx = bedroom_idxs[0] if bedroom_idxs else None

    bath_idxs = [rr["idx"] for rr, k in zip(raw_rooms, kinds) if k == "bathroom"]
    bath_idxs.sort(key=lambda i: raw_rooms[i]["area"], reverse=True)

    secondary_bed = bedroom_idxs[1:]
    bed_id_by_idx: dict[int, tuple[str, str]] = {}
    for n, idx in enumerate(secondary_bed):
        if n == 0:
            bed_id_by_idx[idx] = ("room_bedroom_second", "次卧")
        else:
            bed_id_by_idx[idx] = (f"room_bedroom_{n + 2}", f"卧室{n + 2}")

    id_of: dict[int, str] = {}
    name_of: dict[int, str] = {}
    type_of: dict[int, str] = {}
    bath_n = 0
    other_n = 0
    for rr, kind in zip(raw_rooms, kinds):
        i = rr["idx"]
        if kind == "living":
            id_of[i], type_of[i], name_of[i] = "room_living", "living_room", "客厅"
        elif kind == "kitchen":
            id_of[i], type_of[i], name_of[i] = "room_kitchen", "kitchen", "厨房"
        elif kind == "laundry":
            id_of[i], type_of[i], name_of[i] = "room_laundry", "bathroom", "洗衣间"
        elif kind == "study":
            id_of[i], type_of[i], name_of[i] = "room_study", "study", "书房"
        elif kind == "entrance":
            id_of[i], type_of[i], name_of[i] = "room_entrance", "entrance", "玄关"
        elif kind == "bedroom":
            if i == master_idx:
                id_of[i], type_of[i], name_of[i] = "room_bedroom_master", "bedroom", "主卧"
            else:
                rid, nm = bed_id_by_idx[i]
                id_of[i], type_of[i], name_of[i] = rid, "bedroom", nm
        elif kind == "bathroom":
            bath_n += 1
            id_of[i] = "room_bathroom" if bath_n == 1 else f"room_bathroom_{bath_n}"
            type_of[i], name_of[i] = "bathroom", "卫生间" if bath_n == 1 else f"卫生间{bath_n}"
        else:
            other_n += 1
            id_of[i] = f"room_other_{other_n}"
            type_of[i], name_of[i] = "living_room", "其他"

    _unique_room_ids(id_of, name_of, raw_rooms)

    # origin: mean of room centroids in SPEC XZ（每场景独立，禁止套用 0330）
    spec_centroids = []
    for rr in raw_rooms:
        cx, cy = centroid(rr["poly"])
        sx, _sy, sz = zup_to_yup(cx, cy, 0.0)
        spec_centroids.append((sx, sz))
    ox = sum(p[0] for p in spec_centroids) / len(spec_centroids)
    oz = sum(p[1] for p in spec_centroids) / len(spec_centroids)

    def to_spec_xz(x: float, y: float) -> list[float]:
        sx, _sy, sz = zup_to_yup(x, y, 0.0)
        return [r3(sx - ox), r3(sz - oz)]

    def to_spec_xyz(x: float, y: float, z: float) -> list[float]:
        sx, sy, sz = zup_to_yup(x, y, z)
        return [r3(sx - ox), r3(sy), r3(sz - oz)]

    # door adjacency in IG XY
    graph: dict[str, set[str]] = defaultdict(set)
    for hole in structure.get("holes") or []:
        if str(hole.get("type") or "").upper() != "DOOR":
            continue
        prof = hole.get("profile") or []
        if len(prof) < 2:
            continue
        hx = sum(float(p[0]) for p in prof) / len(prof)
        hy = sum(float(p[1]) for p in prof) / len(prof)
        ranked = sorted(
            ((dist_point_poly(hx, hy, rr["poly"]), rr["idx"]) for rr in raw_rooms),
            key=lambda t: t[0],
        )
        near = [(d, idx) for d, idx in ranked if d <= DOOR_MAX_DIST]
        if len(near) < 2:
            near = ranked[:2]
            if near[-1][0] > 0.8:
                continue
        a, b = id_of[near[0][1]], id_of[near[1][1]]
        if a != b:
            graph[a].add(b)
            graph[b].add(a)

    rooms_out = []
    for rr in raw_rooms:
        i = rr["idx"]
        poly_spec = [to_spec_xz(x, y) for x, y in rr["poly"]]
        poly_spec = simplify_closed(poly_spec, DP_EPS)
        poly_spec = ensure_ccw(poly_spec)
        poly_spec = [[r3(p[0]), r3(p[1])] for p in poly_spec]

        insts_out = []
        for it in assigned[i]:
            if not it["cat"]:
                continue
            pos = to_spec_xyz(*it["center"])
            dx, dy, dz = it["size"]
            size = [r3(dx), r3(dz), r3(dy)]
            inst_id = f"inst_{it['cat']}_{it['ins_id']}"
            obj = {
                "id": inst_id,
                "category": it["cat"],
                "position": pos,
                "bbox3d": {"center": pos, "size": size},
                "attrs": {"source_label": it["label"]},
                "trajectory_point_id": f"tp_{it['cat']}_{it['ins_id']}",
            }
            insts_out.append(obj)

        rid = id_of[i]
        adj = sorted(graph.get(rid, []))
        area = round(rr["area"], 1)
        story = f"{name_of[i]}约{area:g}平。"
        room_obj = {
            "id": rid,
            "type": type_of[i],
            "name": name_of[i],
            "area": area,
            "polygon": poly_spec,
            "adjacent_rooms": adj,
            "trajectory_point_id": f"tp_{rid[5:]}" if rid.startswith("room_") else f"tp_{rid}",
            "story_card": story,
            "instances": insts_out,
        }
        rooms_out.append(room_obj)

    # stable tour: preference order, walk graph without duplicating
    pref = []
    for key in (
        "room_entrance",
        "room_living",
        "room_kitchen",
        "room_laundry",
        "room_bathroom",
        "room_bathroom_2",
        "room_bathroom_3",
        "room_study",
        "room_bedroom_second",
        "room_bedroom_3",
        "room_bedroom_master",
    ):
        if any(r["id"] == key for r in rooms_out):
            pref.append(key)
    for r in rooms_out:
        if r["id"] not in pref:
            pref.append(r["id"])

    start = pref[0]
    tour = [start]
    visited = {start}
    for target in pref[1:]:
        if target in visited:
            continue
        # find nearest visited node that can reach target
        best = None
        for src in tour:
            path = shortest_path(graph, src, target)
            if path is None:
                continue
            extra = [p for p in path[1:] if p not in visited]
            if best is None or len(extra) < len(best):
                best = extra
        if best is None:
            tour.append(target)
            visited.add(target)
        else:
            for p in best:
                if p not in visited:
                    tour.append(p)
                    visited.add(p)

    adj_pairs = []
    seen = set()
    for a, nbs in graph.items():
        for b in nbs:
            key = tuple(sorted((a, b)))
            if key in seen:
                continue
            seen.add(key)
            adj_pairs.append({"from": a, "to": b})
    adj_pairs.sort(key=lambda e: (e["from"], e["to"]))

    n_bed = sum(1 for k in kinds if k == "bedroom")
    type_cn = {1: "一", 2: "两", 3: "三", 4: "四"}.get(n_bed, str(n_bed))
    house_type = f"{type_cn}室一厅"
    short = scene_id.split("_")[0]
    ceiling = _ceiling_height(structure)

    scene = {
        "world_id": world_id,
        "coord": {
            "unit": "m",
            "up": "Y",
            "origin": "house_center",
            "handedness": "right",
            "polygon_axis": "XZ",
            "polygon_winding": "ccw_top",
        },
        "house": {
            "title": f"InteriorGS {short} · {house_type}",
            "type": house_type,
            "total_area": round(sum(r["area"] for r in rooms_out), 1),
            "orientation": "待对拍",
            "floor": "待对拍",
            "price": "待对拍",
            "tags": ["真实场景", "InteriorGS"],
            "facts": {
                "ceiling_height": ceiling,
                "floor": "待对拍",
            },
        },
        "rooms": rooms_out,
        "tour_path": tour,
        "topology": {"adjacency": adj_pairs},
        "_notes": [
            "PLACEHOLDER house.title/orientation/floor/price/tags：数据集无这些字段",
            f"PLACEHOLDER house.facts 仅 ceiling_height={ceiling} 为 walls[].height 实测；物业费/得房率未填",
            f"house_center origin_xz=({ox:.6f},{oz:.6f}) 本场景独立标定，禁止套用 0330",
            "coords: InteriorGS Z-up (x,y,z) -> SPEC Y-up (x, z, -y); origin=house_center",
            "room types inferred from instance labels inside polygons (structure.json has no room_type)",
            "downlights excluded; lamp = floor lamp / table lamp only",
            "polygon simplified Douglas-Peucker eps=0.08m",
        ],
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    origin_path = out_path.with_name("origin.json")
    origin_path.write_text(
        json.dumps(
            {
                "scene_id": scene_id,
                "world_id": world_id,
                "ox": round(ox, 6),
                "oz": round(oz, 6),
                "pc_offset_x": round(ox, 6),
                "pc_offset_y_const": round(-oz, 6),
                "note": "X_pc=x+ox, Y_pc=(-oz)-z, Z_pc=y；ox/oz 为本场景 house_center，禁止套用 0330",
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    # validate
    json.loads(out_path.read_text(encoding="utf-8"))
    tps = [r["trajectory_point_id"] for r in rooms_out]
    for r in rooms_out:
        tps.extend(it["trajectory_point_id"] for it in r["instances"])
    assert len(tps) == len(set(tps)), "duplicate trajectory_point_id"
    ids = {r["id"] for r in rooms_out}
    for rid in tour:
        assert rid in ids
    for e in adj_pairs:
        assert e["from"] in ids and e["to"] in ids
    for r in rooms_out:
        for p in r["polygon"]:
            assert len(p) == 2
        for it in r["instances"]:
            assert len(it["position"]) == 3

    n_inst = sum(len(r["instances"]) for r in rooms_out)
    print(f"wrote={out_path}")
    print(f"bytes={out_path.stat().st_size} rooms={len(rooms_out)} instances={n_inst}")
    print(f"origin_xz=({ox:.3f},{oz:.3f}) tour={tour}")
    print("\n=== room list ===")
    print(f"{'id':<24} {'type':<14} {'name':<8} {'area':>7} {'poly':>4} {'inst':>4}  adj")
    for r in rooms_out:
        print(
            f"{r['id']:<24} {r['type']:<14} {r['name']:<8} {r['area']:>7.2f} "
            f"{len(r['polygon']):>4} {len(r['instances']):>4}  {','.join(r['adjacent_rooms']) or '-'}"
        )

    sample = next((r for r in rooms_out if r["id"] == "room_living"), rooms_out[0])
    sample_print = json.loads(json.dumps(sample))
    if len(sample_print["instances"]) > 3:
        sample_print["instances"] = sample_print["instances"][:3] + [
            f"... {len(sample['instances'])-3} more instances"
        ]
    print("\n=== sample room_living (instances truncated) ===")
    print(json.dumps(sample_print, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
