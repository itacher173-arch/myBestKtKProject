/**
 * Экспорт мнемосхемы в SVG (+ PNG через qlmanage при наличии).
 * Запуск: npx tsx scripts/export-scheme-snapshot.mts
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { equipment, pipes, VIEWBOX } from '../src/scheme'
import {
  arrowHeadPoints,
  orientedPipePoints,
  pipeLabelPos,
} from '../src/scheme/pipeGeometry'

const PIPE_COLORS: Record<string, string> = {
  oil: '#c48a3a',
  product: '#4aa3c9',
  steam: '#b8c4ce',
  utility: '#7a8f7a',
}

const TYPE_FILL: Record<string, string> = {
  column: '#3d5a73',
  pump: '#5a7a4a',
  furnace: '#8a5a3a',
  heatExchanger: '#4a6a7a',
  vessel: '#5a6a7a',
  desalter: '#4a5a6a',
  group: '#2a3540',
  label: 'transparent',
  valve: '#6a5a4a',
  signal: '#3a4a5a',
}

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const parts: string[] = []
parts.push(
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWBOX.width}" height="${VIEWBOX.height}" viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}">`,
  `<rect width="100%" height="100%" fill="#1a2229"/>`,
)

// pipes under nodes
for (const pipe of pipes) {
  const points = orientedPipePoints(pipe)
  const arrow = arrowHeadPoints(points)
  const drawPts = arrow?.line ?? points
  const d = drawPts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`)
    .join(' ')
  const color = PIPE_COLORS[pipe.kind] ?? '#888'
  parts.push(
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${pipe.kind === 'steam' ? 1.5 : 2.5}" opacity="0.9"/>`,
  )
}

// nodes
for (const node of equipment) {
  if (node.id.startsWith('zone-')) continue
  const fill = TYPE_FILL[node.type] ?? '#444'
  const stroke = node.type === 'label' ? 'none' : '#8aa'
  if (node.type !== 'label') {
    parts.push(
      `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1" opacity="0.92"/>`,
    )
  }
  const label = node.label.replace(/\n/g, ' ')
  const fs = node.type === 'label' ? 11 : node.type === 'group' ? 12 : 10
  parts.push(
    `<text x="${node.x + node.w / 2}" y="${node.y + node.h / 2}" text-anchor="middle" dominant-baseline="middle" fill="#e8eef4" font-size="${fs}" font-family="IBM Plex Sans,Segoe UI,sans-serif">${esc(label)}</text>`,
  )
}

// arrows above
for (const pipe of pipes) {
  const points = orientedPipePoints(pipe)
  const arrow = arrowHeadPoints(points)
  if (!arrow) continue
  const color = PIPE_COLORS[pipe.kind] ?? '#888'
  parts.push(`<polygon points="${arrow.tip}" fill="${color}"/>`)
}

// labels
for (const pipe of pipes) {
  if (!pipe.label) continue
  const points = orientedPipePoints(pipe)
  const pos = pipeLabelPos(points)
  if (!pos) continue
  const color = PIPE_COLORS[pipe.kind] ?? '#888'
  parts.push(
    `<text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-size="10" font-family="IBM Plex Sans,Segoe UI,sans-serif">${esc(pipe.label)}</text>`,
  )
}

parts.push(`</svg>`)

const outDir = join(process.cwd(), 'scripts', 'snapshots')
mkdirSync(outDir, { recursive: true })
const svgPath = join(outDir, 'scheme-full.svg')
writeFileSync(svgPath, parts.join('\n'), 'utf8')
console.log('SVG:', svgPath, 'pipes=', pipes.length, 'equip=', equipment.length)

// PNG via qlmanage (macOS)
try {
  execSync(`qlmanage -t -s 3400 -o "${outDir}" "${svgPath}"`, {
    stdio: 'pipe',
  })
  const qlPng = join(outDir, 'scheme-full.svg.png')
  const pngPath = join(outDir, 'scheme-full.png')
  if (existsSync(qlPng)) {
    execSync(`mv "${qlPng}" "${pngPath}"`)
    console.log('PNG:', pngPath)
  } else {
    console.log('qlmanage did not produce PNG')
  }
} catch (e) {
  console.log('PNG export skipped:', (e as Error).message)
}
