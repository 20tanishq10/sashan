// SHASN — React's half of change detection.
//
// The comparisons live in lib/ui/changes.js, which is pure and tested. These are
// the thin hooks that hold the previous value and clear the result once the
// animation has had time to run.
//
// One rule throughout: the previous value is recorded in an EFFECT, never during
// render. Mutating a ref while rendering works right up until something renders
// twice — StrictMode, a suspended tree, a concurrent re-render — and then a
// change is silently swallowed and the animation never fires. It costs one extra
// render per change to do it properly, which is nothing.

import { useEffect, useRef, useState } from 'react'

/**
 * Compare `value` against what it was last time, using `compare`, and hold the
 * result for `ms` so an animation can run.
 *
 * `compare(before, after)` runs only when the value actually changes identity,
 * and never on the first render — there is nothing to compare against, and
 * animating everything on mount would mean the whole board flew in every time
 * you reloaded the page.
 */
export function useChange(value, compare, ms = 800, empty = null) {
  const prev = useRef(undefined)
  const [change, setChange] = useState(empty)

  useEffect(() => {
    const before = prev.current
    prev.current = value
    if (before === undefined || before === value) return

    const found = compare(before, value)
    setChange(found)

    const t = setTimeout(() => setChange(empty), ms)
    return () => clearTimeout(t)
    // `compare` and `empty` are expected to be stable; `value` is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms])

  return change
}

/** True for `ms` after `on` flips from false to true. */
export function useJustTrue(on, ms = 700) {
  const prev = useRef(on)
  const [hit, setHit] = useState(false)

  useEffect(() => {
    if (on && !prev.current) {
      setHit(true)
      prev.current = on
      const t = setTimeout(() => setHit(false), ms)
      return () => clearTimeout(t)
    }
    prev.current = on
  }, [on, ms])

  return hit
}

/** True for `ms` after `n` decreases — a pile being drawn from. */
export function useJustDecreased(n, ms = 420) {
  const prev = useRef(n)
  const [hit, setHit] = useState(false)

  useEffect(() => {
    if (n < prev.current) {
      setHit(true)
      prev.current = n
      const t = setTimeout(() => setHit(false), ms)
      return () => clearTimeout(t)
    }
    prev.current = n
  }, [n, ms])

  return hit
}

/**
 * The value as it was before the most recent change, held for `ms`.
 *
 * Needed for anything that has to animate what is no longer there: a resource
 * token flying back to the Reserve has to leave from the slot it was actually
 * sitting in, and by the time we know it has gone the row has already reflowed.
 */
export function useDeparting(value, ms = 500) {
  const prev = useRef(undefined)
  const [ghost, setGhost] = useState(null)

  useEffect(() => {
    const before = prev.current
    prev.current = value
    if (before === undefined || before === value) return

    setGhost(before)
    const t = setTimeout(() => setGhost(null), ms)
    return () => clearTimeout(t)
  }, [value, ms])

  return ghost
}
