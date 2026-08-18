// SHASN — the Voter Card strip that sits along the top of the board.
//
// The printed board has five slots across the top: VOTER CARDS (draw pile),
// three face-up VOTERS slots, and DISCARD VOTERS.
//
// Rules shown here (p.9):
//   - three open Voter Cards must always be available
//   - a card's cost is a row of resource pips; a white pip is any resource
//   - the big number is how many voters it yields (1, 2 or 3)
//   - influencing discards the card and immediately flips a replacement

import { RESOURCES, RESOURCE_IDS } from '../lib/shasn/constants'
import * as Voter from '../lib/shasn/voterCards'
import * as R from '../lib/shasn/resources'

export default function VoterCardRow({
  market,
  pool,
  discounts = [],
  onSelect,
  selectedIndex = null,
  disabled = false,
}) {
  const offers = pool ? Voter.affordableCards(market, pool, discounts) : []
  const drawSize = market.drawPileSize ?? market.drawPile?.length ?? 0
  const discardSize = market.discard?.length ?? 0

  return (
    <div style={S.row}>
      <Slot label="Voter Cards" sub={`${drawSize} left`}>
        <div style={S.deckBack}>
          <span style={S.deckText}>VOTERS</span>
        </div>
      </Slot>

      {market.open.map((cardId, i) => {
        const card = Voter.getVoterCard(cardId)
        const offer = offers[i]
        const cost = offer ? offer.cost : card.cost
        const affordable = offer ? offer.affordable : false
        const selected = selectedIndex === i
        const clickable = !disabled && onSelect && affordable

        return (
          <Slot key={`${cardId}-${i}`} label="Voters">
            <div
              onClick={clickable ? () => onSelect(i) : undefined}
              style={{
                ...S.card,
                cursor: clickable ? 'pointer' : 'default',
                opacity: disabled ? 0.55 : affordable ? 1 : 0.5,
                borderColor: selected ? '#2b2b2b' : '#d8d2c4',
                borderWidth: selected ? 3 : 1,
                transform: selected ? 'translateY(-4px)' : 'none',
              }}
              title={
                affordable
                  ? `${card.voters} voter${card.voters > 1 ? 's' : ''} — click, then pick areas in one zone`
                  : 'You cannot afford this card'
              }
            >
              <div style={S.voters}>{card.voters}</div>
              <div style={S.pips}>
                {RESOURCE_IDS.flatMap((id) =>
                  Array.from({ length: cost[id] || 0 }, (_, k) => (
                    <span
                      key={`${id}${k}`}
                      style={{ ...S.pip, background: RESOURCES[id].color }}
                      title={RESOURCES[id].label}
                    />
                  ))
                )}
                {Array.from({ length: cost.any || 0 }, (_, k) => (
                  <span
                    key={`any${k}`}
                    style={{ ...S.pip, background: '#fff', border: '1.5px solid #8a8478' }}
                    title="Any resource of your choice"
                  />
                ))}
              </div>
              <div style={S.costTotal}>{R.costTotal(cost)}</div>
            </div>
          </Slot>
        )
      })}

      <Slot label="Discard" sub={`${discardSize}`}>
        <div style={S.discard} />
      </Slot>
    </div>
  )
}

function Slot({ label, sub, children }) {
  return (
    <div style={S.slot}>
      {children}
      <span style={S.slotLabel}>
        {label}
        {sub && <em style={S.slotSub}>{sub}</em>}
      </span>
    </div>
  )
}

const S = {
  row: {
    display: 'flex',
    gap: 10,
    justifyContent: 'center',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    background: '#3a2f26',
    padding: '12px 14px 9px',
    borderRadius: '12px 12px 4px 4px',
  },
  slot: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 },
  slotLabel: {
    fontSize: 8.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: '#c8bda9',
    display: 'flex',
    gap: 5,
    alignItems: 'baseline',
  },
  slotSub: { fontStyle: 'normal', opacity: 0.75 },
  card: {
    width: 74,
    height: 96,
    background: '#fdfcf8',
    border: '1px solid #d8d2c4',
    borderRadius: 7,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    transition: 'transform .12s ease',
    position: 'relative',
  },
  voters: { fontSize: 34, fontWeight: 700, lineHeight: 1, color: '#2b2b2b' },
  pips: { display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 62 },
  pip: { width: 11, height: 11, borderRadius: '50%', display: 'inline-block' },
  costTotal: {
    position: 'absolute', top: 4, right: 6, fontSize: 9, color: '#8a8478',
  },
  deckBack: {
    width: 74, height: 96, borderRadius: 7,
    background: 'repeating-linear-gradient(135deg,#4d5f50,#4d5f50 6px,#455845 6px,#455845 12px)',
    border: '1px solid #2f3a30', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  deckText: {
    fontSize: 9, letterSpacing: 1.5, color: '#dfe6dc',
    writingMode: 'vertical-rl', textOrientation: 'mixed',
  },
  discard: {
    width: 74, height: 96, borderRadius: 7,
    border: '2px dashed #6d6152', background: '#00000022',
  },
}
