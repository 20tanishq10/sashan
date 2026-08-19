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
//   - zone plaque     the zone's areas SORTED into a track with the majority
//                     line marked, so "two more and it is mine" is one glance
//                     rather than a count. A dashed plaque means the zone filled
//                     without anyone reaching the requirement and its points are
//                     gone (p.19) — which the board never used to admit.
//
// The map is deliberately quiet — pale territories, hairline borders — so that
// the only saturated things on it are voters and the zones people hold. When a
// zone changes hands its outline sweeps to the new colour and the plaque turns;
// those are the moments worth looking up for, so they are the only ones that move.

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
  maxWidth = 980,
}) {
  const rights = Board.gerrymanderingRights(board)
  const interactive = Boolean(onAreaClick)

  const changes = useBoardChanges(board)

  const isSelected = (zoneId, i) =>
    selectedAreas.some((a) => a.zoneId === zoneId && a.areaIndex === i)

  const emblemFor = (playerId) =>
    partyOf?.(playerId) || partyForSeat(players.findIndex((p) => p.id === playerId)).id

  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto' }}>
      <svg
        viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.w} ${VIEW_BOX.h}`}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          borderRadius: 14,
          background: RAW.boardBg,
        }}
      >
        <defs>
          <filter id="zoneShadow" x="-6%" y="-6%" width="112%" height="112%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#15181d" floodOpacity="0.14" />
          </filter>
          <filter id="pipShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#15181d" floodOpacity="0.28" />
          </filter>
        </defs>

        <rect
          x={VIEW_BOX.x}
          y={VIEW_BOX.y}
          width={VIEW_BOX.w}
          height={VIEW_BOX.h}
          fill={RAW.boardBg}
        />

        {/* Zone territories */}
        {ZONE_IDS.map((zoneId) => {
          const g = ZONE_GEOMETRY[zoneId]
          const holder = Board.majorityHolder(board, zoneId)
          const dim = legalZones && !legalZones.has(zoneId)
          const inner = zoneId === 'central'
          const band = zoneId === 'north' || zoneId === 'south'
          const change = changes.zones[zoneId]

          return (
            <polygon
              key={zoneId}
              points={g.path}
              fill={inner ? RAW.zone3 : band ? RAW.zone2 : RAW.zone}
              stroke={holder ? colorOf(holder) : RAW.zoneLine}
              strokeWidth={holder ? 7 : 3}
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
            <g key={`${zoneId}-pips`} opacity={dim ? OUT_OF_SCOPE : 1}>
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
                      style={{ transition: 'fill 260ms var(--ease), stroke 260ms var(--ease)' }}
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
          const [lx, ly] = g.label
          const track = majorityTrack(board, zoneId)
          const hasRights = rights[zoneId]
          const changed = changes.zones[zoneId]

          // Fixed height whichever state the zone is in, so plaques do not jump
          // around the map as majorities form and break.
          const W = 104
          const H = 58
          const x0 = lx - W / 2
          const y0 = ly - 24

          return (
            <g
              key={`${zoneId}-label`}
              pointerEvents="none"
              className={changed ? 'shasn-plaque-flip' : undefined}
              opacity={track.dead ? 0.62 : 1}
            >
              {/* The plaque stays pale even when the zone is held — the zone
                  OUTLINE already sweeps to the holder's colour, and that is the
                  loud signal. The plaque's job is the quiet one: how close is
                  everybody, and can this still be won. */}
              <rect
                x={x0}
                y={y0}
                width={W}
                height={H}
                rx={9}
                fill={RAW.surface}
                stroke={track.holder ? colorOf(track.holder) : RAW.zoneLine}
                strokeWidth={track.holder ? 3 : 1.5}
                strokeDasharray={track.dead ? '4 3' : undefined}
                style={{ transition: 'stroke 320ms var(--ease)' }}
              />

              <text
                x={lx}
                y={y0 + 14}
                fontSize={9.5}
                fill={RAW.ink3}
                textAnchor="middle"
                letterSpacing="1.3"
                fontWeight="600"
                fontFamily="var(--sans)"
              >
                {z.label.toUpperCase()}
              </text>

              <MajorityTrack
                track={track}
                colorOf={colorOf}
                x={x0 + 9}
                y={y0 + 21}
                width={W - 18}
                height={10}
              />

              {track.dead ? (
                <text
                  x={lx}
                  y={y0 + 48}
                  fontSize={8}
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
                  y={y0 + 49}
                  fontSize={15}
                  fill={RAW.ink}
                  textAnchor="middle"
                  fontWeight="650"
                  fontFamily="var(--sans)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {z.majority}/{z.areas}
                </text>
              )}

              {/* Gerrymandering Rights used to be a coloured dot, which read as
                  a stray voter sitting on the plaque. It is an ability, so it
                  gets a verb: two arrows swapping places. */}
              {hasRights && (
                <g transform={`translate(${x0 + W - 18} ${y0 - 9})`}>
                  <circle cx="9" cy="9" r="10" fill={RAW.surface} stroke={colorOf(hasRights)} strokeWidth="2" />
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
  const n = track.segments.length
  if (!n) return null

  const gap = 1.6
  const seg = (width - gap * (n - 1)) / n

  return (
    <g>
      {track.segments.map((s, i) => {
        const sx = x + i * (seg + gap)
        return (
          <g key={i}>
            <rect
              x={sx}
              y={y}
              width={seg}
              height={height}
              rx={1.8}
              fill={s.owner ? colorOf(s.owner) : RAW.surface}
              stroke={s.owner ? 'none' : RAW.pipLine}
              strokeWidth={s.owner ? 0 : 1}
              style={{ transition: 'fill 260ms var(--ease)' }}
            />
            {/* The majority line, sitting in the gap after this segment. */}
            {s.threshold && i < n - 1 && (
              <path
                d={`M${(sx + seg + gap / 2).toFixed(2)} ${y - 3}V${y + height + 3}`}
                stroke={RAW.ink}
                strokeWidth={1.8}
                strokeLinecap="round"
              />
            )}
          </g>
        )
      })}
    </g>
  )
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
