import unittest

from services.auth.security import authenticate, issue_token, verify_token


class AuthTest(unittest.TestCase):
    def test_demo_user_can_authenticate_and_verify_token(self):
        user = authenticate("trainee", "Ktk2026!")
        self.assertIsNotNone(user)
        token, expires_at = issue_token(user)
        payload = verify_token(token)
        self.assertEqual(payload["sub"], "trainee")
        self.assertEqual(payload["role"], "trainee")
        self.assertGreater(expires_at, 0)

    def test_wrong_password_is_rejected(self):
        self.assertIsNone(authenticate("trainee", "wrong"))


if __name__ == "__main__":
    unittest.main()
