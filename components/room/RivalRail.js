// SHASN — everyone else, in one place.
//
// Rivals used to appear twice: as chips in the header and as mats beside the
// board. Same information, two shapes, neither complete. They are now one
// column in turn order, which means the column IS the turn order — so the chips
// had nothing left to say and went.
//
// Selecting a rival lifts their territory on the map and drops everything else
// back. That turns the column from a scoreboard into a way of reading the
// board: "where is Bo actually strong" stops being a counting exercise.
//
// The auction and trading panels hang off the bottom of this rail, and only
// when they have something in them.

import PlayerMat from '../PlayerMat'

export default function RivalRail({
  players,
  activeId,
  myPlayerId,
  standings,
  colorOf,
  partyOf,
  board,
  focusedId = null,
  onFocus,
  children, // auction and trading, when live
}) {
  const rivals = players.filter((p) => p.id !== myPlayerId)

  return (
    <aside className="room-rail" aria-label="Other players">
      {rivals.map((p) => {
        const focused = focusedId === p.id
        return (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => onFocus?.(focused ? null : p.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onFocus?.(focused ? null : p.id)
              }
            }}
            aria-pressed={focused}
            title={
              focused
                ? `Showing ${p.name}'s territory — click to release`
                : `Show ${p.name}'s territory on the map`
            }
            style={{
              ...S.seat,
              // The lift is a border, not a fill: the mat inside already carries
              // the player's colour and a second one would fight it.
              borderColor: focused ? colorOf(p.id) : 'transparent',
              boxShadow: focused ? `0 0 0 1px ${colorOf(p.id)}` : 'none',
            }}
          >
            <PlayerMat
              player={p}
              color={colorOf(p.id)}
              party={partyOf(p.id)}
              board={board}
              isActive={p.id === activeId}
              score={standings.find((s) => s.playerId === p.id)?.score ?? 0}
              variant="compact"
            />
          </div>
        )
      })}

      {children}
    </aside>
  )
}

const S = {
  seat: {
    // The whole card is the target rather than a small affordance in a corner.
    // A div rather than a button on purpose: the compact mat renders its own
    // buttons for the resource chain, and a button inside a button is invalid.
    display: 'block',
    width: '100%',
    padding: 2,
    background: 'none',
    border: '2px solid transparent',
    borderRadius: 'calc(var(--r-lg) + 3px)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 180ms var(--ease-out), box-shadow 180ms var(--ease-out)',
  },
}
