// SHASN — the board, and the one line under it.
//
// The board owns the centre column and takes every pixel of height left after
// the header and the dock. That is the whole point of the restructure: the map
// is portrait, so height is the only dimension it can grow in, and it used to be
// spending that on a panel above it and sitting below the fold.
//
// The prompt is one line, directly under the board, because that is where you
// are already looking when you are being asked to click something. It used to be
// a paragraph in a panel four hundred pixels away.
//
// The zone card floats at the top-left of the stage rather than following the
// pointer: a card chasing the cursor covers the thing you are inspecting.

import ShasnBoard from '../ShasnBoard'
import ZoneCard from './ZoneCard'

export default function BoardStage({
  board,
  players,
  colorOf,
  partyOf,
  myPlayerId,
  selectedAreas,
  legalZones,
  onAreaClick,
  focusPlayerId,
  hoveredZone,
  onZoneHover,
  orientation = 'landscape', // the map turned a quarter turn; see ShasnBoard
  prompt,       // { text, onCancel } — the current instruction, if any
  focusedName,  // whose territory is being shown, if any
  onReleaseFocus,
}) {
  return (
    <div className="room-board">
      <div style={S.stage}>
        <ShasnBoard
          board={board}
          players={players}
          colorOf={colorOf}
          partyOf={partyOf}
          fit="height"
          orientation={orientation}
          legalZones={legalZones}
          selectedAreas={selectedAreas}
          onAreaClick={onAreaClick}
          focusPlayerId={focusPlayerId}
          onZoneHover={onZoneHover}
        />

        {hoveredZone && (
          <div style={S.zoneCard}>
            <ZoneCard
              zoneId={hoveredZone}
              board={board}
              players={players}
              colorOf={colorOf}
              myPlayerId={myPlayerId}
            />
          </div>
        )}

        {/* Reading someone else's territory is a mode, and a mode you can enter
            by accident needs a visible way out. */}
        {focusedName && (
          <button type="button" onClick={onReleaseFocus} style={S.focusChip}>
            Showing {focusedName}&apos;s territory — release
          </button>
        )}
      </div>

      {prompt && (
        <p style={S.prompt}>
          {prompt.text}
          {prompt.onCancel && (
            <button type="button" style={S.cancel} onClick={prompt.onCancel}>
              cancel
            </button>
          )}
        </p>
      )}
    </div>
  )
}

const S = {
  stage: { position: 'relative', minHeight: 0, flex: 1, display: 'flex', justifyContent: 'center' },

  zoneCard: { position: 'absolute', top: 8, left: 8, zIndex: 5 },

  focusChip: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 5,
    fontFamily: 'var(--head)',
    fontSize: 11,
    letterSpacing: '0.06em',
    padding: '5px 12px',
    borderRadius: 999,
    border: '1px solid var(--brass-dark)',
    background: 'linear-gradient(180deg, var(--lacquer-3), var(--lacquer-2))',
    color: 'var(--brass-light)',
    cursor: 'pointer',
    boxShadow: 'var(--sh-2)',
  },

  prompt: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    maxWidth: '100%',
    padding: '7px 16px',
    borderRadius: 999,
    border: '1px solid var(--amber-brd)',
    background: 'var(--amber-bg)',
    color: 'var(--brass-light)',
    fontSize: 13.5,
    boxShadow: 'var(--sh-2)',
  },
  cancel: {
    border: 'none',
    background: 'none',
    color: 'var(--brass)',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: 12.5,
    padding: 0,
  },
}
