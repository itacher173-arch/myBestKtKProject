/**
 * Каталог приоритетных сценариев из
 * docs/Отчет_по_требованиям_и_спецификации.docx (§8).
 */

export type ScenarioPriority = 'critical' | 'high'
export type ScenarioStatus = 'playable' | 'planned'

export interface SpecScenario {
  specId: string
  event: string
  priority: ScenarioPriority
  modelEffects: string
  learningGoal: string
  status: ScenarioStatus
  exerciseId?: string
}

export const SPEC_SCENARIOS: SpecScenario[] = [
  {
    specId: 'SC-01',
    event: 'Потеря подачи сырья / отказ сырьевого насоса',
    priority: 'critical',
    modelEffects: 'Падение уровней; риск перегрева змеевиков.',
    learningGoal: 'Стабилизировать / безопасно перевести установку.',
    status: 'playable',
    exerciseId: 'pumpTrip',
  },
  {
    specId: 'SC-02',
    event: 'Потеря технологического пара',
    priority: 'critical',
    modelEffects: 'Погасание горелок, риск накопления топлива.',
    learningGoal: 'Исключить топливо, безопасный останов.',
    status: 'playable',
    exerciseId: 'sc02-steam',
  },
  {
    specId: 'SC-03',
    event: 'Потеря электропитания 0,4/6 кВ',
    priority: 'critical',
    modelEffects: 'Останов насосов, АВО, вентиляции.',
    learningGoal: 'Приоритетный безопасный останов.',
    status: 'playable',
    exerciseId: 'sc03-power',
  },
  {
    specId: 'SC-04',
    event: 'Потеря питания операторной',
    priority: 'high',
    modelEffects: 'Резерв/АКБ ~0,5 ч.',
    learningGoal: 'Подтвердить резерв, безопасный перевод.',
    status: 'playable',
    exerciseId: 'sc04-ops-power',
  },
  {
    specId: 'SC-05',
    event: 'Потеря оборотной воды',
    priority: 'critical',
    modelEffects: 'Рост T/P, перегрев оборудования.',
    learningGoal: 'Снизить нагрузку, останов контуров.',
    status: 'playable',
    exerciseId: 'sc05-cooling',
  },
  {
    specId: 'SC-06',
    event: 'Потеря приборного воздуха',
    priority: 'critical',
    modelEffects: 'Fail-safe клапанов, резерв А-6.',
    learningGoal: 'Безопасный останов за запас времени.',
    status: 'playable',
    exerciseId: 'sc06-air',
  },
  {
    specId: 'SC-07',
    event: 'Разрыв змеевика печи П-1…П-4',
    priority: 'critical',
    modelEffects: 'Выброс / пожар в печи.',
    learningGoal: 'Немедленный ESD печи.',
    status: 'playable',
    exerciseId: 'sc07-coil',
  },
  {
    specId: 'SC-08',
    event: 'Разгерметизация насоса/фланца',
    priority: 'critical',
    modelEffects: 'Лужа/облако УВ.',
    learningGoal: 'Останов насоса, локализация.',
    status: 'playable',
    exerciseId: 'sc08-leak',
  },
  {
    specId: 'SC-09',
    event: 'Потеря вентиляции операторной/РУ',
    priority: 'critical',
    modelEffects: 'Накопление взрывоопасной смеси.',
    learningGoal: 'Газоанализ, эвакуация/останов.',
    status: 'playable',
    exerciseId: 'sc09-vent-ops',
  },
  {
    specId: 'SC-10',
    event: 'Потеря вентиляции насосных ЭЛОУ',
    priority: 'critical',
    modelEffects: 'Газонакопление в помещении.',
    learningGoal: 'Ограничить доступ, проветривание.',
    status: 'playable',
    exerciseId: 'sc10-vent-elou',
  },
  {
    specId: 'SC-11',
    event: 'Высокий уровень воды E-1/E-2',
    priority: 'critical',
    modelEffects: 'Занос воды в K-1/K-2, скачок P.',
    learningGoal: 'Сдренировать воду, скорректировать потоки.',
    status: 'playable',
    exerciseId: 'sc11-water',
  },
  {
    specId: 'SC-12',
    event: 'Низкий уровень K-1 / K-9 / K-10',
    priority: 'critical',
    modelEffects: 'Срыв насосов, риск прогара змеевиков.',
    learningGoal: 'Разгрузить печь, сохранить уровень.',
    status: 'playable',
    exerciseId: 'sc12-low-k1',
  },
  {
    specId: 'SC-13',
    event: 'Низкий уровень УВ в рефлюксных ёмкостях',
    priority: 'high',
    modelEffects: 'Срыв рефлюксных насосов, рост T верха.',
    learningGoal: 'Восстановить рефлюкс, снизить нагрузку.',
    status: 'playable',
    exerciseId: 'sc13-reflux',
  },
  {
    specId: 'SC-14',
    event: 'Нарушение последовательности пуска и ускоренный прогрев',
    priority: 'high',
    modelEffects: 'Неравномерный нагрев, риск разгерметизации.',
    learningGoal: 'Соблюдать шаги пуска и выдержки; недопустимые переходы блокируются.',
    status: 'playable',
    exerciseId: 'startup',
  },
  {
    specId: 'SC-STOP',
    event: 'Плановый останов установки',
    priority: 'high',
    modelEffects: 'Снятие нагрузки в штатном порядке.',
    learningGoal: 'Топливо → печные насосы → продукт → сырьё → ЭЛОУ.',
    status: 'playable',
    exerciseId: 'shutdown',
  },
  {
    specId: 'SC-15',
    event: 'Потеря водородсодержащего газа',
    priority: 'high',
    modelEffects: 'Коксование K-12, рост давления.',
    learningGoal: 'Снизить T/нагрузку, перевод блока.',
    status: 'playable',
    exerciseId: 'sc15-h2',
  },
]

export function getSpecByExerciseId(
  exerciseId: string | null,
): SpecScenario | undefined {
  if (!exerciseId) return undefined
  return SPEC_SCENARIOS.find((s) => s.exerciseId === exerciseId)
}
