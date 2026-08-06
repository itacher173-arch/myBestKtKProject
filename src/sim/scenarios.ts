import type { Exercise } from './types'

const startUpSequence = (): string[] => [
  "Электрозадвижка 'Л-1 (вход сырья)' нажата кнопка 'Открыть'",
  "Насос 'Н-1': нажата кнопка 'Пуск'",
  "ЭЛОУ 'Э-1..Э-6': подача деэмульгатора включена",
  "ЭЛОУ 'Э-1..Э-6': электрическое поле включено",
  "Электрозадвижка 'Л-2 (вывод бензина НК-180°С)' нажата кнопка 'Открыть'",
  "Электрозадвижка 'Л-3 (вывод товарного мазута)' нажата кнопка 'Открыть'",
]

export const exercises: Exercise[] = [
  {
    id: 'startup',
    name: 'Пуск установки (штатный режим)',
    description: 'Обучаемый выполняет пуск установки ЭЛОУ-АВТ без осложнений.',
    triggerDelaySeconds: 0,
    scenarioSteps: startUpSequence(),
    faultType: null,
  },
  {
    id: 'demulsifier',
    name: 'Нештатная ситуация: отказ подачи деэмульгатора на ЭЛОУ',
    description:
      'Через некоторое время после пуска отказывает насос-дозатор деэмульгатора. Растёт содержание солей на выходе ЭЛОУ (регламент п. 5.1; опасности — п. 7.4/7.7). Нужно обнаружить рост солей и вновь включить подачу деэмульгатора.',
    triggerDelaySeconds: 25,
    normResponseSeconds: 60,
    scenarioSteps: [...startUpSequence(), "ЭЛОУ 'Э-1..Э-6': подача деэмульгатора включена"],
    expectedResponseActions: ["ЭЛОУ 'Э-1..Э-6': подача деэмульгатора включена"],
    faultType: 'demulsifier',
  },
  {
    id: 'fuelGas',
    name: 'Нештатная ситуация: прекращение подачи топливного газа к печи',
    description:
      'Падает давление в топливной сети, температура на выходе печей начинает падать (регламент п. 7.4). Нужно восстановить подачу топливного газа (≥40%).',
    triggerDelaySeconds: 25,
    normResponseSeconds: 45,
    scenarioSteps: [
      ...startUpSequence(),
      "Печь 'П-1': Изменена подача топливного газа на 60%",
    ],
    faultType: 'fuelGas',
  },
  {
    id: 'pumpTrip',
    name: 'Нештатная ситуация: аварийная остановка насоса Н-1',
    description:
      'Срабатывает защита электродвигателя Н-1, падает давление на выкиде (PRA351). Нужно обнаружить остановку и повторно пустить насос.',
    triggerDelaySeconds: 20,
    normResponseSeconds: 40,
    scenarioSteps: [...startUpSequence(), "Насос 'Н-1': нажата кнопка 'Пуск'"],
    expectedResponseActions: ["Насос 'Н-1': нажата кнопка 'Пуск'"],
    faultType: 'pumpTrip',
  },
]

export function getExercise(id: string | null): Exercise | undefined {
  return exercises.find((e) => e.id === id)
}
