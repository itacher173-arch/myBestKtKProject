# Архитектура КТК ЭЛОУ-АВТ

## Компоненты (ролевая модель)

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────┐
│ StartScreen │────▶│ TrainerContext   │◀────│ Instructor UI  │
│ Trainee UI  │     │ (сессия, API)    │     │ Reports+Audit  │
└──────┬──────┘     └────────┬─────────┘     └────────────────┘
       │                     │
       ▼                     ▼
┌─────────────┐     ┌──────────────────┐
│ Scheme SVG  │     │ processModel     │  ← цифровой двойник (упрощ.)
│ Controls    │     │ faultEngine      │
│ Emergency   │     │ scenarios        │
│ Checklist   │     │ scoring          │
└─────────────┘     │ reports/audit    │
                    └──────────────────┘
```

## Интерфейсы между модулями

| От | К | Контракт |
|---|---|---|
| UI | `TrainerContext` | `TrainerApi` (пуск, клапаны, пауза, complete…) |
| Context | `processModel` | `tickProcess(state, dt)`, `getAnalogs` |
| Context | `faultEngine` | `applyFault`, `EMERGENCY_ACTIONS` |
| Context | `scoring` | `scoreExercise` |
| Context | storage | `saveReport`, `appendAudit` |
| Scheme | equipment catalog | статичный граф узлов/труб |

## Обоснование технологий

- **React + TS** — быстрый интерактивный UI оператора, строгая типизация модели.
- **SVG мнемосхема** — лёгкая визуализация КТС без тяжёлого 3D на этапе прототипа.
- **Детерминированная оценка** — эталон шагов + исход `ProcessState` + typed penalties.
- **Electron** — поставка portable EXE на АРМ без браузерных ограничений.

## Масштабирование / модернизация

- Новый SC: запись в `scenarios` + `faultEngine` без изменения UI схемы.
- Углубление модели: замена `processModel` на внешний solver при том же `ProcessState`.
- Вынос отчётов на сервер: storage за HTTP API без пересборки мнемосхемы.
