import unittest

from services.training.app import CATALOG, evaluate


class MiniTrainingTest(unittest.TestCase):
    def test_catalog_contains_expanded_segment_lessons(self):
        self.assertEqual(len(CATALOG), 13)
        self.assertIn("MT-VENT-01", {item["id"] for item in CATALOG})
        self.assertTrue(all(len(item["criteria"]) == len(item["objectives"]) for item in CATALOG))

    def test_feed_training_completion(self):
        result = evaluate(
            "MT-FEED-01",
            {"valveL1": 100, "pumpN1": "running", "pressureN1": 17.2},
            hints_used=1,
        )
        self.assertTrue(result["completed"])
        self.assertEqual(result["progressPercent"], 100)
        self.assertEqual(result["scorePercent"], 95)

    def test_elou_training_incomplete_when_salt_is_high(self):
        result = evaluate(
            "MT-ELOU-01",
            {
                "demulsifierOn": True,
                "washWaterOn": True,
                "electricFieldOn": True,
                "saltMgL": 8,
            },
            hints_used=0,
        )
        self.assertFalse(result["completed"])
        self.assertEqual(result["progressPercent"], 67)


if __name__ == "__main__":
    unittest.main()
