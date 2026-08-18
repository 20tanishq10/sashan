// Shared SHASN board renderer — used by both the hot-seat prototype and the
// multiplayer game room.
//
// Zones are laid out in the 3x3 reading order of the printed board. Each area is
// a clickable pip; Volatile Areas are drawn with a dashed red border because
// placing there triggers a Headline (rulebook p.17).

import { ZONES, isVolatile } from '../lib/shasn/zones'
import * as Board from '../lib/shasn/board'

export const BOARD_GRID = [
  ['north_west', 'north', 'north_east'],
  ['west', 'central', 'east'],
  ['south_west', 'south', 'south_east'],
]

export const PLAYER_COLORS = ['#e05d3d', '#3d7de0', '#4fa363', '#c9a227', '#8e56c4']

export function colorForSeat(i) {
  return PLAYER_COLORS[i % PLAYER_COLORS.length]
}

export default function ShasnBoard({
  board,
  players,
  colorOf,
  highlightZones = null, // null = all clickable, or a Set of zone ids
  selectedAreas = [],
  onAreaClick,
  compact = false,
}) {
  const rights = Board.gerrymanderingRights(board)
  const size = compact ? 14 : 17

  return (
    <div style={S.wrap}>
      {BOARD_GRID.map((row, ri) => (
        <div key={ri} style={S.row}>
          {row.map((zoneId) => {
            const z = ZONES[zoneId]
            const holder = Board.majorityHolder(board, zoneId)
            const settled = Board.isZoneSettled(board, zoneId)
            const counts = Board.voterCounts(board, zoneId)
            const rightsHolder = rights[zoneId]
            const dimmed = highlightZones && !highlightZones.has(zoneId)

            return (
              <div
                key={zoneId}
                style={{
                  ...S.zone,
                  borderColor: holder ? colorOf(holder) : settled ? '#bbb' : '#d8d2c4',
                  borderWidth: holder ? 2 : 1,
                  opacity: dimmed ? 0.4 : 1,
                  background: highlightZones && !dimmed ? '#fffdf6' : '#fff',
                }}
              >
                <div style={S.head}>
                  <strong>{z.label}</strong>
                  <span style={S.req}>
                    {z.majority}/{z.areas}
                  </span>
                </div>

                <div style={S.areas}>
                  {board.zones[zoneId].owners.map((owner, i) => {
                    const volatile = isVolatile(zoneId, i)
                    const isSelected = selectedAreas.some(
                      (a) => a.zoneId === zoneId && a.areaIndex === i
                    )
                    const isMajorityVoter = owner && holder === owner
                    return (
                      <button
                        key={i}
                        onClick={() => onAreaClick && onAreaClick(zoneId, i)}
                        disabled={!onAreaClick || dimmed}
                        title={
                          volatile
                            ? 'Volatile Area — placing here triggers a Headline'
                            : owner
                            ? players.find((p) => p.id === owner)?.name
                            : 'Empty'
                        }
                        style={{
                          ...S.area,
                          width: size,
                          height: size,
                          background: owner ? colorOf(owner) : '#f4f1ea',
                          borderStyle: volatile ? 'dashed' : 'solid',
                          borderColor: isSelected
                            ? '#111'
                            : volatile
                            ? '#b3452f'
                            : '#ddd8cc',
                          borderWidth: isSelected ? 3 : volatile ? 2 : 1,
                          boxShadow: isMajorityVoter
                            ? 'inset 0 0 0 2px rgba(255,255,255,0.85)'
                            : 'none',
                          cursor: onAreaClick && !dimmed ? 'pointer' : 'default',
                        }}
                      />
                    )
                  })}
                </div>

                <div style={S.foot}>
                  {Object.entries(counts).length === 0 ? (
                    <span style={S.hint}>empty</span>
                  ) : (
                    Object.entries(counts).map(([pid, n]) => (
                      <span key={pid} style={{ ...S.countChip, background: colorOf(pid) }}>
                        {n}
                      </span>
                    ))
                  )}
                  {rightsHolder && (
                    <span style={{ ...S.gerryTag, borderColor: colorOf(rightsHolder) }}>gerry</span>
                  )}
                  {holder && <span style={S.majorityTag}>MAJORITY</span>}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const S = {
  wrap: { background: '#fff', border: '1px solid #d8d2c4', borderRadius: 10, padding: 12 },
  row: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 },
  zone: { border: '1px solid #d8d2c4', borderRadius: 8, padding: 10, minHeight: 118 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, marginBottom: 8 },
  req: { fontSize: 12, color: '#6b6559', fontVariantNumeric: 'tabular-nums' },
  areas: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 },
  area: { borderRadius: '50%', padding: 0 },
  foot: { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  hint: { color: '#8a8478', fontSize: 12 },
  countChip: { display: 'inline-block', minWidth: 16, textAlign: 'center', padding: '1px 5px', borderRadius: 8, fontSize: 10, color: '#fff', marginRight: 3 },
  gerryTag: { fontSize: 9, textTransform: 'uppercase', border: '1px solid', borderRadius: 3, padding: '0 4px', color: '#6b6559' },
  majorityTag: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, background: '#2b2b2b', color: '#fff', borderRadius: 3, padding: '1px 5px' },
}
