// SHASN — the board, rendered as the actual map.
//
// Zone outlines and voter-area positions come from lib/shasn/boardGeometry.js,
// which was traced from the printed board scan. Every pip is a real, clickable
// voter area sitting inside the true zone shape.
//
// Visual language:
//   - empty area      white disc, thin grey rim
//   - held area       filled with the owner's colour, no mark — a voter only ever
//                     needs to say WHOSE, never what
//   - majority voter  turned over (p.7): pale face, thick rim in the owner's
//                     colour, party emblem showing. The only token on the map
//                     worth a point, so the only one that carries a symbol
//   - Volatile Area   dashed red ring, kept for the whole game rather than only
//                     while empty — its voters are immune to gerrymandering
//                     (p.15-16), so their positions matter long afterwards
//   - zone plaque     the zone's holdings as proportional blocks with the
//                     majority line marked, so "two more and it is mine" is one
//                     glance rather than a count. A dashed plaque means the zone
//                     filled without anyone reaching the requirement and its
//                     points are gone (p.19) — which the board never used to
//                     admit. Plaques are PLACED rather than centred: they sit at
//                     the clearest spot inside their zone and shrink where the
//                     zone is tight, because the centroid of a 21-area zone is
//                     squarely on top of half a dozen voters.
//
// The board is a lacquered panel with a jali screen cut into it, brass framed,
// with block-printed cloth for territories and enamelled plates for the zone
// names. Every one of those is drawn in this file rather than loaded as an
// image, which is what lets a zone recolour to its holder and keeps the whole
// thing sharp at any size.
//
// Ornament stays in the CHROME. The grounds, frames and plates are textured; the
// voters, the tracks and the party colours on top of them are not, because those
// are the things you actually have to read. When a zone changes hands its
// outline sweeps to the new colour and the plate turns; those are the moments
// worth looking up for, so they are the only ones that move.

import { useEffect, useRef } from 'react'
import { ZONES, ZONE_IDS } from '../lib/shasn/zones'
import { ZONE_GEOMETRY, VIEW_BOX, PIP_RADIUS } from '../lib/shasn/boardGeometry'
import { RAW } from '../lib/ui/theme'
import { partyForSeat } from '../lib/shasn/parties'
import { majorityTrack } from '../lib/shasn/majorityTrack'
import PartyEmblem from './PartyEmblem'
import * as Board from '../lib/shasn/board'

// Zones outside the current decision recede furthest: they are not broken, they
// are simply not this choice. See lib/ui/states.js for the whole vocabulary.
const OUT_OF_SCOPE = 0.3

export const PLAYER_COLORS = RAW.p.slice(0, 5)

export function colorForSeat(i) {
  return PLAYER_COLORS[i % PLAYER_COLORS.length]
}

export default function ShasnBoard({
  board,
  players,
  colorOf,
  partyOf = null, // (playerId) => party id; falls back to seat order
  onAreaClick,
  selectedAreas = [],
  legalZones = null, // Set of zone ids currently targetable, or null for all
  // 'width' fills the container's width and lets the height follow — what a
  // document does. 'height' fills the container's HEIGHT and lets the width
  // follow, which is what a portrait map in a landscape viewport needs: the
  // board can only get bigger by getting taller.
  fit = 'width',
  // The printed board is a map of India, so it is portrait (872x1218) and its
  // width is decided entirely by the height it is given. In a landscape browser
  // that leaves a wide dead gutter no amount of column sizing can fill.
  //
  // 'landscape' turns the whole board a quarter turn. It is India on its side —
  // the North zone sits to the LEFT of the South zone — which is a real cost and
  // the reason this is a choice rather than the default. What it buys is about
  // 2.3x the board area in a room that keeps the player mat along the bottom.
  //
  // The rotation is a transform on one group, not a second set of coordinates,
  // so boardGeometry.js stays the single source of truth and hit-testing,
  // animations and the plaque solver all keep working untouched.
  orientation = 'portrait',
  maxWidth = 980,
  focusPlayerId = null, // lift one player's territory, drop everything else
  onZoneHover = null,   // (zoneId | null) => void
}) {
  const rights = Board.gerrymanderingRights(board)
  const interactive = Boolean(onAreaClick)

  const changes = useBoardChanges(board)

  const isSelected = (zoneId, i) =>
    selectedAreas.some((a) => a.zoneId === zoneId && a.areaIndex === i)

  const emblemFor = (playerId) =>
    partyOf?.(playerId) || partyForSeat(players.findIndex((p) => p.id === playerId)).id

  const byHeight = fit === 'height'
  const rotated = orientation === 'landscape'

  // Read right to left: shift the geometry to the origin, turn it a quarter
  // turn anticlockwise, then push it back down into view. The result maps the
  // 872x1218 portrait box exactly onto a 1218x872 landscape one.
  const turn = rotated
    ? `translate(0,${VIEW_BOX.w}) rotate(-90) translate(${-VIEW_BOX.x},${-VIEW_BOX.y})`
    : undefined

  return (
    <div
      style={
        byHeight
          ? { height: '100%', display: 'flex', justifyContent: 'center', minHeight: 0 }
          : { width: '100%', maxWidth, margin: '0 auto' }
      }
      onMouseLeave={onZoneHover ? () => onZoneHover(null) : undefined}
    >
      <svg
        viewBox={
          rotated
            ? `0 0 ${VIEW_BOX.h} ${VIEW_BOX.w}`
            : `${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.w} ${VIEW_BOX.h}`
        }
        style={{
          ...(byHeight
            ? { height: '100%', width: 'auto', maxWidth: '100%' }
            : { width: '100%', height: 'auto' }),
          display: 'block',
          borderRadius: 14,
          background: RAW.boardBg,
        }}
      >
        <defs>
          <filter id="zoneShadow" x="-8%" y="-8%" width="116%" height="116%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000" floodOpacity="0.45" />
          </filter>
          <filter id="pipShadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#000" floodOpacity="0.45" />
          </filter>

          {/* The board is lacquered wood with a jali screen cut into it. Both
              drawn here rather than loaded, so the whole thing stays sharp at
              any size and costs nothing to fetch. */}
          <pattern id="boardJali" width="46" height="46" patternUnits="userSpaceOnUse">
            <rect width="46" height="46" fill={RAW.boardBg} />
            <g fill="none" stroke="#d9ad3e" strokeLinejoin="round">
              <path d="M23 0 46 23 23 46 0 23Z" strokeWidth="1.4" opacity="0.16" />
              <path d="M23 9 37 23 23 37 9 23Z" strokeWidth="1" opacity="0.11" />
            </g>
            <circle cx="23" cy="23" r="2.4" fill="#d9ad3e" opacity="0.14" />
          </pattern>

          {/* Zone grounds: block-printed cloth, one stamp per zone family so
              neighbouring territories are told apart by texture as well as by
              their outline. */}
          <pattern id="zonePrintA" width="38" height="38" patternUnits="userSpaceOnUse">
            <rect width="38" height="38" fill={RAW.zone} />
            <g fill="#a81c22" opacity="0.13">
              <circle cx="19" cy="19" r="3" />
              <ellipse cx="19" cy="8" rx="2.6" ry="5" />
              <ellipse cx="19" cy="30" rx="2.6" ry="5" />
              <ellipse cx="8" cy="19" rx="5" ry="2.6" />
              <ellipse cx="30" cy="19" rx="5" ry="2.6" />
            </g>
          </pattern>
          <pattern id="zonePrintB" width="34" height="34" patternUnits="userSpaceOnUse">
            <rect width="34" height="34" fill={RAW.zone2} />
            <g fill="#0f7a4a" opacity="0.14">
              <path d="M17 6 21 15 17 24 13 15Z" />
              <circle cx="4" cy="28" r="2.2" />
              <circle cx="30" cy="28" r="2.2" />
            </g>
          </pattern>
          <pattern id="zonePrintC" width="30" height="30" patternUnits="userSpaceOnUse">
            <rect width="30" height="30" fill={RAW.zone3} />
            <g fill="#173f86" opacity="0.15">
              <circle cx="8" cy="8" r="2.1" />
              <circle cx="22" cy="22" r="2.1" />
              <circle cx="22" cy="8" r="1.3" />
              <circle cx="8" cy="22" r="1.3" />
            </g>
          </pattern>

          {/* Brass, for anything that reads as metal. */}
          <linearGradient id="boardBrass" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor="#f6e1a0" />
            <stop offset="0.42" stopColor="#d9ad3e" />
            <stop offset="0.7" stopColor="#9c6e14" />
            <stop offset="1" stopColor="#e8cb74" />
          </linearGradient>

          {/* A voter is an inlaid stone, not a flat disc: lit from above left. */}
          <radialGradient id="stoneLight" cx="0.34" cy="0.3" r="0.75">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="1" stopColor="#000" stopOpacity="0.22" />
          </radialGradient>
        </defs>

        <g transform={turn}>

        <rect
          x={VIEW_BOX.x}
          y={VIEW_BOX.y}
          width={VIEW_BOX.w}
          height={VIEW_BOX.h}
          fill="url(#boardJali)"
        />

        {/* A brass frame around the whole board, inset from the edge. */}
        <rect
          x={VIEW_BOX.x + 9}
          y={VIEW_BOX.y + 9}
          width={VIEW_BOX.w - 18}
          height={VIEW_BOX.h - 18}
          rx={16}
          fill="none"
          stroke="url(#boardBrass)"
          strokeWidth={5}
          opacity={0.75}
        />
        <rect
          x={VIEW_BOX.x + 17}
          y={VIEW_BOX.y + 17}
          width={VIEW_BOX.w - 34}
          height={VIEW_BOX.h - 34}
          rx={12}
          fill="none"
          stroke="#d9ad3e"
          strokeWidth={1.2}
          opacity={0.35}
        />

        {/* Zone territories */}
        {ZONE_IDS.map((zoneId) => {
          const g = ZONE_GEOMETRY[zoneId]
          const holder = Board.majorityHolder(board, zoneId)
          // Two independent reasons to recede: not part of the current action,
          // or not the player whose territory is being inspected.
          const dim =
            (legalZones && !legalZones.has(zoneId)) ||
            (focusPlayerId && holder !== focusPlayerId)
          const inner = zoneId === 'central'
          const band = zoneId === 'north' || zoneId === 'south'
          const change = changes.zones[zoneId]

          return (
            <polygon
              key={zoneId}
              points={g.path}
              fill={inner ? 'url(#zonePrintC)' : band ? 'url(#zonePrintB)' : 'url(#zonePrintA)'}
              stroke={holder ? colorOf(holder) : 'url(#boardBrass)'}
              strokeWidth={holder ? 8 : 4}
              strokeLinejoin="round"
              opacity={dim ? OUT_OF_SCOPE : 1}
              filter="url(#zoneShadow)"
              className={
                change === 'won'
                  ? 'shasn-zone-won'
                  : change === 'lost'
                  ? 'shasn-zone-lost'
                  : undefined
              }
              style={{ color: holder ? colorOf(holder) : undefined, transition: 'stroke 320ms var(--ease)' }}
            />
          )
        })}

        {/* Voter areas */}
        {ZONE_IDS.map((zoneId) => {
          const g = ZONE_GEOMETRY[zoneId]
          const holder = Board.majorityHolder(board, zoneId)
          const owners = board.zones[zoneId].owners
          const dim = legalZones && !legalZones.has(zoneId)

          return (
            <g
              key={`${zoneId}-pips`}
              opacity={dim ? OUT_OF_SCOPE : 1}
              onMouseEnter={onZoneHover ? () => onZoneHover(zoneId) : undefined}
            >
              {g.pips.map(([cx, cy], i) => {
                const owner = owners[i]
                const volatile = ZONES[zoneId].volatile.includes(i)
                const majorityVoter = owner && holder === owner
                const sel = isSelected(zoneId, i)
                const clickable = interactive && !dim
                const arrival = changes.pips[`${zoneId}:${i}`]

                return (
                  <g
                    key={i}
                    onClick={clickable ? () => onAreaClick(zoneId, i) : undefined}
                    className={
                      arrival === 'moved'
                        ? 'shasn-voter-move'
                        : arrival === 'volatile'
                        ? 'shasn-voter-volatile'
                        : arrival === 'placed'
                        ? 'shasn-voter-land'
                        : undefined
                    }
                    style={{
                      cursor: clickable ? 'pointer' : 'default',
                      // where the voter travelled from, for the gerrymander arc
                      ...(arrival === 'moved' && changes.moveDelta
                        ? { '--gx': changes.moveDelta[0], '--gy': changes.moveDelta[1] }
                        : null),
                    }}
                  >
                    {/* p.7 — a voter that forms a majority is physically TURNED
                        OVER on the board. So it inverts: pale face, thick rim in
                        the owner's colour, and the party emblem showing. That is
                        the one token on the map worth a point, and it should be
                        the one you can pick out from across the table. */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={PIP_RADIUS}
                      fill={majorityVoter ? RAW.surface : owner ? colorOf(owner) : RAW.pip}
                      stroke={
                        sel
                          ? RAW.ink
                          : majorityVoter
                          ? colorOf(owner)
                          : owner
                          ? 'rgba(0,0,0,0.22)'
                          : RAW.pipLine
                      }
                      strokeWidth={sel ? 6 : majorityVoter ? 6 : 1.5}
                      filter={owner ? 'url(#pipShadow)' : undefined}
                      opacity={focusPlayerId && owner !== focusPlayerId ? OUT_OF_SCOPE : 1}
                      style={{
                        transition:
                          'fill 260ms var(--ease), stroke 260ms var(--ease), opacity 260ms var(--ease)',
                      }}
                    />

                    {/* The light on the stone. Drawn over every voter, empty or
                        held, so the board reads as inlay rather than as paint. */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={PIP_RADIUS}
                      fill="url(#stoneLight)"
                      pointerEvents="none"
                    />

                    {majorityVoter && (
                      <g
                        transform={`translate(${cx - PIP_RADIUS * 0.44} ${cy - PIP_RADIUS * 0.44})`}
                        pointerEvents="none"
                      >
                        <PartyEmblem party={emblemFor(owner)} size={PIP_RADIUS * 0.88} color={colorOf(owner)} />
                      </g>
                    )}

                    {/* A Volatile Area stays marked for the whole game, not just
                        while it is empty. Its voters are immune to gerrymandering
                        (p.15-16), so where they sit matters long after the
                        Headline it triggered has been resolved. */}
                    {volatile && (
                      <>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={PIP_RADIUS + 4}
                          fill="none"
                          stroke={RAW.danger}
                          strokeWidth={2.5}
                          strokeDasharray="6 4"
                          opacity={owner ? 0.85 : 1}
                          pointerEvents="none"
                        />
                        {!owner && (
                          <path
                            d={burst(cx, cy, PIP_RADIUS * 0.5)}
                            stroke={RAW.danger}
                            strokeWidth={2.2}
                            strokeLinecap="round"
                            fill="none"
                            pointerEvents="none"
                          />
                        )}
                      </>
                    )}
                    <circle cx={cx} cy={cy} r={PIP_RADIUS} fill="transparent">
                      <title>
                        {owner
                          ? `${players.find((p) => p.id === owner)?.name}${
                              majorityVoter ? ' — majority voter' : ''
                            }`
                          : volatile
                          ? `${ZONES[zoneId].label} — Volatile Area, triggers a Headline`
                          : `${ZONES[zoneId].label} — empty`}
                      </title>
                    </circle>
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* Zone plaques */}
        {ZONE_IDS.map((zoneId) => {
          const g = ZONE_GEOMETRY[zoneId]
          const z = ZONES[zoneId]
          const track = majorityTrack(board, zoneId)
          const hasRights = rights[zoneId]
          const changed = changes.zones[zoneId]

          // Fixed size whichever state the zone is in, so plaques do not jump
          // around the map as majorities form and break — and placed at the
          // clearest spot in the zone rather than on the centroid, which in a
          // 21-area zone is sitting on top of half a dozen voters.
          const spot = plaquePlacement(zoneId, 96, 42)
          const { w: W, h: H } = spot
          const lx = spot.x
          const ly = spot.y
          const x0 = lx - W / 2
          const y0 = ly - H / 2

          return (
            <g
              key={`${zoneId}-label`}
              pointerEvents="none"
              /* Turned back the other way about its own centre. Without this the
                 zone names would read bottom-to-top. */
              transform={rotated ? `rotate(90, ${lx}, ${ly})` : undefined}
              className={changed ? 'shasn-plaque-flip' : undefined}
              opacity={track.dead ? 0.62 : 1}
            >
              {/* The plaque stays pale even when the zone is held — the zone
                  OUTLINE already sweeps to the holder's colour, and that is the
                  loud signal. The plaque's job is the quiet one: how close is
                  everybody, and can this still be won. */}
              {/* An enamelled plate screwed to the board. Brass surround,
                  ivory face, and a shadow so it sits ON the cloth rather than
                  being printed into it. */}
              <rect
                x={x0 - 2}
                y={y0 - 2}
                width={W + 4}
                height={H + 4}
                rx={11}
                fill="url(#boardBrass)"
                opacity={track.dead ? 0.55 : 1}
                filter="url(#zoneShadow)"
              />
              <rect
                x={x0}
                y={y0}
                width={W}
                height={H}
                rx={9}
                fill={RAW.surface}
                stroke={track.holder ? colorOf(track.holder) : 'rgba(138,95,17,0.45)'}
                strokeWidth={track.holder ? 3 : 1.2}
                strokeDasharray={track.dead ? '4 3' : undefined}
                style={{ transition: 'stroke 320ms var(--ease)' }}
              />
              {/* Two rivets, because a plate is fixed to something. */}
              <circle cx={x0 + 6} cy={y0 + 6} r={1.8} fill="#9c6e14" opacity={0.8} />
              <circle cx={x0 + W - 6} cy={y0 + H - 6} r={1.8} fill="#9c6e14" opacity={0.8} />

              <text
                x={lx}
                y={y0 + 12}
                fontSize={9}
                fill="#8a5f11"
                textAnchor="middle"
                letterSpacing="1.5"
                fontWeight="700"
                fontFamily="var(--head)"
              >
                {z.label.toUpperCase()}
              </text>

              <MajorityTrack
                track={track}
                colorOf={colorOf}
                x={x0 + 8}
                y={y0 + 17}
                width={W - 16}
                height={7}
              />

              {track.dead ? (
                <text
                  x={lx}
                  y={y0 + 36}
                  fontSize={7.5}
                  fill={RAW.danger}
                  textAnchor="middle"
                  letterSpacing="0.8"
                  fontWeight="600"
                  fontFamily="var(--sans)"
                >
                  NO MAJORITY POSSIBLE
                </text>
              ) : (
                <text
                  x={lx}
                  y={y0 + 37}
                  fontSize={15}
                  fill={RAW.ink}
                  textAnchor="middle"
                  fontFamily="var(--display)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {z.majority}/{z.areas}
                </text>
              )}

              {/* Gerrymandering Rights used to be a coloured dot, which read as
                  a stray voter sitting on the plaque. It is an ability, so it
                  gets a verb: two arrows swapping places. */}
              {hasRights && (
                <g transform={`translate(${x0 + W - 15} ${y0 - 8})`}>
                  <circle cx="9" cy="9" r="11" fill="url(#boardBrass)" />
                  <circle cx="9" cy="9" r="8.5" fill={RAW.surface} stroke={colorOf(hasRights)} strokeWidth="2" />
                  <path
                    d="M4 6.5h9l-2.5-2.5M14 11.5H5l2.5 2.5"
                    fill="none"
                    stroke={colorOf(hasRights)}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <title>Gerrymandering Rights</title>
                </g>
              )}

              <title>
                {describeZone(z, track, players)}
              </title>
            </g>
          )
        })}
        </g>
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Noticing what changed
//
// The board arrives as a whole new object on every poll, so to animate anything
// we have to work out what is different from the last one we drew: which areas
// gained a voter, whether one travelled (a gerrymander — one area lost a voter
// and an adjacent one gained the same owner in the same tick), and which zones
// changed hands.
// ---------------------------------------------------------------------------

const EMPTY = { pips: {}, zones: {}, moveDelta: null }

function useBoardChanges(board) {
  const prev = useRef(null)
  const timer = useRef(null)
  const changes = useRef(EMPTY)

  const before = prev.current
  if (before !== board) {
    changes.current = before ? diffBoard(before, board) : EMPTY
    prev.current = board
  }

  // Clear the flags once the animations have run, so a re-render for an
  // unrelated reason does not replay them.
  useEffect(() => {
    if (changes.current === EMPTY) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      changes.current = EMPTY
    }, 1200)
    return () => clearTimeout(timer.current)
  })

  return changes.current
}

function diffBoard(before, after) {
  const pips = {}
  const zones = {}
  const gained = []
  const lost = []

  for (const zoneId of ZONE_IDS) {
    const a = before.zones[zoneId]?.owners || []
    const b = after.zones[zoneId]?.owners || []

    for (let i = 0; i < b.length; i++) {
      if (a[i] === b[i]) continue
      if (b[i] && !a[i]) gained.push({ zoneId, i, owner: b[i] })
      else if (a[i] && !b[i]) lost.push({ zoneId, i, owner: a[i] })
      else if (b[i]) gained.push({ zoneId, i, owner: b[i] }) // changed hands
    }

    const wasHeld = Board.majorityHolder(before, zoneId)
    const nowHeld = Board.majorityHolder(after, zoneId)
    if (wasHeld !== nowHeld) zones[zoneId] = nowHeld ? 'won' : 'lost'
  }

  // A single voter leaving one area and appearing in another, for the same
  // player, is a gerrymander: it should travel rather than blink across.
  let moveDelta = null
  if (gained.length === 1 && lost.length === 1 && gained[0].owner === lost[0].owner) {
    const from = pipAt(lost[0].zoneId, lost[0].i)
    const to = pipAt(gained[0].zoneId, gained[0].i)
    if (from && to) {
      moveDelta = [Math.round(from[0] - to[0]), Math.round(from[1] - to[1])]
      pips[`${gained[0].zoneId}:${gained[0].i}`] = 'moved'
    }
  }

  if (!moveDelta) {
    for (const g of gained) {
      pips[`${g.zoneId}:${g.i}`] = ZONES[g.zoneId].volatile.includes(g.i) ? 'volatile' : 'placed'
    }
  }

  return { pips, zones, moveDelta }
}

/**
 * The zone's areas, sorted by owner with the majority line marked.
 *
 * Sorting is the entire point: the map already shows these same areas scattered
 * across the zone, which you have to count. Grouped and laid against a threshold
 * you can read "two more and it is mine" without counting anything.
 */
function MajorityTrack({ track, colorOf, x, y, width, height }) {
  const total = track.areas
  if (!total) return null

  const gap = 1.2
  const usable = width - gap * Math.max(0, track.runs.length - 1)
  const px = (n) => (usable * n) / total

  let cursor = x
  const blocks = track.runs.map((run, i) => {
    const w = px(run.count)
    const block = { key: i, x: cursor, w, owner: run.owner, count: run.count }
    cursor += w + gap
    return block
  })

  // Where the majority line falls, as a fraction of the whole zone. Drawn over
  // the top of the blocks rather than between them, because it is a level to
  // reach rather than a boundary between two holdings.
  const lineX = x + px(track.majority)

  return (
    <g>
      {blocks.map((b) => (
        <rect
          key={b.key}
          x={b.x}
          y={y}
          width={Math.max(b.w, 1.5)}
          height={height}
          rx={2}
          fill={b.owner ? colorOf(b.owner) : RAW.surface}
          stroke={b.owner ? 'none' : RAW.pipLine}
          strokeWidth={b.owner ? 0 : 1}
          style={{ transition: 'fill 260ms var(--ease)' }}
        >
          <title>
            {b.owner ? `${b.count} voters` : `${b.count} areas still open`}
          </title>
        </rect>
      ))}

      <path
        d={`M${lineX.toFixed(2)} ${y - 3.5}V${y + height + 3.5}`}
        stroke={RAW.ink}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </g>
  )
}

/**
 * Where to put a zone's plaque.
 *
 * It used to sit on the zone centroid, which in a 21-area zone is squarely on
 * top of several voter areas. So: sample positions inside the zone, count how
 * many voter circles each candidate plaque would cover, and take the clearest —
 * breaking ties by staying near the centroid so plaques do not wander to odd
 * corners.
 *
 * The board geometry never changes, so this runs once per zone and is cached.
 */
const anchorCache = new Map()

/** Returns { x, y, w, h } — the plaque also shrinks where the zone is tight. */
export function plaquePlacement(zoneId, baseW, baseH) {
  const key = `${zoneId}:${baseW}x${baseH}`
  if (anchorCache.has(key)) return anchorCache.get(key)

  // Central is a small inner diamond; a full-width plaque can never sit inside
  // it without hanging over the edge. So try a few sizes and let the zone pick.
  let winner = null
  for (const scale of [1, 0.88, 0.76]) {
    const w = Math.round(baseW * scale)
    const h = Math.round(baseH * (scale < 1 ? 0.94 : 1))
    const spot = bestSpot(zoneId, w, h)
    // A smaller plaque is a real cost, so it has to earn the swap.
    const score = spot.score + (1 - scale) * 90
    if (!winner || score < winner.score) {
      winner = { x: spot.pos[0], y: spot.pos[1], w, h, score, detail: spot }
    }
  }

  anchorCache.set(key, winner)
  return winner
}

function bestSpot(zoneId, w, h) {
  const g = ZONE_GEOMETRY[zoneId]
  const home = g.label
  const poly = g.path
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number))

  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  const bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]

  const clearance = PIP_RADIUS + 3
  let best = null

  const STEPS = 30
  for (let i = 0; i <= STEPS; i++) {
    for (let j = 0; j <= STEPS; j++) {
      const cx = bounds[0] + ((bounds[2] - bounds[0]) * i) / STEPS
      const cy = bounds[1] + ((bounds[3] - bounds[1]) * j) / STEPS
      if (!inside(poly, cx, cy)) continue

      // How many voter areas would this plaque sit on?
      let covered = 0
      for (const [px, py] of g.pips) {
        const dx = Math.max(Math.abs(px - cx) - w / 2, 0)
        const dy = Math.max(Math.abs(py - cy) - h / 2, 0)
        if (Math.hypot(dx, dy) < clearance) covered += 1
      }

      // A plaque hanging off the edge of its own zone is nearly as bad as one
      // sitting on voters — it stops reading as belonging to that territory.
      let outside = 0
      for (const ox of [-w / 2, w / 2]) {
        for (const oy of [-h / 2, h / 2]) {
          if (!inside(poly, cx + ox, cy + oy)) outside += 1
        }
      }

      const drift = Math.hypot(cx - home[0], cy - home[1])
      // Covering a voter is the worst; then hanging out of the zone; then, all
      // else equal, stay near where the label naturally sits.
      const score = covered * 1000 + outside * 200 + drift * 0.6

      if (!best || score < best.score) best = { pos: [cx, cy], score, covered, outside, drift }
    }
  }

  return best || { pos: home, score: Infinity, covered: 0, outside: 0, drift: 0 }
}

/** Ray casting: is (x, y) inside this polygon? */
function inside(poly, x, y) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** The tooltip: the whole state of a zone in one sentence. */
function describeZone(zone, track, players) {
  const name = (id) => players.find((p) => p.id === id)?.name || 'someone'
  if (track.holder) {
    return `${zone.label} — ${name(track.holder)} holds the majority, worth ${zone.majority} points`
  }
  if (track.dead) {
    return `${zone.label} — full, but nobody reached ${zone.majority}. Its ${zone.majority} points go unclaimed.`
  }
  if (!track.leader) {
    return `${zone.label} — empty. ${zone.majority} of ${zone.areas} areas takes it.`
  }
  return `${zone.label} — ${name(track.leader.playerId)} leads with ${track.leader.count} of ${zone.majority}, ${track.empty} areas still open`
}

/** An eight-point burst, marking an area that will set off a Headline (p.17). */
function burst(cx, cy, r) {
  const arms = []
  for (let k = 0; k < 4; k++) {
    const a = (Math.PI / 4) * k
    const dx = Math.cos(a) * r
    const dy = Math.sin(a) * r
    arms.push(`M${(cx - dx).toFixed(1)} ${(cy - dy).toFixed(1)}L${(cx + dx).toFixed(1)} ${(cy + dy).toFixed(1)}`)
  }
  return arms.join('')
}

function pipAt(zoneId, i) {
  return ZONE_GEOMETRY[zoneId]?.pips?.[i] || null
}
