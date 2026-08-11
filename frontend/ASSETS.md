# Локальные визуальные ресурсы

Интерфейсы КТК не загружают шрифты или изображения со сторонних сайтов.

## Корпоративная графика

- `trainer/src/assets/brand/dashboard-hero-light.jpg`
- `trainer/src/assets/brand/dashboard-hero-dark.jpg`
- `auth/src/assets/brand/login-light.jpg`
- `auth/src/assets/brand/login-dark.jpg`
- `admin/src/assets/brand/login-light.jpg`
- `admin/src/assets/brand/login-dark.jpg`
- `*/src/assets/brand/ktk-mark.svg` — локальная марка и favicon

Изображения подготовлены специально для проекта в минималистичном
промышленном стиле и оптимизированы для интерфейса. Они используют
сине-голубую палитру заказчика, но не воспроизводят официальный товарный знак.

## Шрифты и схемы

IBM Plex Sans и IBM Plex Mono подключены локально через пакеты `@fontsource`.
В production-сборку попадают только WOFF2-файлы с латинским и кириллическим
наборами. Лицензия шрифтов — SIL Open Font License 1.1.

Технологические схемы, оборудование и пиктограммы остаются локальными SVG:
они масштабируются без потери качества и не требуют тяжёлых растровых файлов.
Для трёх диаграмм базы знаний в `backend/knowledge/assets` предусмотрены
варианты `.dark.svg`, которые выбираются вместе с темой интерфейса.
