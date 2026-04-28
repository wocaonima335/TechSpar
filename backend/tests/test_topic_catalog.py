import json
import unittest
from pathlib import Path


class TopicCatalogTests(unittest.TestCase):
    def setUp(self):
        self.base_dir = Path(__file__).resolve().parents[2]
        self.topics_path = self.base_dir / "data" / "topics.json"
        self.knowledge_dir = self.base_dir / "data" / "knowledge"
        self.high_freq_dir = self.base_dir / "data" / "high_freq"

    def test_qt_topic_assets_exist(self):
        topics = json.loads(self.topics_path.read_text(encoding="utf-8"))

        self.assertIn("qt", topics)
        self.assertEqual(topics["qt"]["name"], "Qt 开发")
        self.assertEqual(topics["qt"]["icon"], "🧩")

        topic_dir = self.knowledge_dir / topics["qt"]["dir"]
        self.assertTrue(topic_dir.exists())
        self.assertTrue((topic_dir / "README.md").exists())
        self.assertTrue((self.high_freq_dir / "qt.md").exists())

    def test_qt_high_freq_has_interviewer_style_followups_and_scenarios(self):
        content = (self.high_freq_dir / "qt.md").read_text(encoding="utf-8")

        self.assertGreaterEqual(content.count("## Q"), 12)
        self.assertIn("**追问链路：**", content)
        self.assertIn("**场景题：**", content)
        self.assertIn("主线程", content)
        self.assertIn("跨线程", content)
        self.assertIn("事件循环", content)
        self.assertIn("Model/View", content)
        self.assertIn("QML", content)


if __name__ == "__main__":
    unittest.main()
