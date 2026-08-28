"""Backend acceptance (SPEC v2.2 L1 contract + L2 data). Read-only vs product code."""
from __future__ import annotations

import inspect
import json
from pathlib import Path
from typing import get_type_hints

from fastapi.testclient import TestClient

from app.config import REPO_ROOT
from app.main import app
from app.services.scene_service import get_scene
from app.services.understanding.output import UnderstandingOutput
from app.services.understanding.providers import get_provider
from app.services.understanding.providers.gt_provider import GTProvider

client = TestClient(app)

WORLD_REAL = "w_0330_840483"
WORLD_MOCK = "w_mock_001"
WORLD_UNKNOWN = "w_does_not_exist"

SCENE_0330_PATH = REPO_ROOT / "mock" / "real_0330" / "scene_graph.json"
POSES_0330_PATH = REPO_ROOT / "mock" / "real_0330" / "camera_poses.json"
POSES_MOCK_PATH = REPO_ROOT / "mock" / "camera_poses.json"
SCENE_MOCK_PATH = REPO_ROOT / "mock" / "scene_graph.json"

# SPEC 附录 A：scene (x,y,z) Y-up → 点云 (X,Y,Z) Z-up
SOFA_INST_ID = "inst_sofa_417"
SOFA_TP_ID = "tp_sofa_417"
SOFA_SCENE_XYZ = [-0.498, 0.426, 1.105]
SCENE_TO_PC_OFFSET_X = 0.573
SCENE_TO_PC_Y_CONST = 1.087
COORD_ATOL = 1e-6


def _load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    assert isinstance(data, dict), f"JSON root must be object: {path}"
    return data


def _poses_from_file(path: Path) -> dict:
    data = _load_json(path)
    return {k: v for k, v in data.items() if not str(k).startswith("_")}


def _instance_count(scene: dict) -> int:
    rooms = scene.get("rooms") or []
    return sum(len(r.get("instances") or []) for r in rooms if isinstance(r, dict))


def _assert_error_body(body: object, *, case: str) -> None:
    assert isinstance(body, dict), f"{case}: 错误体应为 object，实际 {type(body).__name__}"
    assert set(body.keys()) == {"code", "message"}, (
        f"{case}: 错误体字段应为 {{code, message}}，实际 {sorted(body.keys())}"
    )
    assert isinstance(body["code"], str) and body["code"], f"{case}: code 应非空字符串"
    assert isinstance(body["message"], str) and body["message"], f"{case}: message 应非空字符串"


def _assert_snake_case_keys(obj: dict, *, case: str) -> None:
    for key in obj:
        assert key == key.lower() and " " not in key, (
            f"{case}: 字段名应为 snake_case，实际 {key!r}"
        )
        assert key.lower().replace("_", "").isalnum() or "_" in key or key.isalnum(), (
            f"{case}: 字段名应为 snake_case，实际 {key!r}"
        )


# ---------------------------------------------------------------------------
# L1-1  GET /api/scene/{world_id}
# ---------------------------------------------------------------------------


def test_l1_scene_real_0330_coord_and_world_id() -> None:
    case = "L1-1 scene w_0330_840483"
    resp = client.get(f"/api/scene/{WORLD_REAL}")
    assert resp.status_code == 200, f"{case}: 期望 200，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    assert body.get("world_id") == WORLD_REAL, (
        f"{case}: world_id 期望 {WORLD_REAL!r}，实际 {body.get('world_id')!r}"
    )
    coord = body.get("coord")
    assert isinstance(coord, dict), f"{case}: 缺少 coord 对象"
    assert coord.get("unit") == "m", f"{case}: coord.unit 期望 'm'，实际 {coord.get('unit')!r}"
    assert coord.get("up") == "Y", f"{case}: coord.up 期望 'Y'，实际 {coord.get('up')!r}"


def test_l1_scene_mock_handwritten() -> None:
    case = "L1-1 scene w_mock_001"
    expected = _load_json(SCENE_MOCK_PATH)
    resp = client.get(f"/api/scene/{WORLD_MOCK}")
    assert resp.status_code == 200, f"{case}: 期望 200，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    assert body.get("world_id") == WORLD_MOCK, (
        f"{case}: world_id 期望 {WORLD_MOCK!r}，实际 {body.get('world_id')!r}"
    )
    assert body.get("coord", {}).get("unit") == "m"
    assert body.get("coord", {}).get("up") == "Y"
    house = body.get("house") or {}
    assert house.get("title") == expected["house"]["title"], (
        f"{case}: 手写 mock house.title 期望 {expected['house']['title']!r}，"
        f"实际 {house.get('title')!r}"
    )
    assert body.get("rooms") == expected["rooms"], f"{case}: rooms 应与 mock/scene_graph.json 一致"


def test_l1_scene_unknown_world_404() -> None:
    case = "L1-1 scene unknown"
    resp = client.get(f"/api/scene/{WORLD_UNKNOWN}")
    assert resp.status_code == 404, f"{case}: 期望 404，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    _assert_error_body(body, case=case)
    assert body["code"] == "WORLD_NOT_FOUND", (
        f"{case}: code 期望 WORLD_NOT_FOUND，实际 {body['code']!r}"
    )
    assert body["message"] == "世界不存在", (
        f"{case}: message 期望 '世界不存在'，实际 {body['message']!r}"
    )


# ---------------------------------------------------------------------------
# L1-2  GET /api/camera_poses/{world_id}
# ---------------------------------------------------------------------------


def test_l1_camera_poses_real_0330_no_note_count() -> None:
    case = "L1-2 camera_poses w_0330_840483"
    file_poses = _poses_from_file(POSES_0330_PATH)
    resp = client.get(f"/api/camera_poses/{WORLD_REAL}")
    assert resp.status_code == 200, f"{case}: 期望 200，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    poses = body.get("poses")
    assert isinstance(poses, dict), f"{case}: 缺少 poses 对象"
    assert "_note" not in poses, f"{case}: poses 不应含 _note"
    assert len(poses) == len(file_poses), (
        f"{case}: poses 数量期望 {len(file_poses)}（与 mock/real_0330/camera_poses.json 去 _note 后一致），"
        f"实际 {len(poses)}"
    )


def test_l1_camera_poses_mock_handwritten() -> None:
    case = "L1-2 camera_poses w_mock_001"
    file_poses = _poses_from_file(POSES_MOCK_PATH)
    resp = client.get(f"/api/camera_poses/{WORLD_MOCK}")
    assert resp.status_code == 200, f"{case}: 期望 200，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    assert body.get("world_id") == WORLD_MOCK
    poses = body.get("poses")
    assert isinstance(poses, dict)
    assert "_note" not in poses
    assert poses == file_poses, f"{case}: poses 应与 mock/camera_poses.json 手写版（去 _note）一致"


def test_l1_camera_poses_unknown_world_404() -> None:
    case = "L1-2 camera_poses unknown"
    resp = client.get(f"/api/camera_poses/{WORLD_UNKNOWN}")
    assert resp.status_code == 404, f"{case}: 期望 404，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    _assert_error_body(body, case=case)
    assert body["code"] == "WORLD_NOT_FOUND"
    assert body["message"] == "世界不存在"


# ---------------------------------------------------------------------------
# L1-3  agent 五路由 stub
# ---------------------------------------------------------------------------


def test_l1_agent_chat_missing_required_400() -> None:
    case = "L1-3 chat 缺 session_id/world_id"
    resp = client.post("/api/agent/chat", json={"user_text": "hi"})
    assert resp.status_code == 400, f"{case}: 期望 400，实际 {resp.status_code} {resp.text}"
    _assert_error_body(resp.json(), case=case)


def test_l1_agent_chat_success_snake_case() -> None:
    case = "L1-3 chat 有 user_text"
    resp = client.post(
        "/api/agent/chat",
        json={
            "session_id": "s_accept",
            "world_id": WORLD_REAL,
            "user_text": "沙发在哪里",
        },
    )
    assert resp.status_code == 200, f"{case}: 期望 200，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    _assert_snake_case_keys(body, case=case)
    assert "reply_text" in body, f"{case}: 缺少必填字段 reply_text"
    assert isinstance(body["reply_text"], str)
    assert "tts_url" not in body, f"{case}: stub 无 tts 时应省略 tts_url，实际 {body}"
    assert "actions" not in body, f"{case}: stub 无动作时应省略 actions，实际 {body}"


def test_l1_agent_asr_multipart_audio() -> None:
    case = "L1-3 asr"
    resp = client.post(
        "/api/agent/asr",
        files={"audio": ("clip.webm", b"\x00\x00", "audio/webm")},
    )
    assert resp.status_code == 200, f"{case}: 期望 200，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    assert "text" in body, f"{case}: 缺少 text，实际 {body}"
    assert "duration_ms" in body, f"{case}: 缺少 duration_ms，实际 {body}"


def test_l1_agent_tts_omits_empty_audio_url() -> None:
    case = "L1-3 tts"
    resp = client.post("/api/agent/tts", json={"text": "主卧朝南"})
    assert resp.status_code == 200, f"{case}: 期望 200，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    assert "audio_url" not in body, f"{case}: stub 无音频时应省略 audio_url，实际 {body}"
    assert body == {}, f"{case}: stub 期望空对象 {{}}, 实际 {body}"


def test_l1_agent_narration_returns_reply_omits_empty_tts() -> None:
    case = "L1-3 narration"
    resp = client.get(
        "/api/agent/narration",
        params={"world_id": WORLD_REAL, "room_id": "room_living"},
    )
    assert resp.status_code == 200, f"{case}: 期望 200，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    assert "reply_text" in body, f"{case}: 缺少 reply_text，实际 {body}"
    assert "tts_url" not in body, f"{case}: stub 无 tts 时应省略 tts_url，实际 {body}"


def test_l1_agent_tour_returns_steps() -> None:
    case = "L1-3 tour"
    resp = client.post(
        "/api/agent/tour",
        json={"world_id": WORLD_REAL, "session_id": "s_accept"},
    )
    assert resp.status_code == 200, f"{case}: 期望 200，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    assert "steps" in body, f"{case}: 缺少 steps，实际 {body}"
    assert isinstance(body["steps"], list)


def test_l1_agent_errors_unified_code_message() -> None:
    case = "L1-3 错误统一 {code, message}"
    samples = [
        ("chat", client.post("/api/agent/chat", json={"user_text": "x"})),
        ("asr", client.post("/api/agent/asr", json={"foo": 1})),
        ("tts", client.post("/api/agent/tts", json={})),
        ("narration", client.get("/api/agent/narration")),
        ("tour", client.post("/api/agent/tour", json={})),
    ]
    for name, resp in samples:
        assert resp.status_code == 400, (
            f"{case} {name}: 期望 400，实际 {resp.status_code} {resp.text}"
        )
        _assert_error_body(resp.json(), case=f"{case} {name}")


# ---------------------------------------------------------------------------
# L1-4  CORS
# ---------------------------------------------------------------------------


def test_l1_cors_allow_origin_header() -> None:
    case = "L1-4 CORS"
    origin = "http://localhost:5173"
    resp = client.get(
        f"/api/scene/{WORLD_MOCK}",
        headers={"Origin": origin},
    )
    allow = resp.headers.get("access-control-allow-origin")
    assert allow, (
        f"{case}: 响应头缺少 access-control-allow-origin；"
        f"实际 headers={dict(resp.headers)}"
    )
    assert allow in ("*", origin), (
        f"{case}: access-control-allow-origin 期望 '*' 或 {origin!r}，实际 {allow!r}"
    )


# ---------------------------------------------------------------------------
# L2-5  scene vs mock/real_0330/scene_graph.json
# ---------------------------------------------------------------------------


def test_l2_scene_0330_matches_gt_file() -> None:
    case = "L2-5 scene vs scene_graph.json"
    gt = _load_json(SCENE_0330_PATH)
    resp = client.get(f"/api/scene/{WORLD_REAL}")
    assert resp.status_code == 200, f"{case}: 期望 200，实际 {resp.status_code}"
    body = resp.json()

    n_rooms_gt = len(gt.get("rooms") or [])
    n_rooms_api = len(body.get("rooms") or [])
    assert n_rooms_api == 10, f"{case}: 房间数期望 10，实际 {n_rooms_api}"
    assert n_rooms_api == n_rooms_gt, (
        f"{case}: 房间数 API={n_rooms_api} vs GT 文件={n_rooms_gt}"
    )

    n_inst_gt = _instance_count(gt)
    n_inst_api = _instance_count(body)
    assert n_inst_api == 75, f"{case}: 实例数期望 75，实际 {n_inst_api}"
    assert n_inst_api == n_inst_gt, (
        f"{case}: 实例数 API={n_inst_api} vs GT 文件={n_inst_gt}"
    )

    assert body.get("tour_path") == gt.get("tour_path"), (
        f"{case}: tour_path 与 GT 不一致。\n期望 {gt.get('tour_path')}\n实际 {body.get('tour_path')}"
    )
    gt_adj = (gt.get("topology") or {}).get("adjacency")
    api_adj = (body.get("topology") or {}).get("adjacency")
    assert api_adj == gt_adj, f"{case}: topology.adjacency 与 GT 不一致"


# ---------------------------------------------------------------------------
# L2-6  camera_poses vs 转正版 85 条
# ---------------------------------------------------------------------------


def test_l2_camera_poses_0330_exact_match_85() -> None:
    case = "L2-6 camera_poses vs camera_poses.json"
    file_poses = _poses_from_file(POSES_0330_PATH)
    resp = client.get(f"/api/camera_poses/{WORLD_REAL}")
    assert resp.status_code == 200, f"{case}: 期望 200，实际 {resp.status_code}"
    poses = resp.json().get("poses")
    assert isinstance(poses, dict)
    assert len(file_poses) == 85, (
        f"{case}: GT 文件去 _note 后期望 85 条，实际文件 {len(file_poses)} 条（数据层待确认）"
    )
    assert len(poses) == 85, f"{case}: API poses 期望 85 条，实际 {len(poses)}"
    assert poses == file_poses, f"{case}: API poses 与转正版 JSON 不完全一致"


# ---------------------------------------------------------------------------
# L2-7  坐标抽查 inst_sofa_417 ↔ tp_sofa_417
# ---------------------------------------------------------------------------


def _fwd_scene_to_pc(xyz: list[float]) -> list[float]:
    x, y, z = xyz
    return [x + SCENE_TO_PC_OFFSET_X, SCENE_TO_PC_Y_CONST - z, y]


def _rev_pc_to_scene(xyz: list[float]) -> list[float]:
    x_pc, y_pc, z_pc = xyz
    return [x_pc - SCENE_TO_PC_OFFSET_X, z_pc, SCENE_TO_PC_Y_CONST - y_pc]


def _close(a: list[float], b: list[float], *, case: str, label: str) -> None:
    assert len(a) == 3 and len(b) == 3, f"{case}: {label} 应为长度为 3 的坐标"
    diffs = [abs(float(a[i]) - float(b[i])) for i in range(3)]
    assert all(d <= COORD_ATOL for d in diffs), (
        f"{case}: {label} 超差。期望 {b}，实际 {a}，|Δ|={diffs}，atol={COORD_ATOL}"
    )


def test_l2_sofa_coord_forward_and_reverse() -> None:
    case = "L2-7 inst_sofa_417 坐标对拍"
    scene_resp = client.get(f"/api/scene/{WORLD_REAL}")
    pose_resp = client.get(f"/api/camera_poses/{WORLD_REAL}")
    assert scene_resp.status_code == 200
    assert pose_resp.status_code == 200

    sofa = None
    for room in scene_resp.json().get("rooms") or []:
        for inst in room.get("instances") or []:
            if inst.get("id") == SOFA_INST_ID:
                sofa = inst
                break
        if sofa:
            break
    assert sofa is not None, f"{case}: scene 中未找到 {SOFA_INST_ID}"
    scene_xyz = sofa.get("position")
    assert scene_xyz == SOFA_SCENE_XYZ, (
        f"{case}: scene position 期望 {SOFA_SCENE_XYZ}，实际 {scene_xyz}"
    )

    poses = pose_resp.json().get("poses") or {}
    assert SOFA_TP_ID in poses, f"{case}: camera_poses 缺少 {SOFA_TP_ID}"
    pc_xyz = poses[SOFA_TP_ID]

    expected_pc = _fwd_scene_to_pc(SOFA_SCENE_XYZ)
    _close(list(map(float, pc_xyz)), expected_pc, case=case, label="正向 scene→点云 vs tp_sofa_417")

    recovered = _rev_pc_to_scene(list(map(float, pc_xyz)))
    _close(recovered, SOFA_SCENE_XYZ, case=case, label="反向 点云→scene vs inst_sofa_417")


# ---------------------------------------------------------------------------
# L2-8  UnderstandingOutput + Provider 路径
# ---------------------------------------------------------------------------


def test_l2_understanding_output_and_provider_path() -> None:
    case = "L2-8 UnderstandingOutput / Provider"
    assert inspect.isclass(UnderstandingOutput), f"{case}: UnderstandingOutput 应为类型"
    doc = (UnderstandingOutput.__doc__ or "")
    assert "scene_graph" in doc, f"{case}: UnderstandingOutput 注释应说明 scene_graph 产出"
    assert "B" in doc and "A" in doc, f"{case}: 注释应标明消费方 B/A"

    hints = get_type_hints(get_scene)
    assert hints.get("return") is UnderstandingOutput, (
        f"{case}: get_scene 返回类型应为 UnderstandingOutput，实际 {hints.get('return')!r}"
    )
    src = inspect.getsource(get_scene)
    assert "get_provider()" in src, f"{case}: get_scene 应调用 get_provider()"
    assert "get_scene_graph" in src, f"{case}: get_scene 应走 Provider.get_scene_graph"

    provider = get_provider()
    assert isinstance(provider, GTProvider), (
        f"{case}: 默认 Provider 应为 GTProvider，实际 {type(provider).__name__}"
    )
    graph = provider.get_scene_graph(WORLD_REAL)
    assert graph is not None
    via_service = get_scene(WORLD_REAL)
    assert via_service["world_id"] == graph["world_id"]
    assert via_service["rooms"] == graph["rooms"]
