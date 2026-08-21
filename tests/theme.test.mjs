// SHASN — the design system holds together.
//
// Two things can quietly rot here and neither shows up as a crash:
//
//   1. A component references `var(--something)` that :root never declares. The
//      browser silently falls back to nothing and you get a transparent panel or
//      black text on black.
//   2. The board draws with literal hexes (RAW in lib/ui/theme.js) because SVG
//      filters cannot resolve var(), so those literals have to stay in step with
//      :root by hand. Nothing enforces that but this test.
//
// Run with:  node tests/theme.test.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRunner, eq, ok } from './harness.mjs'

const { check, report } = createRunner()

const css = readFileSync('styles/globals.css', 'utf8')
const root = css.match(/:root \{([\s\S]*?)\n\}/)[1]
const RAW_TOKENS = Object.fromEntries(
  [...root.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map(([, k, v]) => [k, v.trim()])
)

/**
 * Role tokens now alias the palette — `--surface: var(--ivory)` — so comparing
 * a declared value against a literal has to follow the chain first. Bounded, so
 * a token that accidentally refers to itself fails loudly rather than hanging.
 */
function resolve(value, depth = 0) {
  const alias = /^var\((--[a-z0-9-]+)\)$/.exec(String(value).trim())
  if (!alias || depth > 8) return value
  return resolve(RAW_TOKENS[alias[1]], depth + 1)
}

const TOKENS = Object.fromEntries(
  Object.entries(RAW_TOKENS).map(([k, v]) => [k, resolve(v)])
)

/** Custom properties set inline by JS on the element itself. */
const SET_INLINE = new Set(['--gx', '--gy', '--shasn-file-x'])

function sourceFiles() {
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.js') && !p.includes('prototype')) out.push(p)
    }
  }
  walk('components')
  walk('pages')
  walk('lib/ui')
  return out
}

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ---------------------------------------------------------------------------

check('every token a component asks for is actually declared', () => {
  const missing = []
  for (const f of sourceFiles()) {
    const src = stripComments(readFileSync(f, 'utf8'))
    for (const [, name] of src.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (!TOKENS[name] && !SET_INLINE.has(name)) missing.push(`${name} in ${f}`)
    }
  }
  eq(missing, [], 'undeclared tokens:')
})

check('the stylesheet only uses tokens it declares', () => {
  const body = css.slice(css.indexOf('\n}', css.indexOf(':root')))
  const missing = [...body.matchAll(/var\((--[a-z0-9-]+)/g)]
    .map(([, n]) => n)
    .filter((n) => !TOKENS[n] && !SET_INLINE.has(n))
  eq([...new Set(missing)], [], 'undeclared tokens in globals.css:')
})

check('the board’s literal palette matches the tokens', () => {
  const theme = readFileSync('lib/ui/theme.js', 'utf8')
  const raw = theme.match(/export const RAW = \{([\s\S]*?)\n\}/)[1]

  const literals = Object.fromEntries(
    [...raw.matchAll(/^\s*([a-zA-Z0-9]+):\s*'(#[0-9a-fA-F]{6})'/gm)].map(([, k, v]) => [
      k,
      v.toLowerCase(),
    ])
  )
  const players = [...raw.matchAll(/'(#[0-9a-fA-F]{6})'/g)]
    .map(([, v]) => v.toLowerCase())
    .slice(0, 6)

  // RAW.p must be exactly --p0 … --p5.
  for (let i = 0; i < 6; i++) {
    eq(players[i], TOKENS[`--p${i}`].toLowerCase(), `RAW.p[${i}] vs --p${i}:`)
  }

  const pairs = {
    ink: '--ink',
    ink2: '--ink-2',
    ink3: '--ink-3',
    surface: '--surface',
    boardBg: '--board-bg',
    zone: '--zone',
    zone2: '--zone-2',
    zone3: '--zone-3',
    zoneLine: '--zone-line',
    pip: '--pip',
    pipLine: '--pip-line',
    danger: '--danger',
    accent: '--accent',
  }
  for (const [key, token] of Object.entries(pairs)) {
    ok(literals[key], `RAW.${key} is missing`)
    eq(literals[key], TOKENS[token].toLowerCase(), `RAW.${key} vs ${token}:`)
  }
})

check('no shasn-* class is used without a rule to back it', () => {
  const defined = new Set([...css.matchAll(/\.(shasn-[a-z-]+)/g)].map(([, c]) => c))
  const used = new Set()
  for (const f of sourceFiles()) {
    const src = readFileSync(f, 'utf8').replace(/['"`]shasn-mat[^'"`]*/g, '')
    for (const [, attr] of src.matchAll(/className=\{?[`'"]([^`'"]*)/g)) {
      for (const [, c] of attr.matchAll(/(shasn-[a-z-]+)/g)) used.add(c)
    }
  }
  eq([...used].filter((c) => !defined.has(c)), [], 'classes with no rule:')
})

check('no keyframe name is defined twice', () => {
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(([, n]) => n)
  const dupes = [...new Set(names.filter((n) => names.filter((m) => m === n).length > 1))]
  eq(dupes, [], 'duplicated keyframes:')
})

check('motion is disabled for people who ask for that', () => {
  ok(css.includes('prefers-reduced-motion'), 'the guard exists')
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion'))
  ok(block.includes('animation-duration'), 'animations are neutralised')
  ok(block.includes('transition-duration'), 'transitions are neutralised')
})

check('the four resource colours are distinct and legible', () => {
  const constants = readFileSync('lib/shasn/constants.js', 'utf8')
  const block = constants.match(/export const RESOURCES = \{([\s\S]*?)\n\}/)[1]
  const colors = [...block.matchAll(/color: '(#[0-9a-f]{6})'/g)].map(([, c]) => c)
  eq(colors.length, 4, 'four resources:')
  eq(new Set(colors).size, 4, 'all different:')

  // Every one carries an explicit text colour, so no label is white on yellow.
  eq([...block.matchAll(/ink: '(#[0-9a-f]{6})'/g)].length, 4, 'each declares its ink:')
})

check('no player colour collides with a resource colour', () => {
  // These two families are BOTH drawn as flat coloured discs — a voter on the
  // board and a token on your mat. When I first retuned the palette they shared
  // hues outright (player 1 and Street Clout were byte-identical), which made a
  // red disc genuinely ambiguous. They have to stay apart.
  const constants = readFileSync('lib/shasn/constants.js', 'utf8')
  const block = constants.match(/export const RESOURCES = \{([\s\S]*?)\n\}/)[1]
  const resources = [...block.matchAll(/color: '(#[0-9a-f]{6})'/g)].map(([, c]) => c)
  const players = [0, 1, 2, 3, 4].map((i) => TOKENS[`--p${i}`].toLowerCase())

  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  // Rough perceptual distance, weighted the way the eye actually works.
  const distance = (a, b) => {
    const [r1, g1, b1] = rgb(a)
    const [r2, g2, b2] = rgb(b)
    return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2)
  }

  const tooClose = []
  for (const p of players) {
    for (const r of resources) {
      const d = distance(p, r)
      if (d < 120) tooClose.push(`${p} (player) vs ${r} (resource) — distance ${Math.round(d)}`)
    }
  }
  eq(tooClose, [], 'colliding colours:')
})

check('the five parties each have an emblem and a distinct colour', () => {
  const src = readFileSync('lib/shasn/parties.js', 'utf8')
  const ids = [...src.matchAll(/id: '(\w+)'/g)].map(([, id]) => id)
  eq(ids.length, 5, 'one party per printed mat:')
  eq(new Set(ids).size, 5, 'all distinct:')

  // Every one must actually be drawable, or a seat renders blank.
  const emblem = readFileSync('components/PartyEmblem.js', 'utf8')
  for (const id of ids) {
    ok(emblem.includes(`case '${id}'`) || id === 'banyan', `${id} has a shape`)
  }
})

check('each Ideologue is coloured as the resource it pays', () => {
  const constants = readFileSync('lib/shasn/constants.js', 'utf8')
  const resources = Object.fromEntries(
    [...constants.matchAll(/^\s{2}(\w+): \{ id: '\w+'.*?color: '(#[0-9a-f]{6})'/gm)].map(
      ([, k, v]) => [k, v]
    )
  )
  const ideologues = [
    ...constants.matchAll(/resource: '(\w+)',\n\s*color: '(#[0-9a-f]{6})'/g),
  ]
  eq(ideologues.length, 4, 'four Ideologues:')
  for (const [, resource, color] of ideologues) {
    eq(color, resources[resource], `${resource} Ideologue vs its resource:`)
  }
})

check('text on the lacquer ground is actually readable', () => {
  // Half the app now sits on a dark lacquered table. The old --ink tokens are
  // near-black and were fine on ivory; on lacquer they are invisible. This is
  // the failure most likely to creep back in, because it looks fine in the code.
  const lum = (hex) => {
    const c = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const contrast = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  const ground = TOKENS['--lacquer']
  // 4.5 is the WCAG bar for body text; the tertiary tone is for hints and
  // metadata, which is held to the large-text bar of 3.
  const pairs = [
    ['--ink-on-dark', 4.5],
    ['--ink-on-dark-2', 4.5],
    ['--ink-on-dark-3', 3],
    ['--brass', 3],
    ['--ivory', 4.5],
  ]
  const failures = []
  for (const [token, floor] of pairs) {
    const ratio = contrast(TOKENS[token], ground)
    if (ratio < floor) failures.push(`${token} on the lacquer: ${ratio.toFixed(1)}:1, wants ${floor}`)
  }
  eq(failures, [], 'unreadable on the dark ground:')
})

check('text on ivory is readable too', () => {
  const lum = (hex) => {
    const c = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const contrast = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  const paper = TOKENS['--ivory']
  const failures = []
  for (const [token, floor] of [['--ink', 4.5], ['--ink-2', 4.5], ['--ink-3', 3]]) {
    const ratio = contrast(TOKENS[token], paper)
    if (ratio < floor) failures.push(`${token} on ivory: ${ratio.toFixed(1)}:1, wants ${floor}`)
  }
  eq(failures, [], 'unreadable on the card stock:')
})

check('the ornament is drawn, not fetched', () => {
  // The whole approach rests on there being no image files: it is what lets a
  // zone recolour to its holder and keeps everything sharp at any size. A stray
  // url() to an image would quietly break both.
  const offenders = []
  for (const f of sourceFiles().concat(['styles/globals.css'])) {
    const src = readFileSync(f, 'utf8')
    for (const [, url] of src.matchAll(/url\(\s*['"]?([^)'"]+)['"]?\s*\)/g)) {
      if (/\.(png|jpe?g|gif|webp|svg|avif)\b/i.test(url)) offenders.push(`${f} loads ${url}`)
    }
  }
  eq(offenders, [], 'image files being loaded:')

  // And the ornament library really does hold the patterns.
  const art = readFileSync('components/art/ArtDefs.js', 'utf8')
  for (const id of ['art-jali', 'art-block', 'art-rangoli', 'art-brass', 'art-lacquer']) {
    ok(art.includes(`id="${id}"`), `${id} is defined`)
  }
})

report('Design system')
