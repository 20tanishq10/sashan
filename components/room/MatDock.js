// SHASN — your mat, docked.
//
// It used to be a window you could drag, resize and fold away, which sounds
// generous and in practice meant the thing you look at most was floating over
// the board it exists to support. Docked, it costs the board a fixed strip of
// height and never covers it.
//
// Two forms rather than a drag handle:
//
//   full     — the whole mat, on a screen with the height to spare
//   summary  — one bar with the numbers you need mid-turn, when there is not
//
// Which one you get is a media query rather than a preference, because the
// question is not what you would like, it is whether the pixels exist. Both
// carry the command bar, since your options belong with your resources.

import PlayerMat from '../PlayerMat'
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
  justTucked,
  discardSelection,
  onDiscardToken,
  powerActionFor,
  onUsePower,
  commandBar,
}) {
  if (!player) return null

  const counts = Ideology.ideologueCounts(player.ideologyCards)
  const total = R.poolTotal(player.pool)

  return (
    <div style={S.dock}>
      {/* Tall enough for the whole mat. */}
      <div className="room-dock--full" style={S.full}>
        <div style={S.matWrap}>
          <PlayerMat
            player={player}
            color={color}
            party={party}
            board={board}
            isActive={isMyTurn}
            isYou
            score={score}
            variant="full"
            justTucked={justTucked}
            discardSelection={discardSelection}
            onDiscardToken={onDiscardToken}
            powerActionFor={powerActionFor}
            onUsePower={onUsePower}
          />
        </div>
        {commandBar && <div style={S.commands}>{commandBar}</div>}
      </div>

      {/* Not tall enough. The board keeps the difference. */}
      <div className="room-dock--summary" style={S.summary}>
        <span style={S.who}>
          {party && <PartyEmblem party={party} size={15} color={color} />}
          <strong style={S.name}>{player.name}</strong>
          <span style={S.score}>{score} pts</span>
        </span>

        <span style={S.chain}>
          <ResourceChain pool={player.pool} cap={player.resourceCap} size={20} compact />
        </span>

        <span style={S.counts}>
          {IDEOLOGUE_IDS.map((id) => (
            <span key={id} style={S.count} title={`${IDEOLOGUES[id].label}: ${counts[id]}`}>
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

  full: { display: 'block', padding: '10px 16px 12px' },
  matWrap: { maxWidth: 1180, margin: '0 auto' },
  commands: { maxWidth: 1180, margin: '10px auto 0' },

  summary: {
    // `display` is set by the media query; this is everything else.
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
