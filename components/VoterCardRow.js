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
import CardStack from './CardStack'
import Card from './Card'
import IdeologueMark from './IdeologueMark'

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
      <CardStack
        label="Voter Cards"
        caption="Draw pile"
        count={drawSize}
        vertical={false}
        width={74}
        height={96}
      />

      {market.open.map((cardId, i) => {
        const card = Voter.getVoterCard(cardId)
        const offer = offers[i]
        const cost = offer ? offer.cost : card.cost
        const affordable = offer ? offer.affordable : false
        const selected = selectedIndex === i
        const clickable = !disabled && onSelect && affordable

        return (
          <Slot key={`${cardId}-${i}`} label="Voters">
            <Card
              deck="voter"
              compact
              width={82}
              badge={R.costTotal(cost)}
              selected={selected}
              disabled={disabled || !affordable}
              onClick={clickable ? () => onSelect(i) : null}
              title_={
                affordable
                  ? `${card.voters} voter${card.voters > 1 ? 's' : ''} — click, then pick areas in one zone`
                  : 'You cannot afford this card'
              }
              title={<span style={S.voters}>{card.voters}</span>}
              subtitle={card.voters === 1 ? 'voter' : 'voters'}
            >
              {/* Cost pips carry their Ideologue mark, exactly as the resource
                  tokens on your mat do, so what a card costs and what you hold
                  are written in the same alphabet. A hollow pip is a wildcard. */}
              <div style={S.pips}>
                {RESOURCE_IDS.flatMap((id) =>
                  Array.from({ length: cost[id] || 0 }, (_, k) => (
                    <span
                      key={`${id}${k}`}
                      style={{ ...S.pip, background: RESOURCES[id].color }}
                      title={RESOURCES[id].label}
                    >
                      <IdeologueMark
                        ideologue={RESOURCES[id].ideologue}
                        size={9}
                        color={RESOURCES[id].ink || '#ffffff'}
                        stroke={4.5}
                      />
                    </span>
                  ))
                )}
                {Array.from({ length: cost.any || 0 }, (_, k) => (
                  <span
                    key={`any${k}`}
                    style={{
                      ...S.pip,
                      background: 'var(--surface)',
                      border: '1.5px dashed var(--ink-3)',
                      color: 'var(--ink-3)',
                      fontSize: 9,
                      fontWeight: 700,
                    }}
                    title="Any resource of your choice"
                  >
                    ?
                  </span>
                ))}
              </div>
            </Card>
          </Slot>
        )
      })}

      <CardStack
        label="Discard"
        caption="Discard voters"
        count={discardSize}
        empty={discardSize === 0}
        vertical={false}
        width={74}
        height={96}
      />
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
    background: 'var(--board-bg)',
    padding: '12px 14px 9px',
    borderRadius: '12px 12px 4px 4px',
  },
  slot: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 },
  slotLabel: {
    fontSize: 8.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'var(--ink-3)',
    display: 'flex',
    gap: 5,
    alignItems: 'baseline',
  },
  slotSub: { fontStyle: 'normal', opacity: 0.75 },
  voters: { fontSize: 30, fontWeight: 650, lineHeight: 1.05, color: 'var(--ink)' },
  pips: { display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 66 },
  pip: {
    width: 14, height: 14, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
}
