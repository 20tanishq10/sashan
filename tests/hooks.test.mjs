// SHASN — no component calls a hook after an early return.
//
// This is the mistake that took the game room down. FloatingMat renders nothing
// until it has read its saved position out of localStorage, so its first render
// bails out early. A hook added below that guard therefore ran on the second
// render but not the first, and React treats a change in hook count as fatal —
// it tears down the whole tree. The player saw "Application error: a client-side
// exception has occurred" and nothing else, the instant a game started.
//
// `next build` did not catch it. An esbuild parse did not catch it. It is neither
// a syntax error nor a type error; it is only visible once the component renders
// twice. tests/room.test.mjs catches it by mounting the page for real, and this
// catches it statically, so the next one is caught at the source rather than
// several components downstream.
//
// Run with:  node tests/hooks.test.mjs

import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createRunner, eq, ok } from './harness.mjs'

const { check, report } = createRunner()

const BUILTIN =
  /\b(useState|useEffect|useLayoutEffect|useRef|useMemo|useCallback|useReducer|useContext|useTransition|useDeferredValue|useId|useSyncExternalStore)\s*\(/
// Any `useThing(` is a custom hook, and carries hooks inside it.
const CUSTOM = /\buse[A-Z]\w*\s*\(/

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
  return out
}

/**
 * Report every hook call that sits after a top-level `return` inside a component
 * or custom hook.
 *
 * Deliberately narrow: it only tracks returns at the function's own top level,
 * which is where early bail-outs live and where the damage is done. A hook inside
 * a nested callback after a return is not the same bug.
 */
function offendersIn(path, src = readFileSync(path, 'utf8')) {
  const out = []
  let depth = 0
  let bodyDepth = null // brace depth of the component body's own statements
  let fnName = null
  let returned = false

  const delta = (line) => {
    let d = 0
    for (const ch of line) {
      if (ch === '{') d++
      else if (ch === '}') d--
    }
    return d
  }

  src.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, '')
    const after = depth + delta(line)

    const decl = line.match(/^\s*(?:export\s+default\s+)?function\s+([A-Z]\w*|use[A-Z]\w*)\s*\(/)

    if (decl && bodyDepth === null) {
      // Measured AFTER the whole line, so destructured parameters — the `{ on }`
      // in `function Mat({ on }) {` — do not throw the depth off by one.
      fnName = decl[1]
      bodyDepth = after
      returned = false
      depth = after
      return
    }

    if (bodyDepth !== null && depth === bodyDepth) {
      if (/^\s*(if\s*\(.*\)\s*)?return\b/.test(line)) returned = true
      else if (returned && (BUILTIN.test(line) || CUSTOM.test(line))) {
        out.push(`${path}:${i + 1} — ${fnName} calls ${line.trim()}`)
      }
    }

    depth = after
    if (bodyDepth !== null && depth < bodyDepth) {
      bodyDepth = null
      fnName = null
      returned = false
    }
  })
  return out
}

// ---------------------------------------------------------------------------

check('the checker detects the bug it was written for', () => {
  // Without this, the check below could quietly rot into a no-op that passes
  // because it never looks at anything.
  const planted = [
    'export default function Bad({ on }) {',
    '  const [loaded, setLoaded] = useState(false)',
    '  if (!loaded) return null',
    '  const x = useRef(on)',
    '  return <p>{x.current}</p>',
    '}',
  ].join('\n')
  const found = offendersIn('Bad.js', planted)
  eq(found.length, 1, 'caught the planted offender:')
  ok(found[0].includes('useRef'), `named the offending hook: ${found[0]}`)
})

check('the checker does not flag hooks that are correctly placed', () => {
  const fine = [
    'export default function Good({ on }) {',
    '  const [loaded, setLoaded] = useState(false)',
    '  const x = useRef(on)',
    '  useEffect(() => { setLoaded(true) }, [])',
    '  if (!loaded) return null',
    '  return <p>{x.current}</p>',
    '}',
  ].join('\n')
  eq(offendersIn('Good.js', fine), [], 'no false positives:')
})

check('a hook inside a callback after a return is not flagged', () => {
  // Common and harmless: an early return, then a nested function that happens to
  // contain a call matching the hook shape.
  const fine = [
    'export default function Fine({ items }) {',
    '  if (!items) return null',
    '  return items.map((i) => useless(i))',
    '}',
  ].join('\n')
  eq(offendersIn('Fine.js', fine), [], 'nested calls are left alone:')
})

check('no component calls a hook after an early return', () => {
  const offenders = sourceFiles().flatMap((f) => offendersIn(f))
  eq(offenders, [], 'hooks below an early return (React tears the tree down):')
})

report('Hook ordering')
