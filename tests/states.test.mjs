// SHASN — the state vocabulary and the notice stack.
//
// Before this there were twelve different opacity values across the components,
// all meaning roughly "you cannot have this", with nothing distinguishing "not
// allowed" from "not relevant right now" from "already used".
//
// And feedback was one red line inside a panel near the bottom of the page,
// cleared only by making a server call — so a client-side complaint about a
// misclick stayed on screen after you had already corrected it.
//
// Run with:  node tests/states.test.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { states as S, announcer as A, createRunner, eq, ok } from './harness.mjs'

const { check, report } = createRunner()

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

check('there are six states and each is distinguishable', () => {
  const names = Object.keys(S.STATE)
  eq(names.length, 6, 'six states:')
  const opacities = names.map((n) => S.STATE[n].opacity ?? 1)
  ok(new Set(opacities).size >= 4, `they do not all look alike: ${opacities}`)
})

check('out of scope recedes furthest', () => {
  // The board dimming every zone except the one you are placing into. Those
  // areas are not broken, they are just not this decision.
  const out = S.STATE.outOfScope.opacity
  ok(out < S.STATE.disabled.opacity, `${out} is fainter than disabled`)
  ok(out < S.STATE.unaffordable.opacity, `${out} is fainter than unaffordable`)
})

check('a selection wins over every other state', () => {
  // You picked it. Hiding that because you cannot yet pay would be lying about
  // what you just clicked.
  eq(S.stateFor({ selected: true, unaffordable: true }), 'selected')
  eq(S.stateFor({ selected: true, disabled: true }), 'selected')
  eq(S.stateFor({ selected: true, spent: true }), 'selected')
})

check('unaffordable is not the same as disabled', () => {
  // Different remedies: one you are barred from, the other you are merely short
  // for — so an unaffordable card stays readable and inspectable.
  eq(S.stateFor({ unaffordable: true }), 'unaffordable')
  eq(S.stateFor({ disabled: true }), 'disabled')
  eq(S.STATE.disabled.pointerEvents, 'none', 'disabled is inert:')
  ok(S.STATE.unaffordable.pointerEvents !== 'none', 'unaffordable is not')
})

check('the default is available', () => {
  eq(S.stateFor({}), 'selectable')
  eq(S.stateFor(), 'selectable')
  eq(S.STATE.selectable.opacity, 1, 'and it is at full strength:')
})

check('every state a screen reader might meet has words', () => {
  // Opacity says nothing out loud.
  for (const name of Object.keys(S.STATE)) {
    ok(name in S.STATE_LABEL, `${name} has a label entry`)
  }
  eq(S.STATE_LABEL.selectable, null, 'except the one with nothing to say:')
  for (const [name, label] of Object.entries(S.STATE_LABEL)) {
    if (label !== null) ok(label.length > 3, `${name}: "${label}"`)
  }
})

check('stateStyle hands back something spreadable', () => {
  const style = S.stateStyle({ disabled: true })
  eq(style, S.STATE.disabled)
  ok(typeof style.opacity === 'number', 'with a real opacity')
})

// ---------------------------------------------------------------------------
// The notice stack
// ---------------------------------------------------------------------------

check('a notice carries its tone and text', () => {
  const n = A.pushNotice([], 'error', 'That area is taken.')
  eq(n.length, 1)
  eq(n[0].tone, 'error')
  eq(n[0].text, 'That area is taken.')
  ok(n[0].id, 'and an id to dismiss it by')
})

check('the same complaint four times is said once', () => {
  // Clicking the same illegal square repeatedly should not fill the stack with
  // one sentence and push out whatever else was worth reading.
  let n = []
  for (let i = 0; i < 4; i++) n = A.pushNotice(n, 'error', 'That area is taken.')
  eq(n.length, 1, 'said once:')
})

check('different messages all get through', () => {
  let n = A.pushNotice([], 'error', 'That area is taken.')
  n = A.pushNotice(n, 'error', 'Destination must be empty.')
  n = A.pushNotice(n, 'gain', 'You took the North')
  eq(n.length, 3)
})

check('the same words in a different tone are not a duplicate', () => {
  let n = A.pushNotice([], 'warn', 'Central')
  n = A.pushNotice(n, 'gain', 'Central')
  eq(n.length, 2, 'a loss and a gain are different news:')
})

check('empty text is not a notice', () => {
  eq(A.pushNotice([], 'error', ''), [])
  eq(A.pushNotice([], 'error', null), [])
  eq(A.pushNotice([], 'error', undefined), [])
})

check('dismissing removes exactly one', () => {
  let n = A.pushNotice([], 'error', 'one')
  n = A.pushNotice(n, 'error', 'two')
  const rest = A.dropNotice(n, n[0].id)
  eq(rest.length, 1)
  eq(rest[0].text, 'two')
})

check('dismissing something already gone is harmless', () => {
  const n = A.pushNotice([], 'error', 'one')
  eq(A.dropNotice(n, 'no-such-id').length, 1)
  eq(A.dropNotice([], 'no-such-id'), [])
})

check('errors linger longer than congratulations', () => {
  // An error has to be read. A gain is a pat on the back and should get out of
  // the way.
  ok(A.NOTICE_MS.error > A.NOTICE_MS.gain, `${A.NOTICE_MS.error} > ${A.NOTICE_MS.gain}`)
  for (const [tone, ms] of Object.entries(A.NOTICE_MS)) {
    ok(ms >= 2000 && ms <= 8000, `${tone} clears in a sensible time: ${ms}ms`)
  }
})

// ---------------------------------------------------------------------------
// Nothing goes back to improvising
// ---------------------------------------------------------------------------

check('no component invents its own “unavailable” opacity', () => {
  // The specific regression this whole vocabulary exists to prevent. Anything
  // in the range a fade would use has to come from lib/ui/states.js or from a
  // named constant that explains itself.
  const ALLOWED = /const\s+[A-Z_]+\s*=\s*0\.\d+/
  const offenders = []

  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (!e.name.endsWith('.js') || p.includes('prototype')) continue
      else {
        const src = readFileSync(p, 'utf8')
        if (ALLOWED.test(src)) continue
        for (const [, v] of src.matchAll(/opacity:\s*(0\.[0-5]\d*)\b/g)) {
          offenders.push(`${p} — opacity: ${v}`)
        }
      }
    }
  }
  walk('components')
  walk('pages')

  eq(offenders, [], 'raw fades outside the vocabulary:')
})

check('no component references a style key it does not define', () => {
  // Every component keeps its styles in a local `S` object. Deleting a key while
  // leaving a reference behind renders `style={undefined}` — no crash, no build
  // error, just a silently unstyled element. This has caught it twice; it lived
  // in a scratch script until the scratch directory got wiped.
  const problems = []

  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!e.name.endsWith('.js') || p.includes('prototype')) continue

      const src = readFileSync(p, 'utf8')
      const block = src.match(/\nconst S = \{([\s\S]*?)\n\}\n/)
      if (!block) continue

      const defined = new Set([...block[1].matchAll(/^  ([A-Za-z_$][\w$]*):/gm)].map((m) => m[1]))
      const used = new Set([...src.matchAll(/\bS\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
      for (const key of used) {
        if (!defined.has(key)) problems.push(`${p} uses S.${key}, which is not defined`)
      }
    }
  }
  walk('components')
  walk('pages')

  eq(problems, [], 'missing style keys:')
})

report('States and feedback')
