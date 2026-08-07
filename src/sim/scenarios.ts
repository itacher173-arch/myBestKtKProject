import type { FaultType } from './faultEngine'
import { EMERGENCY_ACTIONS } from './faultEngine'
import type { Exercise } from './types'
import { SPEC_SCENARIOS } from './scenarioCatalog'

const startUpSequence = (): string[] => [
  "Электрозадвижка 'Л-1 (вход сырья)' нажата кнопка 'Открыть'",
  "Насос 'Н-1': нажата кнопка 'Пуск'",
  "ЭЛОУ 'Э-1..Э-6': подача деэмульгатора включена",
  "ЭЛОУ 'Э-1..Э-6': электрическое поле включено",
  "ЭЛОУ 'Э-1..Э-6': промывная вода включена",
  "Насос 'Н-2': нажата кнопка 'Пуск'",
  "Электрозадвижка 'Л-2 (вывод бензина НК-180°С)' нажата кнопка 'Открыть'",
  "Электрозадвижка 'Л-3 (вывод товарного мазута)' нажата кнопка 'Открыть'",
]

function emergencyLog(fault: FaultType): string {
  const a = EMERGENCY_ACTIONS.find((x) => x.clearsFaults.includes(fault))
  return a?.logDescription ?? `Авария: реакция на ${fault}`
}

function scExercise(opts: {
  id: string
  specId: string
  name: string
  description: string
  faultType: FaultType
  delay?: number
  norm?: number
  extraSteps?: string[]
}): Exercise {
  const response = emergencyLog(opts.faultType)
  return {
    id: opts.id,
    specId: opts.specId,
    name: opts.name,
    description: opts.description,
    triggerDelaySeconds: opts.delay ?? 22,
    normResponseSeconds: opts.norm ?? 60,
    warmStart: true,
    faultType: opts.faultType,
    scenarioSteps: [
      ...startUpSequence(),
      ...(opts.extraSteps ?? []),
      response,
    ],
    expectedResponseActions: [response],
  }
}

export const exercises: Exercise[] = [
  {
    id: 'startup',
    specId: 'SC-14',
    name: 'SC-14 · Пуск установки (штатный режим)',
    description:
      'Пуск ЭЛОУ-АВТ без осложнений (SC-14). Соблюдайте последовательность шагов.',
    triggerDelaySeconds: 0,
    scenarioSteps: startUpSequence(),
    faultType: null,
    warmStart: false,
  },
  {
    id: 'demulsifier',
    specId: 'MVP-ELOU-01',
    name: 'MVP-ELOU-01 · Отказ деэмульгатора',
    description:
      'Отказ дозатора деэмульгатора, рост солей (>5 мг/л). Включите подачу деэмульгатора.',
    triggerDelaySeconds: 25,
    normResponseSeconds: 60,
    warmStart: true,
    scenarioSteps: [
      ...startUpSequence(),
      "ЭЛОУ 'Э-1..Э-6': подача деэмульгатора включена",
    ],
    expectedResponseActions: [
      "ЭЛОУ 'Э-1..Э-6': подача деэмульгатора включена",
    ],
    faultType: 'demulsifier',
  },
  {
    id: 'fuelGas',
    specId: 'MVP-FURN-01',
    name: 'MVP-FURN-01 · Потеря топливного газа П-1…П-3',
    description:
      'Падение топлива к печам; восстановите подачу ≥40% (смежно SC-02).',
    triggerDelaySeconds: 25,
    normResponseSeconds: 45,
    warmStart: true,
    scenarioSteps: [
      ...startUpSequence(),
      "Печь 'П-1': Изменена подача топливного газа на 60%",
    ],
    faultType: 'fuelGas',
  },
  {
    id: 'pumpTrip',
    specId: 'SC-01',
    name: 'SC-01 · Отказ сырьевого насоса Н-1',
    description:
      'Аварийный останов Н-1, падение PRA351. Повторно пустите насос.',
    triggerDelaySeconds: 20,
    normResponseSeconds: 40,
    warmStart: true,
    scenarioSteps: [
      ...startUpSequence(),
      "Насос 'Н-1': нажата кнопка 'Пуск'",
    ],
    expectedResponseActions: ["Насос 'Н-1': нажата кнопка 'Пуск'"],
    faultType: 'pumpTrip',
  },
  scExercise({
    id: 'sc02-steam',
    specId: 'SC-02',
    name: 'SC-02 · Потеря технологического пара',
    description:
      'Горелки погасли. Исключите подачу топлива и инициируйте безопасный останов (панель аварийных действий).',
    faultType: 'steamLoss',
    norm: 45,
  }),
  scExercise({
    id: 'sc03-power',
    specId: 'SC-03',
    name: 'SC-03 · Потеря электропитания 0,4/6 кВ',
    description:
      'Останов насосов и вспомогательных. Выполните приоритетный безопасный останов.',
    faultType: 'powerLoss',
    norm: 50,
  }),
  scExercise({
    id: 'sc04-ops-power',
    specId: 'SC-04',
    name: 'SC-04 · Потеря питания операторной',
    description:
      'Переход на АКБ (~0,5 ч). Подтвердите резерв и организуйте безопасный перевод.',
    faultType: 'opsPowerLoss',
    norm: 60,
  }),
  scExercise({
    id: 'sc05-cooling',
    specId: 'SC-05',
    name: 'SC-05 · Потеря оборотной воды',
    description:
      'Рост T/P в контурах. Снизьте тепловую нагрузку и подготовьте останов.',
    faultType: 'coolingWaterLoss',
    norm: 50,
  }),
  scExercise({
    id: 'sc06-air',
    specId: 'SC-06',
    name: 'SC-06 · Потеря приборного воздуха',
    description:
      'Клапаны в fail-safe. Используйте запас времени для безопасного останова.',
    faultType: 'airLoss',
    norm: 45,
  }),
  scExercise({
    id: 'sc07-coil',
    specId: 'SC-07',
    name: 'SC-07 · Разрыв змеевика печи',
    description:
      'Пожар/выброс в топке. Немедленный ESD: отсечение, прекращение нагрева, оповещение.',
    faultType: 'coilRupture',
    delay: 18,
    norm: 30,
  }),
  scExercise({
    id: 'sc08-leak',
    specId: 'SC-08',
    name: 'SC-08 · Разгерметизация насоса/фланца',
    description:
      'Утечка УВ. Остановите Н-1, локализуйте источник, исключите зажигание.',
    faultType: 'pumpLeak',
    norm: 40,
  }),
  scExercise({
    id: 'sc09-vent-ops',
    specId: 'SC-09',
    name: 'SC-09 · Потеря вентиляции операторной/РУ',
    description:
      'Риск газонакопления. Газоанализ, ограничение пребывания, действия по эвакуации/останову.',
    faultType: 'ventOpsLoss',
    norm: 50,
  }),
  scExercise({
    id: 'sc10-vent-elou',
    specId: 'SC-10',
    name: 'SC-10 · Потеря вентиляции насосных ЭЛОУ',
    description:
      'Газонакопление в помещении ЭЛОУ. Ограничьте доступ, организуйте проветривание/контроль.',
    faultType: 'ventElouLoss',
    norm: 50,
  }),
  scExercise({
    id: 'sc11-water',
    specId: 'SC-11',
    name: 'SC-11 · Высокий уровень воды E-1/E-2',
    description:
      'Риск заноса воды в колонны и скачка давления. Сдренируйте воду E-1/E-2.',
    faultType: 'highWaterE12',
    norm: 40,
  }),
  scExercise({
    id: 'sc12-low-k1',
    specId: 'SC-12',
    name: 'SC-12 · Низкий уровень K-1',
    description:
      'Риск срыва насосов и прогара змеевиков. Разгрузите печь и сохраните уровень.',
    faultType: 'lowLevelK1',
    norm: 40,
  }),
  scExercise({
    id: 'sc13-reflux',
    specId: 'SC-13',
    name: 'SC-13 · Низкий уровень рефлюксных ёмкостей',
    description:
      'Риск срыва рефлюксных насосов. Восстановите рефлюкс и снизьте нагрузку.',
    faultType: 'lowReflux',
    norm: 50,
  }),
  scExercise({
    id: 'sc15-h2',
    specId: 'SC-15',
    name: 'SC-15 · Потеря водородсодержащего газа',
    description:
      'Блок K-12: риск коксования. Снизьте T/нагрузку и выполните перевод блока.',
    faultType: 'h2Loss',
    norm: 55,
  }),
]

export function getExercise(id: string | null): Exercise | undefined {
  return exercises.find((e) => e.id === id)
}

export function getPlayableSpecCount() {
  return SPEC_SCENARIOS.filter((s) => s.status === 'playable').length
}
