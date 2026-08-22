// SHASN — turning the board a quarter turn.
//
// The printed board is a map of India: portrait, 872x1218. Its width is decided
// entirely by the height it is given, so in a landscape browser it leaves a wide
// dead gutter that no amount of column sizing can fill. Rotating it is the one
// thing that actually changes that arithmetic.
//
// The cost is real and deliberate: it is India on its side, with the North zone
// to the LEFT of the South zone. That is why it is a prop and not a rewrite of
// boardGeometry.js — the geometry stays the single source of truth, the rotation
// is one transform, and turning it off restores the printed orientation exactly.
//
// I cannot see a screen from here, so this is the arithmetic instead: prove the
// transform maps the portrait box onto the landscape one with nothing clipped
// and nothing left over.
//
// Run with:  node tests/orientation.test.mjs

import { boardGeometry as Geo, createRunner, eq, ok } from './harness.mjs'

const { check, report } = createRunner()
const { VIEW_BOX } = Geo

/**
 * The transform ShasnBoard applies, in the same order SVG would:
 *   translate(0, w) rotate(-90) translate(-x, -y)
 * Right to left — shift to the origin, turn, push back into view.
 */
function turn(px, py) {
  const u = px - VIEW_BOX.x
  const v = py - VIEW_BOX.y
  return [v, VIEW_BOX.w - u] // rotate(-90) sends (u,v) to (v,-u); then translate
}

const corners = () => [
  [VIEW_BOX.x, VIEW_BOX.y],
  [VIEW_BOX.x + VIEW_BOX.w, VIEW_BOX.y],
  [VIEW_BOX.x + VIEW_BOX.w, VIEW_BOX.y + VIEW_BOX.h],
  [VIEW_BOX.x, VIEW_BOX.y + VIEW_BOX.h],
]

check('the board is portrait, which is the whole problem', () => {
  ok(VIEW_BOX.h > VIEW_BOX.w, 'taller than it is wide')
  const aspect = VIEW_BOX.w / VIEW_BOX.h
  ok(aspect > 0.7 && aspect < 0.73, `about 0.72 wide-to-tall; got ${aspect.toFixed(3)}`)
})

check('every corner lands inside the rotated viewBox', () => {
  // If any corner falls outside, part of the map is clipped off the edge and
  // some zone becomes unclickable — the kind of thing that looks fine until
  // somebody cannot place a voter in the South.
  const w = VIEW_BOX.h // the rotated viewBox is h x w
  const h = VIEW_BOX.w
  for (const [px, py] of corners()) {
    const [rx, ry] = turn(px, py)
    ok(rx >= -0.001 && rx <= w + 0.001, `x ${rx.toFixed(1)} within 0..${w}`)
    ok(ry >= -0.001 && ry <= h + 0.001, `y ${ry.toFixed(1)} within 0..${h}`)
  }
})

check('the rotated board exactly fills the rotated viewBox', () => {
  // Not merely inside it — flush to it. Slack here would show as the board
  // floating off-centre inside its own frame.
  const pts = corners().map(([px, py]) => turn(px, py))
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  eq(Math.max(...xs) - Math.min(...xs), VIEW_BOX.h, 'width after turning:')
  eq(Math.max(...ys) - Math.min(...ys), VIEW_BOX.w, 'height after turning:')
  eq(Math.min(...xs), 0, 'flush to the left edge:')
  eq(Math.min(...ys), 0, 'flush to the top edge:')
})

check('turning it is reversible — no geometry is lost', () => {
  // The rotation is presentation only. Every pip must come back to exactly
  // where boardGeometry.js put it, or hit-testing and the plaque solver drift.
  const back = ([rx, ry]) => [VIEW_BOX.w - ry + VIEW_BOX.x, rx + VIEW_BOX.y]
  let checked = 0
  for (const zone of Object.values(Geo.ZONE_GEOMETRY)) {
    for (const [px, py] of zone.pips) {
      const [bx, by] = back(turn(px, py))
      ok(Math.abs(bx - px) < 1e-9 && Math.abs(by - py) < 1e-9, `pip ${px},${py} round-trips`)
      checked++
    }
  }
  ok(checked > 100, `all ${checked} voter areas round-trip`)
})

check('a quarter turn is what buys the space back', () => {
  // The room keeps the player mat along the bottom, which leaves the board
  // roughly 510px of height inside a 1026px column. These are the numbers that
  // justify putting India on its side; if they ever stop holding, so does the
  // argument for the rotation.
  const stageH = 510
  const colW = 1026
  const size = (aspect) => {
    let h = stageH
    let w = h * aspect
    if (w > colW) {
      w = colW
      h = w / aspect
    }
    return { w, h, area: w * h }
  }

  const portrait = size(VIEW_BOX.w / VIEW_BOX.h)
  const landscape = size(VIEW_BOX.h / VIEW_BOX.w)

  ok(portrait.w < 400, `portrait is narrow: ${portrait.w.toFixed(0)}px`)
  ok(landscape.w > 650, `landscape is wide: ${landscape.w.toFixed(0)}px`)
  ok(
    landscape.area / portrait.area > 1.9,
    `and worth at least 1.9x the area; got ${(landscape.area / portrait.area).toFixed(2)}x`
  )
  ok(
    colW - landscape.w < (colW - portrait.w) / 2,
    'the dead gutter is at least halved'
  )
})

report('Turning the board')
