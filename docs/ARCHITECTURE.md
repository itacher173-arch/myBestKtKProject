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
│ AiCoach     │     │ aiCoach          │  ← ИИ-модуль
└─────────────┘     │ reports/audit    │
                    └──────────────────┘
```

## Интерфейсы между модулями

| От | К | Контракт |
|---|---|---|
| UI | `TrainerContext` | `TrainerApi` (пуск, клапаны, пауза, complete…) |
| Context | `processModel` | `tickProcess(state, dt)`, `getAnalogs` |
| Context | `faultEngine` | `applyFault`, `EMERGENCY_ACTIONS` |
| Context | `aiCoach` | `predictRisk`, `analyzeAction`, `recommendRetrain` |
| Context | storage | `saveReport`, `appendAudit` |
| Scheme | equipment catalog | статичный граф узлов/труб |

## Обоснование технологий

- **React + TS** — быстрый интерактивный UI оператора, строгая типизация модели.
- **SVG мнемосхема** — лёгкая визуализация КТС без тяжёлого 3D на этапе прототипа.
- **Эвристический ИИ-модуль** — интерпретируемость для инструктора (требование «почему неверно»), без зависимости от внешнего GPU; архитектура допускает замену на ML-сервис.
- **Electron** — поставка portable EXE на АРМ без браузерных ограничений.

## Масштабирование / модернизация

- Новый SC: запись в `scenarios` + `faultEngine` без изменения UI схемы.
- Углубление модели: замена `processModel` на внешний solver при том же `ProcessState`.
- Вынос отчётов/ИИ на сервер: storage и `aiCoach` за HTTP API без пересборки мнемосхемы.
