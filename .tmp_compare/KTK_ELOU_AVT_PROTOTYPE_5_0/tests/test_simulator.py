import unittest

from services.training.app import CATALOG
from services.simulator.ktk_simulator.commands import apply_command, start_session
from services.simulator.ktk_simulator.model import Model
from services.simulator.ktk_simulator.projection import public_state


class SimulatorTest(unittest.TestCase):
    def test_model_changes_after_step(self):
        model = Model()
        start_session(model, "SC-05")
        before = model.s["k1_p"]
        for _ in range(20):
            model.step(1)
        self.assertNotEqual(before, model.s["k1_p"])
        self.assertIn("SC-05", model.active)

    def test_frontend_projection_and_commands(self):
        model = Model()
        apply_command(model, {"command": "valve", "id": "L-1", "action": "close"})
        apply_command(model, {"command": "fuel", "value": 35})
        state = public_state(model)
        self.assertEqual(state["process"]["valveL1"], 0)
        self.assertEqual(state["process"]["fuelGasPercent"], 35)
        self.assertGreaterEqual(len(state["controls"]), 35)
        self.assertGreaterEqual(len(state["pumps"]), 15)

    def test_all_scenarios_can_be_activated(self):
        model = Model()
        for number in range(1, 16):
            scenario = f"SC-{number:02d}"
            start_session(model, scenario)
            if scenario != "SC-14":
                self.assertIn(scenario, model.active)

    def test_mini_training_presets(self):
        model = Model()
        start_session(model, "MT-FEED-01")
        self.assertEqual(model.ui["valveL1"], 0)
        self.assertFalse(model.pumps["Н-1"]["running"])

        start_session(model, "MT-ELOU-01")
        self.assertFalse(model.ui["demulsifierOn"])
        self.assertGreater(model.s["desalt_salt"], 5)

        start_session(model, "MT-K1-01")
        self.assertLess(model.u["cooling"], 60)
        self.assertGreaterEqual(model.s["k1_p"], 4.5)

    def test_every_catalog_training_has_a_valid_simulator_preset(self):
        model = Model()
        for training in CATALOG:
            start_session(model, training["id"])
            self.assertTrue(model.running, training["id"])
            self.assertEqual(model.active, set(), training["id"])


if __name__ == "__main__":
    unittest.main()
