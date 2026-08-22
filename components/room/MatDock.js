// SHASN — your mat, docked.
//
// It used to be a window you could drag, resize and fold away, which sounds
// generous and in practice meant the thing you look at most was floating over
// the board it exists to support. Docked, it costs the board a fixed strip of
// height and never covers it.
//
// It is one bar, at one height, always.
//
// It used to fork on screen height: tall screens got the whole mat. Measured on
// a 936px-tall screen that mat was 374px — 40% of the viewport — and the board
// is portrait, so its width is decided entirely by the height left over. The
// mat was costing the board roughly 200px of WIDTH in order to show four cards.
//
// So there is no fork any more. The counts that mattered are in this bar, and
// the powers moved to the command bar, where the rest of your actions already
// were. Nothing that lived on the mat lost its home — see tests/room.test.mjs,
// which checks exactly that, because deleting a surface is how features quietly
// become unreachable.

import ResourceChain from '../ResourceChain'
import PartyEmblem from '../PartyEmblem'
import IdeologueMark from '../IdeologueMark'
import MatStatus from '../MatStatus'
import { IDEOLOGUES, IDEOLOGUE_IDS } from '../../lib/shasn/constants'
import * as Ideology from '../../lib/shasn/ideology'
import * as R from '../../lib/shasn/resources'

export default function MatDock({
  player,
  color,
  party,
  board,
  isMyTurn,
  score,
  discardSelection,
  onDiscardToken,
  commandBar,
}) {
  if (!player) return null

  const counts = Ideology.ideologueCounts(player.ideologyCards)
  const total = R.poolTotal(player.pool)

  return (
    <div style={S.dock}>
      <div className="room-dock--summary" style={S.summary}>
        <span style={S.who}>
          {party && <PartyEmblem party={party} size={15} color={color} />}
          <strong style={S.name}>{player.name}</strong>
          <span style={S.score}>{score} pts</span>
        </span>

        {/* The chain is clickable here, not merely readable. Discarding down to
            the resource cap is done by lifting tokens off it, and this bar is
            now the only chain of your own on the screen — without these two
            props that whole flow would have nowhere to happen. */}
        <span style={S.chain}>
          <ResourceChain
            pool={player.pool}
            cap={player.resourceCap}
            size={20}
            compact
            selected={discardSelection}
            onTokenClick={onDiscardToken}
          />
        </span>

        <span style={S.counts}>
          {IDEOLOGUE_IDS.map((id) => (
            <span
              key={id}
              style={S.count}
              title={`${IDEOLOGUES[id].label}: ${counts[id]} card${
                counts[id] === 1 ? '' : 's'
              }${counts[id] < 3 ? ` — ${3 - counts[id]} more to Level 3` : ''}`}
            >
              <IdeologueMark
                ideologue={id}
                size={12}
                color={IDEOLOGUES[id].color}
                stroke={2.6}
              />
              {counts[id]}
            </span>
          ))}
          <span style={S.held}>
            {total}/{player.resourceCap}
          </span>
        </span>

        <MatStatus player={player} board={board} compact max={2} />

        {commandBar && <span style={S.commandsInline}>{commandBar}</span>}
      </div>
    </div>
  )
}

const S = {
  dock: {
    borderTop: '1px solid rgba(217,173,62,.3)',
    background: 'linear-gradient(180deg, rgba(0,0,0,.3), transparent)',
  },

  summary: {
    // `display` is set in globals.css; this is everything else.
    alignItems: 'center',
    gap: 16,
    padding: '8px 16px',
    flexWrap: 'wrap',
  },
  who: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  name: { fontFamily: 'var(--display)', fontSize: 17, color: 'var(--ivory)' },
  score: {
    fontSize: 12,
    color: 'var(--brass)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  chain: { flex: '1 1 220px', minWidth: 160, maxWidth: 420 },
  counts: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  count: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 12,
    color: 'var(--ink-on-dark-2)',
    fontVariantNumeric: 'tabular-nums',
  },
  held: {
    fontSize: 12,
    color: 'var(--brass)',
    fontVariantNumeric: 'tabular-nums',
    paddingLeft: 4,
  },
  commandsInline: { flexBasis: '100%' },
}
