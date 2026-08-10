/**
 * Проверка полноты мнемосхемы vs каталог PDF «01_Схема КТС».
 * Запуск: npx tsx scripts/verify-scheme-pdf.mts
 */
import { equipment } from '../src/scheme/equipment'
import { pipes } from '../src/scheme/pipes'
import {
  PDF_EQUIPMENT_TAGS,
  PDF_STREAM_LABELS,
  PDF_STREAM_TO_ID,
  pdfTagToSchemeId,
} from '../src/scheme/pdfCatalog'

const ids = new Set(equipment.map((e) => e.id))
const labels = new Set(equipment.map((e) => e.label.replace(/\n/g, ' ')))

const missingEquip: string[] = []
for (const tag of PDF_EQUIPMENT_TAGS) {
  const schemeId = pdfTagToSchemeId(tag)
  if (!ids.has(schemeId)) {
    missingEquip.push(`${tag} → ${schemeId}`)
  }
}

const missingStreams: string[] = []
for (const label of PDF_STREAM_LABELS) {
  const schemeId = PDF_STREAM_TO_ID[label]
  if (!schemeId || !ids.has(schemeId)) {
    missingStreams.push(label)
  }
}

const pipeLabels = new Set(
  pipes.map((p) => p.label).filter(Boolean) as string[],
)
const fractionPipeHints = [
  'Фр.', 'фр.', 'НК-180', 'НК-62', 'бутан', 'газ', 'факел', 'ОПУ', 'лин-339',
  'речная', 'азот', 'ингибитор', 'деэмульгатор', 'NaOH', 'пар',
]
const hasFractionPipes = fractionPipeHints.some((hint) =>
  [...pipeLabels].some((l) => l.toLowerCase().includes(hint.toLowerCase())),
)

console.log('=== Схема КТС: проверка vs PDF ===')
console.log(`Узлов оборудования: ${equipment.length}`)
console.log(`Трубопроводов: ${pipes.length}`)
console.log(`Подписей на трубах: ${pipeLabels.size}`)
console.log()

if (missingEquip.length === 0) {
  console.log('✓ Все теги оборудования PDF покрыты')
} else {
  console.log('✗ Не найдены узлы для PDF-тегов:')
  missingEquip.forEach((m) => console.log(`  - ${m}`))
}

if (missingStreams.length === 0) {
  console.log('✓ Все подписи потоков PDF покрыты')
} else {
  console.log('✗ Не найдены подписи потоков:')
  missingStreams.forEach((m) => console.log(`  - ${m}`))
}

if (hasFractionPipes) {
  console.log('✓ Подписи фракций/утилит на трубопроводах присутствуют')
} else {
  console.log('✗ Недостаточно подписей на трубопроводах')
}

const columnsWithTrays = equipment.filter(
  (e) => e.type === 'column' && e.meta?.trays,
)
console.log(`✓ Колонны с числом тарелок в meta: ${columnsWithTrays.length}`)

const failed =
  missingEquip.length > 0 ||
  missingStreams.length > 0 ||
  !hasFractionPipes

if (failed) {
  console.log('\nПроверка завершена с ошибками.')
  process.exit(1)
}
console.log('\nПроверка успешна: схема соответствует каталогу PDF.')
