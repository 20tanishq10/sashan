// SHASN — auctions (rulebook p.11)
//
//   "Certain events in the game will initiate an auction."
//   "You can bid up to as many resources as your resource cap during an auction.
//    You do not need to hold the number of resources you bid. If you win the bid,
//    you can pay off the bid amount in successive turns."
//   "However, you cannot make any purchases until you have completely paid off
//    your bid."
//   "If nobody places a bid for your auctioned item, discard it and receive the
//    minimum bid value from the Public Reserve."
//
// The unusual part is bidding on CREDIT: your ceiling is your resource cap, not
// what you are holding. Overreach and you win the item but freeze your own
// purchasing until the debt clears — which is the whole tension of the mechanic,
// so the panel shows the shortfall before you commit rather than after.

import { useState } from 'react'
import { RESOURCES, RESOURCE_IDS } from '../lib/shasn/constants'
import * as R from '../lib/shasn/resources'
import * as Cards from '../lib/shasn/cards'

export default function AuctionPanel({ game, me, busy = false, onBid, onClose, onRepay }) {
  const [bids, setBids] = useState({})
  const [repay, setRepay] = useState(R.emptyPool())

  const open = (game.auctions || []).filter((a) => a.status === 'open')
  const debt = me?.auctionDebt || 0

  if (!open.length && debt === 0) {
    return (
      <p style={S.idle}>
        No auction running. Certain cards put an item up for bid — you may bid beyond what you
        hold, and pay it off over later turns (p.11).
      </p>
    )
  }

  const nameOf = (id) => game.players.find((p) => p.id === id)?.name || 'the Reserve'
  const held = R.poolTotal(me?.pool || {})

  return (
    <div style={S.wrap}>
      {open.map((a) => {
        const mine = bids[a.id] ?? a.minBid
        const top = Object.entries(a.bids || {}).sort((x, y) => y[1] - x[1])[0]
        const isSeller = a.sellerId === me?.id
        const myBid = a.bids?.[me?.id]
        const shortfall = Math.max(0, mine - held)

        return (
          <div key={a.id} style={S.auction}>
            <div style={S.head}>
              <span style={S.eyebrow}>
                {a.itemType === 'conspiracy' ? 'Conspiracy Card' : a.itemType} up for auction
              </span>
              <span style={S.min}>from {a.minBid}</span>
            </div>

            {a.sellerId && (
              <p style={S.seller}>Sold by {nameOf(a.sellerId)}</p>
            )}

            {top ? (
              <p style={S.leading}>
                Leading: <strong>{nameOf(top[0])}</strong> at {top[1]}
              </p>
            ) : (
              <p style={S.hint}>No bids yet.</p>
            )}

            {!isSeller && (
              <>
                <div style={S.bidRow}>
                  <button
                    style={S.step}
                    onClick={() => setBids({ ...bids, [a.id]: Math.max(a.minBid, mine - 1) })}
                  >
                    −
                  </button>
                  <span style={S.bidValue}>{mine}</span>
                  <button
                    style={S.step}
                    disabled={mine >= (me?.resourceCap ?? 12)}
                    onClick={() => setBids({ ...bids, [a.id]: mine + 1 })}
                  >
                    +
                  </button>
                  <span style={S.hint}>cap {me?.resourceCap ?? 12}</span>
                </div>

                {shortfall > 0 && (
                  <p style={S.warn}>
                    You hold {held}. Winning at {mine} leaves <strong>{shortfall} owed</strong> —
                    and you cannot buy anything until it is paid.
                  </p>
                )}

                <div style={S.actions}>
                  <button
                    style={S.btn}
                    disabled={busy}
                    onClick={() => onBid({ auctionId: a.id, amount: mine })}
                  >
                    {myBid ? `Raise to ${mine}` : `Bid ${mine}`}
                  </button>
                </div>
              </>
            )}

            {isSeller && (
              <p style={S.hint}>You are selling — you cannot bid on your own item.</p>
            )}

            {/* Anyone may close a settled auction; the engine decides the winner. */}
            <button
              style={{ ...S.ghost, marginTop: 8 }}
              disabled={busy}
              onClick={() => onClose({ auctionId: a.id })}
              title={
                top
                  ? 'Close the bidding and award the item'
                  : 'No bids — the item is discarded and the seller takes the reserve price'
              }
            >
              {top ? 'Close bidding' : 'Close — no bids'}
            </button>
          </div>
        )
      })}

      {/* ── Paying off what you owe ─────────────────────────────────────── */}
      {debt > 0 && (
        <div style={{ ...S.auction, borderColor: '#b3452f' }}>
          <div style={S.head}>
            <span style={{ ...S.eyebrow, color: '#b3452f' }}>You owe {debt}</span>
          </div>
          <p style={S.warn}>
            No purchases until this is cleared (p.11). Pay it down whenever you like.
          </p>

          {RESOURCE_IDS.map((id) => (
            <div key={id} style={S.repayRow}>
              <span style={{ ...S.chip, background: RESOURCES[id].color }}>
                {RESOURCES[id].label}
              </span>
              <button
                style={S.step}
                onClick={() => setRepay({ ...repay, [id]: Math.max(0, repay[id] - 1) })}
              >
                −
              </button>
              <span style={S.num}>{repay[id]}</span>
              <button
                style={S.step}
                disabled={repay[id] >= (me.pool[id] || 0) || R.poolTotal(repay) >= debt}
                onClick={() => setRepay({ ...repay, [id]: repay[id] + 1 })}
              >
                +
              </button>
              <span style={S.hint}>of {me.pool[id] || 0}</span>
            </div>
          ))}

          <div style={S.actions}>
            <button
              style={S.btn}
              disabled={busy || R.poolTotal(repay) < 1}
              onClick={() => {
                onRepay({ payment: repay })
                setRepay(R.emptyPool())
              }}
            >
              Repay {R.poolTotal(repay)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  idle: { fontSize: 11, color: '#8a8478', lineHeight: 1.55, margin: 0, fontStyle: 'italic' },
  auction: { border: '1.5px solid #d8d2c4', borderRadius: 8, padding: 10, background: '#fff' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  eyebrow: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: '#6b6559', fontWeight: 700 },
  min: { fontSize: 10, color: '#8a8478' },
  seller: { fontSize: 11, color: '#6b6559', margin: '5px 0 0' },
  leading: { fontSize: 12, margin: '6px 0 0' },
  hint: { fontSize: 10.5, color: '#8a8478', margin: '6px 0 0', fontStyle: 'italic' },
  warn: { fontSize: 10.5, color: '#b3452f', margin: '6px 0 0', lineHeight: 1.45 },
  bidRow: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 9 },
  bidValue: { fontSize: 20, fontWeight: 700, minWidth: 26, textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
  repayRow: { display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 },
  chip: { padding: '2px 7px', borderRadius: 9, fontSize: 10, color: '#fff', whiteSpace: 'nowrap', minWidth: 84 },
  step: { width: 21, height: 21, border: '1px solid #d8d2c4', background: '#fff', borderRadius: 4, cursor: 'pointer', lineHeight: 1 },
  num: { minWidth: 14, textAlign: 'center', fontSize: 12 },
  actions: { display: 'flex', gap: 7, marginTop: 10 },
  btn: { padding: '7px 14px', background: '#3d5145', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12.5, cursor: 'pointer' },
  ghost: { padding: '5px 10px', background: '#fff', border: '1px solid #d8d2c4', borderRadius: 6, fontSize: 11, cursor: 'pointer' },
}
