# Загрузка данных в myBestKtKProject

## Рекомендуемый вариант

1. Распакуйте пакет в отдельную папку.
2. Откройте PowerShell.
3. Запустите импорт:

```powershell
powershell -ExecutionPolicy Bypass -File .\IMPORT_TO_REPO.ps1 -RepoPath "C:\Projects\myBestKtKProject"
```

4. Проверьте изменения:

```powershell
cd C:\Projects\myBestKtKProject
git status
python .\scripts\data\validate_data.py
```

5. Создайте отдельную ветку и опубликуйте:

```powershell
git switch -c feat/structured-project-data
git add data docs scripts/data
git commit -m "feat(data): add structured ELOU-AVT knowledge layer"
git push -u origin feat/structured-project-data
gh pr create --fill
```

Перед публикацией выполните [чек-лист безопасности](SECURITY_PUBLICATION_CHECKLIST.md).
