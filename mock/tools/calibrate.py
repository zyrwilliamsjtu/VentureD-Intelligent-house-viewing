"""逐场景标定：ply AABB ↔ structure XY 范围 + 实例锚点是否落在 ply 盒内。

不套用 0330 的 0.573/1.087。house_center 以 origin.json（来自 scene_graph 房间质心）为准。
本脚本验证「点云与 structure 同属 IG 原生系」，并抽查锚点。
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

MARGIN_M = 0.5  # structure 应落在 ply XY 盒内（允许 0.5m 外沿高斯）


def compressed_ply_aabb(path: Path) -> tuple[list[float], list[float], int]:
    """从 SuperSplat chunk min/max 得到全局 AABB，不解码每个 splat。"""
    with path.open("rb") as f:
        n_chunk = n_vert = None
        current = None
        while True:
            line = f.readline()
            if not line:
                raise ValueError("PLY header 未找到 end_header")
            text = line.decode("ascii", errors="replace").rstrip("\r\n")
            if text.startswith("element "):
                parts = text.split()
                current = parts[1]
                if current == "chunk":
                    n_chunk = int(parts[2])
                elif current == "vertex":
                    n_vert = int(parts[2])
            if text == "end_header":
                break
        if not n_chunk:
            raise ValueError("无 chunk element")
        raw = f.read(n_chunk * 18 * 4)
    if len(raw) != n_chunk * 18 * 4:
        raise ValueError("chunk 段长度不足")
    mins = [1e9, 1e9, 1e9]
    maxs = [-1e9, -1e9, -1e9]
    for i in range(n_chunk):
        vals = struct.unpack_from("<18f", raw, i * 18 * 4)
        for a in range(3):
            mins[a] = min(mins[a], vals[a])
            maxs[a] = max(maxs[a], vals[a + 3])
    return mins, maxs, n_vert or 0


def structure_xy_aabb(structure: dict) -> tuple[list[float], list[float]]:
    xs: list[float] = []
    ys: list[float] = []
    for r in structure.get("rooms") or []:
        for p in r.get("profile") or []:
            xs.append(float(p[0]))
            ys.append(float(p[1]))
    return [min(xs), min(ys)], [max(xs), max(ys)]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene-id", required=True)
    parser.add_argument("--data-root", type=Path, default=Path(r"E:\科研\ventureD_data\interiorgs"))
    parser.add_argument("--mock-dir", type=Path, required=True)
    args = parser.parse_args()
    scene_dir = args.data_root / "scenes" / args.scene_id
    ply = scene_dir / "3dgs_compressed.ply"
    structure = json.loads((scene_dir / "structure.json").read_text(encoding="utf-8"))
    labels = json.loads((scene_dir / "labels.json").read_text(encoding="utf-8"))
    origin = json.loads((args.mock_dir / "origin.json").read_text(encoding="utf-8"))

    ply_min, ply_max, n_vert = compressed_ply_aabb(ply)
    st_min, st_max = structure_xy_aabb(structure)
    print(f"scene={args.scene_id} verts≈{n_vert}")
    print(f"ply    XYZ min={ply_min} max={ply_max}")
    print(f"struct XY  min={st_min} max={st_max}")
    print(f"house_center ox={origin['ox']} oz={origin['oz']} Y_const={origin['pc_offset_y_const']}")

    # ply 为 IG Z-up：地面 XY；structure.profile 同为 IG XY
    xy_ok = (
        ply_min[0] - MARGIN_M <= st_min[0]
        and ply_min[1] - MARGIN_M <= st_min[1]
        and ply_max[0] + MARGIN_M >= st_max[0]
        and ply_max[1] + MARGIN_M >= st_max[1]
    )
    print(f"structure XY inside ply XY (margin {MARGIN_M}m): {xy_ok}")

    # 锚点：labels 包围盒中心应落在 ply AABB（Z 用包围盒）
    anchors_ok = 0
    anchors_all = 0
    samples = []
    for inst in labels:
        bb = inst.get("bounding_box")
        if not bb:
            continue
        xs = [c["x"] for c in bb]
        ys = [c["y"] for c in bb]
        zs = [c["z"] for c in bb]
        cx, cy, cz = sum(xs) / len(xs), sum(ys) / len(ys), sum(zs) / len(zs)
        anchors_all += 1
        inside = (
            ply_min[0] - MARGIN_M <= cx <= ply_max[0] + MARGIN_M
            and ply_min[1] - MARGIN_M <= cy <= ply_max[1] + MARGIN_M
            and ply_min[2] - 1.0 <= cz <= ply_max[2] + 1.0
        )
        if inside:
            anchors_ok += 1
        if len(samples) < 8:
            samples.append((inst.get("label"), round(cx, 3), round(cy, 3), round(cz, 3), inside))
    ratio = anchors_ok / anchors_all if anchors_all else 0.0
    print(f"label anchors inside ply AABB: {anchors_ok}/{anchors_all} ({ratio:.1%})")
    print("sample anchors:", samples)

    # ply/structure 中心差（仅报告，不用于写死偏移）
    ply_cx = (ply_min[0] + ply_max[0]) / 2
    ply_cy = (ply_min[1] + ply_max[1]) / 2
    st_cx = (st_min[0] + st_max[0]) / 2
    st_cy = (st_min[1] + st_max[1]) / 2
    print(f"centroid delta ply-struct XY=({ply_cx - st_cx:.3f},{ply_cy - st_cy:.3f})")

    report = {
        "scene_id": args.scene_id,
        "ox": origin["ox"],
        "oz": origin["oz"],
        "pc_offset_y_const": origin["pc_offset_y_const"],
        "ply_min": ply_min,
        "ply_max": ply_max,
        "structure_xy_min": st_min,
        "structure_xy_max": st_max,
        "structure_inside_ply_xy": xy_ok,
        "anchors_ok": anchors_ok,
        "anchors_all": anchors_all,
        "anchor_ratio": round(ratio, 4),
    }
    (args.mock_dir / "calibrate_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    if not xy_ok:
        print("FAIL: structure XY 未落在 ply 范围内，坐标系可能不一致")
        return 1
    if ratio < 0.9:
        print("FAIL: 锚点落入 ply 比例 < 90%")
        return 1
    print("PASS calibrate")
    return 0


if __name__ == "__main__":
    sys.exit(main())
