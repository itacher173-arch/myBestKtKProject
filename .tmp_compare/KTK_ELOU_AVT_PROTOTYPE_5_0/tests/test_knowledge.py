import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from services.knowledge import app


class KnowledgeBaseTest(unittest.TestCase):
    def test_database_context_always_closes_file_handle(self):
        connection = MagicMock()
        with patch.object(app, "connect", return_value=connection):
            with app.open_database() as opened:
                self.assertIs(opened, connection)
        connection.commit.assert_called_once_with()
        connection.close.assert_called_once_with()

    def test_seed_initializes_and_searches_sqlite(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            with patch.object(app, "DATA_DIR", data_dir), patch.object(
                app, "DB_PATH", data_dir / "knowledge.db"
            ):
                app.initialize()
                results = app.list_articles("деэмульгатор")
                self.assertTrue(any(item["id"] == "elou-principle" for item in results))
                self.assertGreaterEqual(len(app.list_articles()), 20)


if __name__ == "__main__":
    unittest.main()
