// SHASN — what is for sale, down the right.
//
// The market used to be a horizontal strip above the board, which cost the
// board height it could not spare — the map is portrait, so height is the only
// dimension it can grow in. Stacked vertically in a gutter it costs the board
// nothing at all, because a portrait map cannot use that width anyway.
//
// Three face-up Voter Cards (p.9), then the two decks, then the log. The log is
// last because it is reference rather than action.

import VoterCardRow from '../VoterCardRow'
import DeckStrip from '../DeckStrip'
import GameLog from '../GameLog'

export default function MarketRail({
  market,
  pool,
  onSelect,
  selectedIndex,
  disabled,
  conspiracyDeck,
  headlineDeck,
  pendingHeadlines,
  canBuy,
  surcharge,
  hand,
  onBuyConspiracy,
  log,
}) {
  return (
    <aside className="room-rail" aria-label="Market">
      <section style={S.box}>
        <h3 style={S.head}>Voters</h3>
        <VoterCardRow
          market={market}
          pool={pool}
          onSelect={onSelect}
          selectedIndex={selectedIndex}
          disabled={disabled}
          column
        />
      </section>

      <section style={S.box}>
        <h3 style={S.head}>Decks</h3>
        <DeckStrip
          conspiracyDeck={conspiracyDeck}
          headlineDeck={headlineDeck}
          pendingHeadlines={pendingHeadlines}
          canBuy={canBuy}
          surcharge={surcharge}
          hand={hand}
          onBuyConspiracy={onBuyConspiracy}
        />
      </section>

      {/* GameLog brings its own panel and header, so it is not wrapped again. */}
      {log?.length > 0 && (
        <div style={S.logScroll}>
          <GameLog log={log} />
        </div>
      )}
    </aside>
  )
}

const S = {
  box: {
    backgroundColor: 'var(--lacquer-2)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,220,150,.06), transparent 40%)',
    border: '1px solid rgba(217,173,62,.3)',
    borderRadius: 'var(--r-lg)',
    padding: 12,
    boxShadow: 'var(--sh-2)',
  },
  head: {
    fontFamily: 'var(--head)',
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--brass)',
    margin: '0 0 10px',
  },
  logScroll: { maxHeight: 260, overflowY: 'auto', flexShrink: 0 },
}
