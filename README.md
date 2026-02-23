# Voice Notes PWA

## Local run

```bash
npm ci
npm run dev
```

## GitHub Pages auto-deploy

Репозиторий уже настроен на автодеплой через GitHub Actions (`.github/workflows/deploy.yml`).

Что нужно включить в GitHub:

1. `Settings` -> `Pages`
2. В `Build and deployment` выбрать `Source: GitHub Actions`
3. Пушить в ветку `main` (или запустить workflow вручную через `workflow_dispatch`)

После push в `main` приложение будет собираться и публиковаться на GitHub Pages автоматически.
