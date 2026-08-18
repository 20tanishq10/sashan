// SHASN — trading (rulebook p.11)
//
//   "You can trade resources and Conspiracy Cards with opponents."
//   "You can trade resources with other players in any ratio. At least 1 resource
//    must be exchanged by both parties. At least 1 player must be the active
//    player for a trade to occur."
//   "You can initiate a trade at any point during your turn."
//
// A trade is an agreement, so this is a negotiation rather than a button:
// propose → accept, decline, or counter. Nothing moves until both sides agree.
//
// HIDDEN HANDS
//   Conspiracy Cards are private, so you cannot name a card in someone else's
//   hand. You ask for a NUMBER of cards and they choose which to hand over —
//   exactly what happens at a table when you say "and one of your conspiracies".
//   Your own side names exact cards, because you can see them.

import { useState } from 'react'
import { RESOURCES, RESOURCE_IDS } from '../lib/shasn/constants'
import * as R from '../lib/shasn/resources'
import * as Cards from '../lib/shasn/cards'

export default function TradePanel({
  game,
  me,
  isMyTurn,
  busy = false,
  onPropose,
  onRespond,
}) {
  const [target, setTarget] = useState(null)
  const [offer, setOffer] = useState(R.emptyPool())
  const [request, setRequest] = useState(R.emptyPool())
  const [offerCards, setOfferCards] = useState([])
  const [wantCards, setWantCards] = useState(0)
  const [countering, setCountering] = useState(null)
  const [giving, setGiving] = useState({}) // tradeId -> chosen card ids

  const trades = (game.pendingTrades || []).filter((t) => t.status === 'pending')
  const incoming = trades.filter((t) => t.targetId === me.id)
  const outgoing = trades.filter((t) => t.proposerId === me.id)
  const opponents = game.players.filter((p) => p.id !== me.id)
  const activeId = game.players[game.activeSeat]?.id

  // p.11 — one side of any trade must be the player whose turn it is.
  const canTradeWith = (id) => isMyTurn || id === activeId

  const nameOf = (id) => game.players.find((p) => p.id === id)?.name || 'someone'

  function reset() {
    setTarget(null)
    setOffer(R.emptyPool())
    setRequest(R.emptyPool())
    setOfferCards([])
    setWantCards(0)
    setCountering(null)
  }

  const offerTotal = R.poolTotal(offer)
  const requestTotal = R.poolTotal(request)
  const targetPlayer = target ? game.players.find((p) => p.id === target) : null
  const theirCardCount = targetPlayer?.conspiracyCardCount ?? 0
  const valid =
    target && offerTotal >= 1 && requestTotal >= 1 && wantCards <= theirCardCount

  return (
    <div style={S.wrap}>
      {/* ── Offers waiting on you ───────────────────────────────────────── */}
      {incoming.length > 0 && (
        <div style={S.section}>
          <h4 style={{ ...S.h4, color: '#b3452f' }}>
            {incoming.length} offer{incoming.length === 1 ? '' : 's'} for you
          </h4>
          {incoming.map((t) => {
            const need = t.request.conspiracyCardCount || 0
            const chosen = giving[t.id] || []
            const ready = chosen.length === need
            return (
              <div key={t.id} style={{ ...S.offer, borderColor: '#b3452f' }}>
                <TradeTerms trade={t} nameOf={nameOf} youAre="target" />

                {need > 0 && (
                  <div style={S.cardPick}>
                    <span style={S.pickLabel}>
                      Choose {need} of your Conspiracy Cards to give ({chosen.length}/{need})
                    </span>
                    <div style={S.row}>
                      {me.conspiracyCards.map((cid, i) => {
                        const key = `${cid}#${i}`
                        const on = chosen.includes(key)
                        return (
                          <button
                            key={key}
                            style={{ ...S.cardChip, borderColor: on ? '#2b2b2b' : '#d8d2c4' }}
                            onClick={() =>
                              setGiving({
                                ...giving,
                                [t.id]: on
                                  ? chosen.filter((c) => c !== key)
                                  : chosen.length < need
                                  ? [...chosen, key]
                                  : chosen,
                              })
                            }
                          >
                            {Cards.getConspiracyCard(cid)?.name || cid}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div style={S.actions}>
                  <button
                    style={S.accept}
                    disabled={busy || !ready}
                    onClick={() =>
                      onRespond({
                        tradeId: t.id,
                        action: 'accept',
                        // Strip the de-duplication suffix before sending.
                        giveCards: (giving[t.id] || []).map((k) => k.split('#')[0]),
                      })
                    }
                  >
                    Accept
                  </button>
                  <button
                    style={S.ghost}
                    disabled={busy}
                    onClick={() => onRespond({ tradeId: t.id, action: 'decline' })}
                  >
                    Decline
                  </button>
                  <button
                    style={S.ghost}
                    disabled={busy}
                    onClick={() => {
                      // Seed the form with the mirror of their offer.
                      setCountering(t.id)
                      setTarget(t.proposerId)
                      setOffer({ ...R.emptyPool(), ...t.request.resources })
                      setRequest({ ...R.emptyPool(), ...t.offer.resources })
                      setOfferCards([])
                      setWantCards((t.offer.conspiracyCards || []).length)
                    }}
                  >
                    Counter
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Your open offers ────────────────────────────────────────────── */}
      {outgoing.length > 0 && (
        <div style={S.section}>
          <h4 style={S.h4}>Waiting on them</h4>
          {outgoing.map((t) => (
            <div key={t.id} style={S.offer}>
              <TradeTerms trade={t} nameOf={nameOf} youAre="proposer" />
              <div style={S.actions}>
                <button
                  style={S.ghost}
                  disabled={busy}
                  onClick={() => onRespond({ tradeId: t.id, action: 'withdraw' })}
                >
                  Withdraw
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Build an offer ──────────────────────────────────────────────── */}
      <div style={S.section}>
        <h4 style={S.h4}>{countering ? 'Counter-offer' : 'Propose a trade'}</h4>

        {!isMyTurn && !opponents.some((o) => canTradeWith(o.id)) ? (
          <p style={S.hint}>
            You can only trade on your own turn, or with whoever is playing (p.11).
          </p>
        ) : (
          <>
            <div style={S.row}>
              {opponents.map((o) => (
                <button
                  key={o.id}
                  disabled={!canTradeWith(o.id)}
                  onClick={() => setTarget(o.id)}
                  style={{
                    ...S.ghost,
                    borderColor: target === o.id ? '#2b2b2b' : '#d8d2c4',
                    opacity: canTradeWith(o.id) ? 1 : 0.4,
                  }}
                  title={canTradeWith(o.id) ? '' : 'Neither of you is the active player'}
                >
                  {o.name}
                  {o.id === activeId && <em style={S.playing}> playing</em>}
                </button>
              ))}
            </div>

            {target && (
              <div style={S.builder}>
                <Side
                  label="You give"
                  pool={offer}
                  max={me.pool}
                  onChange={setOffer}
                  cards={me.conspiracyCards}
                  selectedCards={offerCards}
                  onCardsChange={setOfferCards}
                />

                <span style={S.swap}>⇄</span>

                <Side
                  label={`${nameOf(target)} gives`}
                  pool={request}
                  max={targetPlayer.pool}
                  onChange={setRequest}
                  cardCount={wantCards}
                  maxCardCount={theirCardCount}
                  onCardCountChange={setWantCards}
                />
              </div>
            )}

            {target && (
              <>
                <p style={S.rule}>
                  Both sides must move at least one resource. Any ratio is legal.
                </p>
                <div style={S.actions}>
                  <button
                    style={S.accept}
                    disabled={busy || !valid}
                    onClick={() => {
                      onPropose({
                        targetId: target,
                        offer: {
                          resources: offer,
                          conspiracyCards: offerCards.map((k) => k.split('#')[0]),
                        },
                        request: { resources: request, conspiracyCardCount: wantCards },
                        counterTo: countering,
                      })
                      reset()
                    }}
                  >
                    {countering ? 'Send counter' : 'Send offer'}
                  </button>
                  <button style={S.ghost} onClick={reset}>cancel</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TradeTerms({ trade, nameOf, youAre }) {
  const them = youAre === 'target' ? trade.proposerId : trade.targetId
  const theirCards = trade.offer.conspiracyCardCount ?? (trade.offer.conspiracyCards || []).length

  return (
    <div style={S.terms}>
      <span style={S.who}>{nameOf(them)}</span>
      <div style={S.termRow}>
        <span style={S.termLabel}>{youAre === 'target' ? 'gives you' : 'you give'}</span>
        <Pips pool={trade.offer.resources} extra={theirCards ? `${theirCards} card` : null} />
      </div>
      <div style={S.termRow}>
        <span style={S.termLabel}>{youAre === 'target' ? 'wants' : 'they give'}</span>
        <Pips
          pool={trade.request.resources}
          extra={
            trade.request.conspiracyCardCount
              ? `${trade.request.conspiracyCardCount} card`
              : null
          }
        />
      </div>
    </div>
  )
}

function Pips({ pool, extra }) {
  const parts = RESOURCE_IDS.filter((id) => (pool?.[id] || 0) > 0)
  if (!parts.length && !extra) return <span style={S.hint}>nothing</span>
  return (
    <span style={S.row}>
      {parts.map((id) => (
        <span key={id} style={{ ...S.chip, background: RESOURCES[id].color }}>
          {pool[id]} {RESOURCES[id].label}
        </span>
      ))}
      {extra && <span style={{ ...S.chip, background: '#5f7167' }}>{extra}</span>}
    </span>
  )
}

function Side({
  label,
  pool,
  max,
  onChange,
  cards = null,
  selectedCards = [],
  onCardsChange,
  cardCount = null,
  maxCardCount = 0,
  onCardCountChange,
}) {
  return (
    <div style={S.side}>
      <span style={S.sideLabel}>{label}</span>
      {RESOURCE_IDS.map((id) => (
        <div key={id} style={S.stepRow}>
          <span style={{ ...S.chip, background: RESOURCES[id].color }}>
            {RESOURCES[id].label}
          </span>
          <button
            style={S.step}
            onClick={() => onChange({ ...pool, [id]: Math.max(0, pool[id] - 1) })}
          >
            −
          </button>
          <span style={S.num}>{pool[id]}</span>
          <button
            style={S.step}
            disabled={pool[id] >= (max[id] || 0)}
            onClick={() => onChange({ ...pool, [id]: pool[id] + 1 })}
          >
            +
          </button>
          <span style={S.have}>of {max[id] || 0}</span>
        </div>
      ))}

      {/* Your own cards are named; theirs are only counted. */}
      {cards && cards.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <span style={S.pickLabel}>Conspiracy Cards</span>
          <div style={S.row}>
            {cards.map((cid, i) => {
              const key = `${cid}#${i}`
              const on = selectedCards.includes(key)
              return (
                <button
                  key={key}
                  style={{ ...S.cardChip, borderColor: on ? '#2b2b2b' : '#d8d2c4' }}
                  onClick={() =>
                    onCardsChange(
                      on ? selectedCards.filter((c) => c !== key) : [...selectedCards, key]
                    )
                  }
                >
                  {Cards.getConspiracyCard(cid)?.name || cid}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {cardCount !== null && (
        <div style={{ ...S.stepRow, marginTop: 6 }}>
          <span style={{ ...S.chip, background: '#5f7167' }}>Conspiracy Cards</span>
          <button
            style={S.step}
            onClick={() => onCardCountChange(Math.max(0, cardCount - 1))}
          >
            −
          </button>
          <span style={S.num}>{cardCount}</span>
          <button
            style={S.step}
            disabled={cardCount >= maxCardCount}
            onClick={() => onCardCountChange(cardCount + 1)}
          >
            +
          </button>
          <span style={S.have}>of {maxCardCount}</span>
        </div>
      )}
      {cardCount !== null && cardCount > 0 && (
        <span style={S.hint}>They choose which — you cannot see their hand.</span>
      )}
    </div>
  )
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  section: { borderTop: '1px solid #efe8d6', paddingTop: 10 },
  h4: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: '#6b6559', margin: '0 0 8px' },
  hint: { fontSize: 11, color: '#8a8478', fontStyle: 'italic' },
  row: { display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' },

  offer: { border: '1.5px solid #d8d2c4', borderRadius: 8, padding: 10, marginBottom: 8, background: '#fff' },
  terms: { display: 'flex', flexDirection: 'column', gap: 5 },
  who: { fontSize: 13, fontWeight: 700 },
  termRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  termLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: '#8a8478', minWidth: 62 },
  chip: { padding: '2px 8px', borderRadius: 10, fontSize: 10.5, color: '#fff', whiteSpace: 'nowrap' },

  cardPick: { marginTop: 9 },
  pickLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: '#8a8478', display: 'block', marginBottom: 4 },
  cardChip: { fontSize: 10, padding: '3px 8px', border: '1.5px solid', borderRadius: 6, background: '#fff', cursor: 'pointer' },

  actions: { display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' },
  accept: { padding: '7px 14px', background: '#3d5145', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  ghost: { padding: '6px 11px', background: '#fff', border: '1px solid #d8d2c4', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  playing: { fontStyle: 'normal', fontSize: 9, color: '#8a8478' },

  builder: { display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, flexWrap: 'wrap' },
  side: { flex: '1 1 210px', display: 'flex', flexDirection: 'column', gap: 4, background: '#fff', border: '1px solid #efe8d6', borderRadius: 8, padding: 9 },
  sideLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, color: '#6b6559', marginBottom: 3 },
  swap: { alignSelf: 'center', fontSize: 18, color: '#8a8478' },
  stepRow: { display: 'flex', alignItems: 'center', gap: 4 },
  step: { width: 20, height: 20, border: '1px solid #d8d2c4', background: '#fff', borderRadius: 4, cursor: 'pointer', lineHeight: 1 },
  num: { minWidth: 14, textAlign: 'center', fontSize: 12 },
  have: { fontSize: 9.5, color: '#a8a294' },
  rule: { fontSize: 10.5, color: '#8a8478', margin: '8px 0 0', fontStyle: 'italic' },
}
