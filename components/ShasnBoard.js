// SHASN — the board, rendered as the actual map.
//
// Zone outlines and voter-area positions come from lib/shasn/boardGeometry.js,
// which was traced from the printed board scan. Every pip is a real, clickable
// voter area sitting inside the true zone shape.
//
// Visual language:
//   - empty area      white disc, thin grey rim
//   - held area       filled with the owner's colour
//   - majority voter  filled, with a white inner ring (the "flipped" token, p.7)
//   - Volatile Area   dashed red rim; placing here triggers a Headline (p.17)
//   - zone plaque     name over the printed majority/total fraction
//
// The map is deliberately quiet — pale territories, hairline borders — so that
// the only saturated things on it are voters and the zones people hold. When a
// zone changes hands its outline sweeps to the new colour and the plaque turns;
// those are the moments worth looking up for, so they are the only ones that move.

import { useEffect, useRef } from 'react'
import { ZONES, ZONE_IDS } from '../lib/shasn/zones'
import { ZONE_GEOMETRY, VIEW_BOX, PIP_RADIUS } from '../lib/shasn/boardGeometry'
import { RAW } from '../lib/ui/theme'
import * as Board from '../lib/shasn/board'

export const PLAYER_COLORS = RAW.p.slice(0, 5)

export function colorForSeat(i) {
  return PLAYER_COLORS[i % PLAYER_COLORS.length]
}

export default function ShasnBoard({
  board,
  players,
  colorOf,
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
              opacity={dim ? 0.32 : 1}
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
            <g key={`${zoneId}-pips`} opacity={dim ? 0.32 : 1}>
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
                    <circle
                      cx={cx}
                      cy={cy}
                      r={PIP_RADIUS}
                      fill={owner ? colorOf(owner) : RAW.pip}
                      stroke={
                        sel
                          ? RAW.ink
                          : volatile
                          ? RAW.danger
                          : owner
                          ? 'rgba(0,0,0,0.22)'
                          : RAW.pipLine
                      }
                      strokeWidth={sel ? 6 : volatile ? 3.5 : owner ? 1.5 : 1.5}
                      strokeDasharray={volatile && !owner ? '6 4' : undefined}
                      filter={owner ? 'url(#pipShadow)' : undefined}
                      style={{ transition: 'fill 260ms var(--ease)' }}
                    />
                    {majorityVoter && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={PIP_RADIUS * 0.5}
                        fill="none"
                        stroke={RAW.surface}
                        strokeWidth={3.5}
                        opacity={0.95}
                      />
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
          const holder = Board.majorityHolder(board, zoneId)
          const counts = Board.voterCounts(board, zoneId)
          const leader = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
          const hasRights = rights[zoneId]
          const changed = changes.zones[zoneId]

          return (
            <g
              key={`${zoneId}-label`}
              pointerEvents="none"
              className={changed ? 'shasn-plaque-flip' : undefined}
            >
              <rect
                x={lx - 46}
                y={ly - 26}
                width={92}
                height={holder ? 60 : 46}
                rx={9}
                fill={holder ? colorOf(holder) : RAW.surface}
                stroke={holder ? 'rgba(0,0,0,0.14)' : RAW.zoneLine}
                strokeWidth={1.5}
                style={{ transition: 'fill 320ms var(--ease)' }}
              />
              <text
                x={lx}
                y={ly - 11}
                fontSize={9.5}
                fill={holder ? 'rgba(255,255,255,0.86)' : RAW.ink3}
                textAnchor="middle"
                letterSpacing="1.3"
                fontWeight="600"
                fontFamily="var(--sans)"
              >
                {z.label.toUpperCase()}
              </text>
              <text
                x={lx}
                y={ly + 11}
                fontSize={21}
                fill={holder ? RAW.surface : RAW.ink}
                textAnchor="middle"
                fontWeight="650"
                fontFamily="var(--sans)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {z.majority}/{z.areas}
              </text>
              {holder && (
                <text
                  x={lx}
                  y={ly + 29}
                  fontSize={9}
                  fill="rgba(255,255,255,0.88)"
                  textAnchor="middle"
                  letterSpacing="1.4"
                  fontWeight="600"
                  fontFamily="var(--sans)"
                >
                  MAJORITY
                </text>
              )}
              {!holder && leader && (
                <text
                  x={lx}
                  y={ly + 26}
                  fontSize={9}
                  fill={RAW.ink3}
                  textAnchor="middle"
                  fontFamily="var(--sans)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {leader[1]} / {z.majority} needed
                </text>
              )}
              {hasRights && (
                <circle
                  cx={lx + 43}
                  cy={ly - 22}
                  r={7}
                  fill={colorOf(hasRights)}
                  stroke={RAW.surface}
                  strokeWidth={2}
                >
                  <title>Gerrymandering Rights</title>
                </circle>
              )}
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

function pipAt(zoneId, i) {
  return ZONE_GEOMETRY[zoneId]?.pips?.[i] || null
}
