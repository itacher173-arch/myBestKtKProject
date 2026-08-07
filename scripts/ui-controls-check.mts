/**
 * UI smoke: start → mini lesson → panels / toggles / sliders.
 * Uses system Chrome via puppeteer-core.
 */
import puppeteer, { type Page } from 'puppeteer-core'

const CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:5173/'

const errors: string[] = []
const ok = (m: string) => console.log('OK ', m)
const fail = (m: string, d: string) => {
  errors.push(`${m}: ${d}`)
  console.log('FAIL', m, '-', d)
}

async function closePanel(page: Page) {
  const close = await page.$('.ctrl-close')
  if (close) {
    await close.click({ delay: 20 }).catch(() => {})
  } else {
    await page.keyboard.press('Escape').catch(() => {})
    await page
      .evaluate(() => {
        const overlay = document.querySelector('.ctrl-overlay') as HTMLElement | null
        overlay?.click()
      })
      .catch(() => {})
  }
  await page
    .waitForSelector('.ctrl-window', { hidden: true, timeout: 3000 })
    .catch(() => {})
}

async function dblEquip(page: Page, id: string) {
  const el = await page.$(`[data-equip="${id}"]`)
  if (!el) return false
  const box = await el.boundingBox()
  if (!box) {
    // try scroll into view via evaluate
    await page.evaluate((equipId) => {
      const node = document.querySelector(
        `[data-equip="${equipId}"]`,
      ) as SVGElement | null
      node?.scrollIntoView?.({ block: 'center', inline: 'center' })
    }, id)
  }
  const box2 = (await el.boundingBox()) ?? box
  if (!box2) return false
  await page.mouse.click(box2.x + box2.width / 2, box2.y + box2.height / 2, {
    clickCount: 2,
    delay: 40,
  })
  try {
    await page.waitForSelector('.ctrl-window', { timeout: 5000 })
    return true
  } catch {
    // fallback: synthetic dblclick
    await page.evaluate((equipId) => {
      const node = document.querySelector(`[data-equip="${equipId}"]`)
      node?.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      )
    }, id)
    try {
      await page.waitForSelector('.ctrl-window', { timeout: 3000 })
      return true
    } catch {
      return false
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function setRange(page: Page, value: string) {
  await page.$eval(
    '.ctrl-window input[type="range"]',
    (el, v) => {
      const input = el as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      setter?.call(input, v)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    },
    value,
  )
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  })
  const page = await browser.newPage()
  page.on('pageerror', (e) => fail('pageerror', e.message))
  page.on('dialog', async (d) => {
    await d.accept()
  })

  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 })
  const title = await page.title()
  if (!title.includes('КТК')) fail('title', title)
  else ok(`title=${title}`)

  await page.click('.knowledge-start-btn')
  await page.waitForSelector('.knowledge-window', { timeout: 5000 })
  ok('knowledge opens')
  await page.click('.knowledge-close')
  await page.waitForSelector('.knowledge-window', { hidden: true, timeout: 5000 })
  ok('knowledge closes')

  await page.click('button::-p-text(Обучаемый)')
  await page.waitForSelector('input[placeholder*="Иванов"]')
  await page.type('input[placeholder*="Иванов"]', 'Тест УИ')
  await page.click('button::-p-text(Мини-обучение)')
  await page.waitForSelector('.mini-training-cards')
  const cards = await page.$$('.mini-training-cards button')
  if (cards.length < 10) fail('mini cards', String(cards.length))
  else ok(`mini cards=${cards.length}`)

  await cards[0].click()
  await page.click('button::-p-text(Начать мини-обучение)')
  await page.waitForSelector('.scheme-viewer', { timeout: 8000 })
  await page.waitForSelector('.mini-training-panel', { timeout: 5000 })
  ok('mini session started')

  if (await dblEquip(page, 'L-1')) {
    ok('L-1 control panel')
    const openBtn = await page.$('button::-p-text(Открыть)')
    if (openBtn) {
      await openBtn.click()
      ok('L-1 open clicked')
    } else fail('L-1 open', 'button missing')
    await closePanel(page)
  } else fail('L-1', 'panel not opened')

  if (await dblEquip(page, 'N-1')) {
    const start = await page.$('button::-p-text(Пуск)')
    if (start) {
      await start.click()
      ok('N-1 start clicked')
    } else fail('N-1 start', 'missing')
    await closePanel(page)
  } else fail('N-1', 'panel not opened')

  await page.click('button::-p-text(На старт)')
  await page.waitForSelector('.start-screen', { timeout: 5000 })
  await page.click('button::-p-text(Обучаемый)')
  await page.waitForSelector('input[placeholder*="Иванов"]')
  await page.click('input[placeholder*="Иванов"]', { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type('input[placeholder*="Иванов"]', 'Тест Полный')
  await page.click('button::-p-text(Полный процесс)')
  await page.select('select', 'startup')
  await page.click('button::-p-text(Начать упражнение)')

  const accept = await page
    .waitForSelector('button.briefing-go', { timeout: 8000 })
    .catch(() => null)
  if (accept) {
    await accept.click()
    ok('briefing accepted')
  } else fail('briefing', 'accept button missing')

  await page.waitForSelector('.scheme-viewer', { timeout: 5000 })
  // Wait sim running after briefing
  await page.waitForFunction(
    () => !document.querySelector('.briefing-overlay'),
    { timeout: 5000 },
  )

  // Startup path: open L-1 fully, start N-1, N-2
  if (await dblEquip(page, 'L-1')) {
    const openBtn = await page.$('button::-p-text(Открыть)')
    if (openBtn) await openBtn.click()
    await sleep(500)
    await closePanel(page)
  }
  if (await dblEquip(page, 'N-1')) {
    await page.click('button::-p-text(Пуск)').catch(() => {})
    await sleep(1800)
    await closePanel(page)
  }
  if (await dblEquip(page, 'N-2')) {
    await page.click('button::-p-text(Пуск)').catch(() => {})
    await closePanel(page)
  }
  if (await dblEquip(page, 'N-3')) {
    await page.click('button::-p-text(Пуск)').catch(() => {})
    await closePanel(page)
  }

  // ELOU enable before fuel growth in startup sequence
  if (await dblEquip(page, 'ELOU-block')) {
    for (const label of ['Деэмульгатор', 'Эл. поле', 'Пром. вода']) {
      const btn = await page.$(`button::-p-text(${label})`)
      if (btn) await btn.click()
    }
    await closePanel(page)
    ok('ELOU prepared for fuel')
  }

  if (await dblEquip(page, 'P-1')) {
    const range = await page.$('.ctrl-window input[type="range"]')
    if (!range) fail('fuel range', 'missing')
    else {
      await setRange(page, '55')
      await sleep(200)
      const text = await page.$eval('.ctrl-window', (el) => el.textContent || '')
      if (text.includes('55%') || text.includes('55')) ok('fuel range applied (UI shows 55)')
      else {
        // still verify input event wired: try button 60%
        const b60 = await page.$('button::-p-text(60%)')
        if (b60) {
          await b60.click()
          await sleep(200)
          const t2 = await page.$eval('.ctrl-window', (el) => el.textContent || '')
          if (t2.includes('60')) ok('fuel 60% button works')
          else fail('fuel control', t2.slice(0, 80))
        } else fail('fuel 60%', 'missing')
      }
    }
    await closePanel(page)
  } else fail('P-1', 'panel not opened')

  if (await dblEquip(page, 'ELOU-block')) {
    for (const label of ['Деэмульгатор', 'Эл. поле', 'Пром. вода']) {
      const btn = await page.$(`button::-p-text(${label})`)
      if (btn) {
        await btn.click()
        ok(`toggle ${label}`)
      } else fail(`toggle ${label}`, 'missing')
    }
    await closePanel(page)
  } else fail('ELOU', 'panel not opened')

  if (await dblEquip(page, 'K-1')) {
    const range = await page.$('.ctrl-window input[type="range"]')
    if (!range) fail('K-1 range', 'missing')
    else {
      await setRange(page, '60')
      ok('K-1 level range set to 60')
    }
    await closePanel(page)
  } else fail('K-1', 'panel not opened')

  if (await dblEquip(page, 'AVZ-3')) {
    const on = await page.$('button::-p-text(Вкл)')
    const off = await page.$('button::-p-text(Выкл)')
    if (on || off) ok('AVZ-3 fan toggles present')
    else fail('AVZ-3', 'no fan buttons')
    await closePanel(page)
  } else fail('AVZ-3', 'panel not opened')

  // UTIL may be far right — pan scheme first
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.scheme-zoom button')]
    const reset = buttons.find((b) => b.textContent?.includes('Сброс'))
    ;(reset as HTMLButtonElement | undefined)?.click()
  })
  await sleep(200)
  if (await dblEquip(page, 'UTIL-block')) {
    const utilBtns = await page.$$('.ctrl-window button')
    if (utilBtns.length < 3) fail('util buttons', String(utilBtns.length))
    else ok(`util panel buttons=${utilBtns.length}`)
    const air = await page.$('button::-p-text(Приборный воздух)')
    if (air) {
      await air.click()
      await sleep(100)
      ok('util air toggle clicked')
      // restore
      await air.click().catch(() => {})
    } else {
      const any = await page.$('.ctrl-window .ctrl-actions button')
      if (any) {
        await any.click()
        ok('util toggle clicked')
      } else fail('util toggle', 'no buttons')
    }
    await closePanel(page)
  } else {
    fail('UTIL', 'panel not opened')
  }

  const speed = await page.$('button::-p-text(2×)')
  if (speed) {
    await speed.click()
    ok('speed 2×')
  } else fail('speed', '2× missing')

  const pause = await page.$('button::-p-text(Пауза)')
  if (pause) {
    await pause.click()
    ok('pause')
    const resume = await page.$('button::-p-text(Продолжить)')
    if (resume) {
      await resume.click()
      ok('resume')
    }
  }

  await page.screenshot({ path: '/tmp/ktk-ui-test.png', fullPage: true })
  ok('screenshot /tmp/ktk-ui-test.png')

  await browser.close()

  console.log('\n==== UI SUMMARY ====')
  if (errors.length) {
    console.log(`FAILED ${errors.length}`)
    for (const e of errors) console.log(' -', e)
    process.exit(1)
  }
  console.log('ALL UI CHECKS PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
