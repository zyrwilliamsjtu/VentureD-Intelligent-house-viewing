"""别名展开与包含匹配。"""

from app.services.agent.chat.grounding import find_instances_in_text, find_rooms_in_text
from app.services.agent.facts import load as load_facts
from app.services.agent.synonyms import categories_for_text, room_name_needles


def test_table_alias_maps_dining_and_desk() -> None:
    cats = categories_for_text("有没有桌子")
    assert "dining_table" in cats
    assert "desk" in cats


def test_bathroom_alias() -> None:
    assert "卫生间" in room_name_needles("有没有洗手间")


def test_0330_table_hits_dining() -> None:
    graph = load_facts("w_0330_840483")
    assert graph is not None
    hits = find_instances_in_text(graph, "这里有没有桌子")
    cats = {i.get("category") for i, _ in hits}
    assert "dining_table" in cats


def test_0330_bathroom_hits() -> None:
    graph = load_facts("w_0330_840483")
    assert graph is not None
    rooms = find_rooms_in_text(graph, "有没有洗手间")
    names = {str(r.get("name")) for r in rooms}
    assert "卫生间" in names


def test_sleep_place_alias() -> None:
    needles = room_name_needles("我想看看睡觉的地方")
    assert "主卧" in needles
    assert "次卧" in needles


def test_study_and_bath_aliases() -> None:
    assert "书房" in room_name_needles("看书的地方")
    assert "卫生间" in room_name_needles("上厕所")
    assert "卫生间" in room_name_needles("洗漱")
