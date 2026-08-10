import unittest

from services.ai.engine import analyze_session, answer_question


class AiEngineTest(unittest.TestCase):
    def test_analysis_recommends_elou_training_for_bad_quality(self):
        result = analyze_session(
            {
                "scorePercent": 62,
                "penalty": 4,
                "process": {
                    "saltMgL": 18,
                    "waterAfterElou": 0.42,
                    "feedFlow": 700,
                    "pressureK1": 2.2,
                    "pressureK2": 0.5,
                    "levelK1": 50,
                    "levelK2": 50,
                    "tempFurnaceOut": 350,
                    "instrumentAirOk": True,
                    "coolingWaterOk": True,
                    "ventElouOk": True,
                    "gasPercent": 0,
                },
                "actionsLog": [{"at": 1, "description": "washWaterOn: включено"}],
                "systemEvents": [],
            }
        )
        ids = {item["trainingId"] for item in result["recommendations"]}
        self.assertIn("MT-ELOU-02", ids)
        self.assertTrue(result["findings"])
        self.assertEqual(result["trajectory"][0]["category"], "ЭЛОУ")

    def test_analysis_interprets_timeline_and_long_pause(self):
        result = analyze_session(
            {
                "scorePercent": 80,
                "penalty": 0,
                "process": {
                    "saltMgL": 3,
                    "waterAfterElou": 0.1,
                    "feedFlow": 700,
                    "pressureK1": 2.0,
                    "pressureK2": 0.5,
                    "levelK1": 50,
                    "levelK2": 50,
                    "tempFurnaceOut": 340,
                    "instrumentAirOk": True,
                    "coolingWaterOk": True,
                    "ventElouOk": True,
                    "gasPercent": 0,
                },
                "actionsLog": [
                    {"at": 1_000, "description": "Насос N-1: start"},
                    {"at": 101_000, "description": "Подача топливного газа: 55%"},
                ],
                "systemEvents": [],
            }
        )
        self.assertEqual(result["metrics"]["durationSeconds"], 100.0)
        self.assertEqual(result["metrics"]["controlAreasCount"], 2)
        self.assertIn("ACTION-PAUSE", {item["code"] for item in result["findings"]})

    def test_chat_returns_sources_and_related_training(self):
        result = answer_question({"message": "Как снизить давление К-1?", "context": {}})
        self.assertTrue(result["answer"])
        self.assertTrue(result["sources"])
        self.assertEqual(result["sources"][0]["articleId"], "k1-control")


if __name__ == "__main__":
    unittest.main()
