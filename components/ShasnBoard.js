// SHASN — the board, rendered as the actual map.
//
// Zone outlines and voter-area positions come from lib/shasn/boardGeometry.js,
// which was traced from the printed board scan. Every pip is a real, clickable
// voter area sitting inside the true zone shape.
//
// Visual language, following the printed board:
//   - empty area      pale disc with a thin rim
//   - held area       filled with the owner's colour
//   - majority voter  filled, with a white inner ring (the "flipped" token, p.7)
//   - Volatile Area   dashed red rim; placing here triggers a Headline (p.17)
//   - zone plaque     name over the printed majority/total fraction

import { ZONES, ZONE_IDS } from '../lib/shasn/zones'
import { ZONE_GEOMETRY, VIEW_BOX, PIP_RADIUS } from '../lib/shasn/boardGeometry'
import * as Board from '../lib/shasn/board'

export const PLAYER_COLORS = ['#c8492f', '#2f5fa8', '#3f7d4e', '#b08420', '#6f4a9c']

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
  maxWidth = 880,
}) {
  const rights = Board.gerrymanderingRights(board)
  const interactive = Boolean(onAreaClick)

  const isSelected = (zoneId, i) =>
    selectedAreas.some((a) => a.zoneId === zoneId && a.areaIndex === i)

  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto' }}>
      <svg
        viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.w} ${VIEW_BOX.h}`}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12 }}
      >
        <defs>
          <filter id="zoneShadow" x="-6%" y="-6%" width="112%" height="112%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#20180f" floodOpacity="0.45" />
          </filter>
        </defs>

        <rect
          x={VIEW_BOX.x}
          y={VIEW_BOX.y}
          width={VIEW_BOX.w}
          height={VIEW_BOX.h}
          fill="#48392c"
        />

        {/* Zone territories */}
        {ZONE_IDS.map((zoneId) => {
          const g = ZONE_GEOMETRY[zoneId]
          const holder = Board.majorityHolder(board, zoneId)
          const dim = legalZones && !legalZones.has(zoneId)
          const inner = zoneId === 'central'
          const band = zoneId === 'north' || zoneId === 'south'
          return (
            <polygon
              key={zoneId}
              points={g.path}
              fill={inner ? '#d8cdaa' : band ? '#efebdd' : '#f7f4ec'}
              stroke={holder ? colorOf(holder) : '#57685a'}
              strokeWidth={holder ? 7 : 4}
              strokeLinejoin="round"
              opacity={dim ? 0.35 : 1}
              filter="url(#zoneShadow)"
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
            <g key={`${zoneId}-pips`} opacity={dim ? 0.35 : 1}>
              {g.pips.map(([cx, cy], i) => {
                const owner = owners[i]
                const volatile = ZONES[zoneId].volatile.includes(i)
                const majorityVoter = owner && holder === owner
                const sel = isSelected(zoneId, i)
                const clickable = interactive && !dim

                return (
                  <g
                    key={i}
                    onClick={clickable ? () => onAreaClick(zoneId, i) : undefined}
                    style={{ cursor: clickable ? 'pointer' : 'default' }}
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={PIP_RADIUS}
                      fill={owner ? colorOf(owner) : '#fdfcf8'}
                      stroke={sel ? '#111' : volatile ? '#b3452f' : owner ? '#00000033' : '#cfc9ba'}
                      strokeWidth={sel ? 6 : volatile ? 4 : 2}
                      strokeDasharray={volatile && !owner ? '6 4' : undefined}
                    />
                    {majorityVoter && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={PIP_RADIUS * 0.52}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth={3.5}
                        opacity={0.9}
                      />
                    )}
                    {clickable && !owner && (
                      <circle cx={cx} cy={cy} r={PIP_RADIUS} fill="transparent">
                        <title>
                          {volatile
                            ? `${ZONES[zoneId].label} — Volatile Area, triggers a Headline`
                            : `${ZONES[zoneId].label} — empty`}
                        </title>
                      </circle>
                    )}
                    {owner && (
                      <circle cx={cx} cy={cy} r={PIP_RADIUS} fill="transparent">
                        <title>
                          {players.find((p) => p.id === owner)?.name}
                          {majorityVoter ? ' — majority voter' : ''}
                        </title>
                      </circle>
                    )}
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

          return (
            <g key={`${zoneId}-label`} pointerEvents="none">
              <rect
                x={lx - 47}
                y={ly - 26}
                width={94}
                height={holder ? 62 : 48}
                rx={8}
                fill={holder ? colorOf(holder) : '#3d5145'}
                opacity={0.97}
                stroke="#00000022"
                strokeWidth={2}
              />
              <text
                x={lx}
                y={ly - 10}
                fontSize={10}
                fill="#e7eee6"
                textAnchor="middle"
                letterSpacing="1.2"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {z.label.toUpperCase()}
              </text>
              <text
                x={lx}
                y={ly + 12}
                fontSize={22}
                fill="#fff"
                textAnchor="middle"
                fontWeight="700"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {z.majority}/{z.areas}
              </text>
              {holder && (
                <text
                  x={lx}
                  y={ly + 30}
                  fontSize={10}
                  fill="#fff"
                  textAnchor="middle"
                  letterSpacing="1"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  MAJORITY
                </text>
              )}
              {!holder && leader && (
                <text
                  x={lx}
                  y={ly + 26}
                  fontSize={10}
                  fill="#b9c9ba"
                  textAnchor="middle"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {leader[1]} / {z.majority} needed
                </text>
              )}
              {hasRights && (
                <circle cx={lx + 44} cy={ly - 22} r={7} fill={colorOf(hasRights)} stroke="#fff" strokeWidth={2}>
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
