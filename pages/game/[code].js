// SHASN — multiplayer game room
//
// Drives lib/shasn through /api/game-action. The server holds the authoritative
// game object and enforces turn ownership; this page only renders and submits.
//
// Sync is Supabase Realtime on the game_state row, with a 4s poll as a fallback
// for when the socket drops.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getOrCreateSessionToken, getStoredPlayer, storePlayer } from '../../lib/session'
import { getSupabase } from '../../lib/supabaseClient'
import ShasnBoard, { colorForSeat } from '../../components/ShasnBoard'
import CardResolver from '../../components/CardResolver'
import IdeologyPrompt from '../../components/IdeologyPrompt'
import InterruptPrompt from '../../components/InterruptPrompt'
import Scoreboard from '../../components/Scoreboard'
import PlayerMat from '../../components/PlayerMat'
import FloatingMat from '../../components/FloatingMat'
import PowerPanel from '../../components/PowerPanel'
import TradePanel from '../../components/TradePanel'
import AuctionPanel from '../../components/AuctionPanel'
import VoterCardRow from '../../components/VoterCardRow'
import DeckStrip from '../../components/DeckStrip'
import * as Board from '../../lib/shasn/board'
import * as R from '../../lib/shasn/resources'
import * as Ideology from '../../lib/shasn/ideology'
import * as Voter from '../../lib/shasn/voterCards'
import * as Cards from '../../lib/shasn/cards'
import { ZONES, ZONE_IDS } from '../../lib/shasn/zones'
import { RESOURCES, RESOURCE_IDS, IDEOLOGUES, TURN_PHASES } from '../../lib/shasn/constants'

export default function GameRoom() {
  const router = useRouter()
  const { code } = router.query

  const [player, setPlayer] = useState(null)
  const [game, setGame] = useState(null)
  const [standings, setStandings] = useState([])
  const [breakdown, setBreakdown] = useState(null)
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [isSpectator, setIsSpectator] = useState(true)
  const [stalled, setStalled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [legacy, setLegacy] = useState(false)

  // interaction modes
  const [selection, setSelection] = useState(null) // influencing a Voter Card
  const [gerry, setGerry] = useState(null)
  const [powerMode, setPowerMode] = useState(null)
  const [capDiscard, setCapDiscard] = useState(R.emptyPool())
  const [note, setNote] = useState('')
  const [reveal, setReveal] = useState(null) // ideology card unmasked after answering
  const [justTucked, setJustTucked] = useState(null) // stack that just gained a card

  // ── Load ─────────────────────────────────────────────────────────────────

  const fetchGame = useCallback(
    async (token) => {
      if (!code) return null
      const res = await fetch(
        `/api/game-state?code=${encodeURIComponent(code)}${token ? `&sessionToken=${encodeURIComponent(token)}` : ''}`
      )
      const json = await res.json()
      if (!res.ok) {
        if (json.legacy) setLegacy(true)
        throw new Error(json.error || 'Could not load game')
      }
      if (json.lobby?.status === 'waiting') {
        router.replace(`/lobby/${code}`)
        return null
      }
      setGame(json.game)
      setStandings(json.standings || [])
      setBreakdown(json.scoreBreakdown || null)
      setMyPlayerId(json.myPlayerId)
      setIsSpectator(json.isSpectator ?? true)
      setStalled(json.stalled || false)
      return json
    },
    [code, router]
  )

  useEffect(() => {
    if (!code) return
    async function init() {
      const sessionToken = getOrCreateSessionToken()
      const stored = getStoredPlayer()
      if (stored?.code === code) setPlayer(stored)

      try {
        await fetchGame(sessionToken)
      } catch {
        // Not a known player — try to rejoin by token, else watch as a spectator.
        try {
          const rj = await fetch('/api/rejoin-game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, sessionToken }),
          })
          if (rj.ok) {
            const j = await rj.json()
            const restored = { ...j, sessionToken, code }
            storePlayer(restored)
            setPlayer(restored)
          }
          await fetchGame(sessionToken)
        } catch (e) {
          setError(e.message)
        }
      } finally {
        setLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // ── Realtime + polling ───────────────────────────────────────────────────

  useEffect(() => {
    if (!code || legacy) return
    const token = getOrCreateSessionToken()
    const supabase = getSupabase()

    let channel = null
    if (supabase) {
      channel = supabase
        .channel(`game-${code}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, () => {
          fetchGame(token).catch(() => {})
        })
        .subscribe()
    }
    const poll = setInterval(() => fetchGame(token).catch(() => {}), 4000)

    return () => {
      clearInterval(poll)
      if (supabase && channel) supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, legacy])

  // ── Actions ──────────────────────────────────────────────────────────────

  async function send(type, payload = {}) {
    // Spectators cannot act at all, but players can respond to trades and fire
    // the shot clock on someone else's turn — so this is not gated on isMyTurn.
    if (isSpectator || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/game-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          sessionToken: getOrCreateSessionToken(),
          action: { type, payload },
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error)
      } else {
        setGame(json.game)
        setStandings(json.standings || [])
        if (json.scoreBreakdown) setBreakdown(json.scoreBreakdown)
      }
      return json
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // ── Render guards ────────────────────────────────────────────────────────

  if (loading) return <Shell><p style={S.muted}>Loading the election…</p></Shell>

  if (legacy) {
    return (
      <Shell>
        <div style={S.panel}>
          <h2 style={S.h2}>This game predates the current engine</h2>
          <p style={S.muted}>
            It was created before the SHASN rebuild and cannot be loaded. Start a fresh lobby.
          </p>
          <Link href="/create" style={S.btn}>Create a new game</Link>
        </div>
      </Shell>
    )
  }

  if (!game) {
    return (
      <Shell>
        <div style={S.panel}>
          <p style={S.error}>{error || 'Game not found.'}</p>
          <Link href="/" style={S.btnGhost}>Home</Link>
        </div>
      </Shell>
    )
  }

  const active = game.players[game.activeSeat]
  const me = game.players.find((p) => p.id === myPlayerId)
  const isMyTurn = !isSpectator && active?.id === myPlayerId
  const finished = game.phase === 'finished'
  const colorOf = (pid) => colorForSeat(game.players.findIndex((p) => p.id === pid))
  const pendingIdeology = game.pendingIdeology
  const selectedCard = selection ? Voter.getVoterCard(game.market.open[selection.openIndex]) : null
  const openAuctions = (game.auctions || []).filter((a) => a.status === 'open').length
  const incomingTrades = (game.pendingTrades || []).filter(
    (t) => t.status === 'pending' && t.targetId === myPlayerId
  ).length

  // ── Board interaction ────────────────────────────────────────────────────

  function onAreaClick(zoneId, areaIndex) {
    if (!isMyTurn || finished) return
    const occupant = game.board.zones[zoneId].owners[areaIndex]

    if (powerMode) {
      if (!occupant) return setError('Select a voter.')
      if (powerMode.action === 'breaking_ground') {
        send('breaking_ground', { zoneId, areaIndex })
        setPowerMode(null)
        return
      }
      if (powerMode.action === 'payback') {
        send('payback', { zoneId, areaIndex })
        setPowerMode(null)
        return
      }
      if (powerMode.action === 'tough_love') {
        const picked = powerMode.picked || []
        if (picked.length && picked[0].zoneId !== zoneId) {
          return setError('Both voters must be in the same zone.')
        }
        const next = [...picked, { zoneId, areaIndex }]
        if (next.length < 2) return setPowerMode({ ...powerMode, picked: next })
        send('tough_love', { zoneId, areaIndices: next.map((n) => n.areaIndex) })
        setPowerMode(null)
        return
      }
    }

    if (gerry) {
      if (!gerry.from) {
        if (!occupant) return setError('Pick a voter to move.')
        return setGerry({ ...gerry, from: { zoneId, areaIndex } })
      }
      if (occupant) return setError('Destination must be empty.')
      send('gerrymander', {
        rightsZoneId: gerry.rightsZoneId,
        from: gerry.from,
        to: { zoneId, areaIndex },
      })
      setGerry(null)
      return
    }

    if (!selection && (game.board.evicted[myPlayerId] || 0) > 0 && !occupant) {
      send('place_evicted', { zoneId, areaIndex })
      return
    }

    if (!selection) return
    if (occupant) return setError('That area is taken.')
    if (selection.zoneId && selection.zoneId !== zoneId) {
      return setError('Voters from one Voter Card cannot be split across zones.')
    }
    const areas = [...selection.areas, areaIndex]
    if (areas.length < selectedCard.voters) {
      return setSelection({ ...selection, zoneId, areas })
    }
    send('influence', { openIndex: selection.openIndex, zoneId, areaIndices: areas })
    setSelection(null)
  }

  const rights = Board.gerrymanderingRights(game.board)
  const myRightsZones = myPlayerId ? ZONE_IDS.filter((z) => rights[z] === myPlayerId) : []
  const powers = me ? Ideology.activePowerList(me.ideologyCards) : []

  // Seat opponents around the table: two down each side, in turn order starting
  // from the player after you, so the seating matches the order of play.
  const opponents = (() => {
    const n = game.players.length
    const start = me ? game.players.findIndex((p) => p.id === me.id) : 0
    const out = []
    for (let i = 1; i < n; i++) out.push(game.players[(start + i) % n])
    return out
  })()
  const half = Math.ceil(opponents.length / 2)
  const leftOpponents = opponents.slice(0, half)
  const rightOpponents = opponents.slice(half)

  return (
    <Shell>
      {game.interrupt && me && (
        <InterruptPrompt
          interrupt={game.interrupt}
          game={game}
          me={me}
          busy={busy}
          onRespond={(payload) => send('respond_interrupt', payload)}
        />
      )}

      {pendingIdeology && !finished && !game.interrupt && (
        <IdeologyPrompt
          pending={pendingIdeology}
          reveal={reveal}
          busy={busy}
          canRedraw={isMyTurn}
          spectatorName={isMyTurn ? null : active?.name}
          deadline={game.ideologyDeadline}
          onTimeout={() => {
            // Any player may fire the clock, so a stalled tab cannot hold up the
            // table. The server re-checks the deadline before acting.
            fetch('/api/game-action', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code,
                sessionToken: getOrCreateSessionToken(),
                action: { type: 'answer_ideology_timeout' },
              }),
            })
              .then((r) => r.json())
              .then((j) => {
                if (j?.ok) {
                  setGame(j.game)
                  setStandings(j.standings || [])
                  if (j.reveal) setReveal(j.reveal)
                }
              })
              .catch(() => {})
          }}
          onAnswer={async (answerIndex) => {
            const r = await send('answer_ideology', { answerIndex })
            if (r?.reveal) setReveal(r.reveal)
          }}
          onRedraw={() => send('redraw_ideology')}
          onRevealDone={() => {
            setJustTucked(reveal?.chosen?.ideologue || null)
            setReveal(null)
            setTimeout(() => setJustTucked(null), 700)
          }}
        />
      )}

      <header style={S.topBar}>
        <div style={S.brand}>
          <h1 style={S.h1}>SHASN</h1>
          <span style={S.roomLine}>
            {code} · Turn {game.turnNumber}
            {isSpectator && ' · spectating'}
          </span>
        </div>

        {/* The seating. Whoever is up is the only one at full strength — the
            turn passing should be impossible to miss. */}
        <div style={S.seats}>
          {game.players.map((p, i) => {
            const isUp = i === game.activeSeat
            const s = standings.find((x) => x.playerId === p.id)
            return (
              <div
                key={p.id}
                className={`shasn-seat ${isUp ? 'shasn-seat--active' : 'shasn-seat--idle'}`}
                style={S.seat}
                title={isUp ? 'Playing now' : ''}
              >
                <span style={{ ...S.seatDot, background: colorForSeat(i) }} />
                <strong style={S.seatName}>
                  {p.name}
                  {p.id === myPlayerId && <span style={S.you}>you</span>}
                </strong>
                <Ticker value={s?.score ?? 0} style={S.seatScore} />
              </div>
            )
          })}
        </div>

        <Link href="/" className="btn btn--ghost btn--sm">Leave</Link>
      </header>

      {/* One line announcing the handoff, then it gets out of the way. */}
      {!finished && <TurnBanner active={active} isMyTurn={isMyTurn} />}

      {finished ? (
        <div style={{ ...S.panel, borderColor: 'var(--good)' }}>
          <h2 style={S.h2}>Election over</h2>
          <Scoreboard
            standings={standings}
            breakdown={breakdown}
            colorOf={colorOf}
            myPlayerId={myPlayerId}
            finished
          />
        </div>
      ) : (
        <div style={{ ...S.panel, borderColor: isMyTurn ? colorOf(myPlayerId) : 'var(--border)' }}>
          <div style={S.rowBetween}>
            <h2 style={S.h2}>
              <span style={{ ...S.dot, background: colorOf(active?.id) }} />
              {isMyTurn ? 'Your turn' : `${active?.name} is playing`}
            </h2>
            <span style={S.phaseTag}>{game.turnPhase}</span>
          </div>

          {me && <ResourceRow pool={me.pool} cap={me.resourceCap} />}

          {!isMyTurn && !isSpectator && (
            <>
              <p style={S.hint}>Waiting for {active?.name}…</p>
              {/* p.22 — a Conspiracy may be played right before an opponent
                  answers their Ideology Card, so the hand stays live here. */}
              {game.turnPhase === TURN_PHASES.IDEOLOGY && me?.conspiracyCards?.length > 0 && (
                <div style={S.subPanel}>
                  <p style={S.hint}>
                    You may play a Conspiracy Card before {active?.name} answers (p.22).
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                    {me.conspiracyCards
                      .filter((cid) => Cards.getConspiracyCard(cid)?.mode !== 'interrupt')
                      .map((cid, i) => (
                        <button
                          key={`${cid}${i}`}
                          style={S.btnGhost}
                          disabled={busy}
                          onClick={() => send('play_conspiracy', { cardId: cid })}
                        >
                          {Cards.getConspiracyCard(cid)?.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}


          {isMyTurn && game.turnPhase === TURN_PHASES.RESOURCE_CAP && me && (
            <div style={{ ...S.subPanel, borderColor: 'var(--amber)' }}>
              <p style={S.prompt}>
                Over the cap of {me.resourceCap}. Hand back exactly{' '}
                <strong>{R.excessOverCap(me.pool, me.resourceCap)}</strong> — click tokens on your
                chain to lift them off (p.11).
              </p>
              <p style={S.hint}>
                Marked: {R.poolTotal(capDiscard)} of {R.excessOverCap(me.pool, me.resourceCap)}
              </p>
              <button
                style={S.btn}
                disabled={busy || R.poolTotal(capDiscard) !== R.excessOverCap(me.pool, me.resourceCap)}
                onClick={async () => {
                  const r = await send('discard_to_cap', { discard: capDiscard })
                  if (r?.ok) setCapDiscard(R.emptyPool())
                }}
              >
                Hand back {R.poolTotal(capDiscard)}
              </button>
              <button
                style={{ ...S.btnGhost, marginLeft: 8 }}
                onClick={() => setCapDiscard(R.autoDiscardToCap(me.pool, me.resourceCap))}
              >
                auto-pick
              </button>
              {R.poolTotal(capDiscard) > 0 && (
                <button
                  style={{ ...S.btnGhost, marginLeft: 8 }}
                  onClick={() => setCapDiscard(R.emptyPool())}
                >
                  clear
                </button>
              )}
            </div>
          )}

          {isMyTurn && game.turnPhase === TURN_PHASES.ACTIONS && (
            <div style={S.subPanel}>
              <p style={S.hint}>No action points — act as often as you can afford (p.22).</p>

              {selection && (
                <p style={S.callout}>
                  Click {selectedCard.voters - selection.areas.length} empty area(s)
                  {selection.zoneId ? ` in ${ZONES[selection.zoneId].label}` : ' in a single zone'}.{' '}
                  <button style={S.link} onClick={() => setSelection(null)}>cancel</button>
                </p>
              )}

              {(game.board.evicted[myPlayerId] || 0) > 0 && !selection && (
                <p style={S.callout}>
                  {game.board.evicted[myPlayerId]} evicted voter(s) — click an empty area to place
                  one, or lose them at end of turn (p.23).
                </p>
              )}

              <h4 style={S.h4}>Gerrymandering</h4>
              {myRightsZones.length === 0 ? (
                <p style={S.hint}>No rights — you need the most voters in a zone (p.15).</p>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {myRightsZones.map((z) => (
                    <button
                      key={z}
                      style={{ ...S.btnGhost, borderColor: gerry?.rightsZoneId === z ? 'var(--ink)' : 'var(--border)' }}
                      onClick={() => {
                        setSelection(null)
                        setGerry(gerry?.rightsZoneId === z ? null : { rightsZoneId: z, from: null })
                      }}
                    >
                      via {ZONES[z].label}
                    </button>
                  ))}
                </div>
              )}
              {gerry && (
                <p style={S.callout}>
                  {gerry.from ? 'Click an empty destination.' : 'Click a voter to move.'}{' '}
                  <button style={S.link} onClick={() => setGerry(null)}>cancel</button>
                </p>
              )}

              <h4 style={S.h4}>Conspiracy Cards in hand</h4>
              {me.conspiracyCards.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {me.conspiracyCards.map((cid, i) => {
                    const c = Cards.getConspiracyCard(cid)
                    return (
                      <div key={`${cid}${i}`} style={S.conspiracyCard}>
                        <strong style={{ fontSize: 12 }}>{c.name}</strong>
                        <span style={S.cardText}>{c.text}</span>
                        <button
                          style={S.miniBtn}
                          disabled={busy}
                          onClick={() => send('play_conspiracy', { cardId: cid })}
                        >
                          play
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}


              <div style={{ marginTop: 16 }}>
                <button style={S.btn} disabled={busy} onClick={() => send('end_turn')}>
                  End turn
                </button>
              </div>
            </div>
          )}

          {isMyTurn && game.pendingHeadlines?.length > 0 && !game.awaitingResolution && (
            <div style={{ ...S.subPanel, borderColor: 'var(--danger)' }}>
              <p style={S.prompt}>
                <strong>{game.pendingHeadlines.length} Headline(s) pending.</strong> A voter landed
                in a Volatile Area (p.17).
              </p>
              <button style={S.btn} disabled={busy} onClick={() => send('resolve_headline')}>
                Draw the next Headline
              </button>
            </div>
          )}

          {game.awaitingResolution && (
            isMyTurn ? (
              <CardResolver
                kind={game.awaitingResolution.kind}
                card={
                  game.awaitingResolution.kind === 'headline'
                    ? Cards.getHeadlineCard(game.awaitingResolution.cardId)
                    : Cards.getConspiracyCard(game.awaitingResolution.cardId)
                }
                prompt={game.awaitingResolution.prompt}
                busy={busy}
                onResolve={(choice) => send('resolve_awaiting', { choice })}
                onManual={(n) => send('resolve_awaiting', { note: n })}
              />
            ) : (
              <div style={{ ...S.subPanel, borderColor: 'var(--amber)' }}>
                <ManualCard resolution={game.awaitingResolution} />
                <p style={S.hint}>Waiting for {active?.name} to resolve it.</p>
              </div>
            )
          )}

          {error && <p style={S.error}>{error}</p>}
          {stalled && (
            <p style={S.stall}>
              The campaign has stalled — everyone is at the resource cap and no open Voter Card can
              be paid for. Trading or the Capitalist&apos;s Prospecting power breaks this.
            </p>
          )}
        </div>
      )}

      <div style={S.withRail} className="shasn-with-rail">
        {/* ── Left rail: negotiation, away from the board ───────────────── */}
        {me && !finished && (
          <aside style={S.rail} className="shasn-rail">
            <section style={{ ...S.railBox, borderColor: openAuctions > 0 ? 'var(--amber)' : 'var(--border)' }}>
              <h3 style={S.railHead}>
                Auction
                {openAuctions > 0 && <span style={S.railBadge}>{openAuctions} live</span>}
                {(me.auctionDebt || 0) > 0 && (
                  <span style={{ ...S.railBadge, background: 'var(--danger)' }}>
                    owe {me.auctionDebt}
                  </span>
                )}
              </h3>
              <AuctionPanel
                game={game}
                me={me}
                busy={busy}
                onBid={(p) => send('bid', p)}
                onClose={(p) => send('close_auction', p)}
                onRepay={(p) => send('repay_debt', p)}
              />
            </section>

            <section style={{ ...S.railBox, borderColor: incomingTrades > 0 ? 'var(--danger)' : 'var(--border)' }}>
              <h3 style={S.railHead}>
                Trading
                {incomingTrades > 0 && (
                  <span style={S.railBadge}>{incomingTrades} for you</span>
                )}
              </h3>
              <TradePanel
                game={game}
                me={me}
                isMyTurn={isMyTurn}
                busy={busy}
                onPropose={(payload) => send('propose_trade', payload)}
                onRespond={(payload) => send('respond_trade', payload)}
              />
            </section>
          </aside>
        )}

      {/* ── The table: voter cards on top, board centre, mats around it ── */}
      <div style={S.table}>
        <div style={S.voterStrip}>
          <VoterCardRow
            market={game.market}
            pool={me?.pool}
            onSelect={(i) => {
              setGerry(null)
              setPowerMode(null)
              setSelection({ openIndex: i, zoneId: null, areas: [] })
            }}
            selectedIndex={selection?.openIndex ?? null}
            disabled={!isMyTurn || game.turnPhase !== TURN_PHASES.ACTIONS}
          />
        </div>

        <div style={S.tableRow} className="shasn-table-row">
          <div style={S.sideMats} className="shasn-side-mats">
            {leftOpponents.map((p) => (
              <PlayerMat
                key={p.id}
                player={p}
                color={colorOf(p.id)}
                isActive={p.id === active?.id}
                score={standings.find((s) => s.playerId === p.id)?.score ?? 0}
                variant="compact"
              />
            ))}
          </div>

          <div style={S.boardCell}>
            <ShasnBoard
              board={game.board}
              players={game.players}
              colorOf={colorOf}
              legalZones={selection?.zoneId ? new Set([selection.zoneId]) : null}
              selectedAreas={
                selection
                  ? selection.areas.map((a) => ({ zoneId: selection.zoneId, areaIndex: a }))
                  : gerry?.from
                  ? [gerry.from]
                  : (powerMode?.picked || [])
              }
              onAreaClick={isMyTurn && !finished ? onAreaClick : null}
            />
          </div>

          <div style={S.sideMats} className="shasn-side-mats">
            {rightOpponents.map((p) => (
              <PlayerMat
                key={p.id}
                player={p}
                color={colorOf(p.id)}
                isActive={p.id === active?.id}
                score={standings.find((s) => s.playerId === p.id)?.score ?? 0}
                variant="compact"
              />
            ))}
          </div>
        </div>

        <div style={S.deckStrip}>
          <DeckStrip
            conspiracyDeck={game.conspiracyDeck}
            headlineDeck={game.headlineDeck}
            pendingHeadlines={game.pendingHeadlines?.length || 0}
            canBuy={isMyTurn && game.turnPhase === TURN_PHASES.ACTIONS && !busy}
            surcharge={me?.conspiracySurcharge || 0}
            hand={me?.conspiracyCards?.length || 0}
            onBuyConspiracy={() => send('buy_conspiracy')}
          />
        </div>
      </div>
      </div>

      {me && (
        <FloatingMat
          storageKey={`shasn-mat-${code}`}
          player={me}
          color={colorOf(me.id)}
          isMyTurn={isMyTurn}
          score={standings.find((s) => s.playerId === me.id)?.score ?? 0}
        >
          <PlayerMat
            player={me}
            color={colorOf(me.id)}
            isActive={isMyTurn}
            isYou
            score={standings.find((s) => s.playerId === me.id)?.score ?? 0}
            variant="full"
            justTucked={justTucked}
            discardSelection={
              game.turnPhase === TURN_PHASES.RESOURCE_CAP && isMyTurn ? capDiscard : null
            }
            onDiscardToken={
              game.turnPhase === TURN_PHASES.RESOURCE_CAP && isMyTurn
                ? (resourceId) => {
                    const need = R.excessOverCap(me.pool, me.resourceCap)
                    const held = me.pool[resourceId] || 0
                    const marked = capDiscard[resourceId] || 0
                    if (marked >= held || R.poolTotal(capDiscard) >= need) {
                      if (marked > 0) setCapDiscard({ ...capDiscard, [resourceId]: marked - 1 })
                      return
                    }
                    setCapDiscard({ ...capDiscard, [resourceId]: marked + 1 })
                  }
                : null
            }
            powerActionFor={(ideo, lvl) =>
              ({
                capitalist3: 'prospect',
                capitalist5: 'breaking_ground',
                supremo3: 'donations',
                supremo5: 'payback',
                idealist5: 'tough_love',
              }[`${ideo}${lvl}`])
            }
            onUsePower={(ideo, lvl, action, def) => {
              if (!isMyTurn || game.turnPhase !== TURN_PHASES.ACTIONS) {
                return setError('You can only use powers during your actions.')
              }
              setSelection(null)
              setGerry(null)
              setPowerMode({ action, name: def.name, picked: [] })
            }}
          />
        </FloatingMat>
      )}

    </Shell>
  )
}

// ── Small components ───────────────────────────────────────────────────────

/**
 * A number that counts to its new value rather than snapping to it, and flashes
 * green up or red down. Scores move by small amounts and a jump is easy to miss.
 */
function Ticker({ value, style, duration = 520 }) {
  const [shown, setShown] = useState(value)
  const [dir, setDir] = useState(null)
  const from = useRef(value)

  useEffect(() => {
    if (value === from.current) return
    const start = from.current
    const delta = value - start
    setDir(delta > 0 ? 'up' : 'down')

    let raf
    const t0 = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(start + delta * eased))
      if (t < 1) raf = requestAnimationFrame(step)
      else {
        from.current = value
        setTimeout(() => setDir(null), 260)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return (
    <span
      key={dir || 'idle'}
      className={dir === 'up' ? 'shasn-score-up' : dir === 'down' ? 'shasn-score-down' : undefined}
      style={{ fontVariantNumeric: 'tabular-nums', ...style }}
    >
      {shown}
    </span>
  )
}

/** A single line announcing the handoff, shown briefly when the turn changes. */
function TurnBanner({ active, isMyTurn }) {
  const [shown, setShown] = useState(null)
  const last = useRef(active?.id)

  useEffect(() => {
    if (!active?.id || active.id === last.current) return
    last.current = active.id
    setShown(isMyTurn ? 'Your turn' : `${active.name} is up`)
    const t = setTimeout(() => setShown(null), 2400)
    return () => clearTimeout(t)
  }, [active?.id, active?.name, isMyTurn])

  if (!shown) return null
  return (
    <div style={S.bannerWrap} aria-live="polite">
      <span
        className="shasn-turn-banner"
        style={{
          ...S.banner,
          background: isMyTurn ? 'var(--accent)' : 'var(--ink)',
        }}
      >
        {shown}
      </span>
    </div>
  )
}

function ManualCard({ resolution }) {
  const card =
    resolution.kind === 'headline'
      ? Cards.getHeadlineCard(resolution.cardId)
      : Cards.getConspiracyCard(resolution.cardId)
  if (!card) return null
  return (
    <>
      <p style={S.prompt}><strong>{card.name}</strong></p>
      <pre style={S.cardBody}>{card.text}</pre>
      {card.clarification && <p style={S.hint}>{card.clarification}</p>}
      <p style={S.hint}>
        {resolution.prompt || 'Settle this at the table, then record the outcome.'}
      </p>
    </>
  )
}

function ResourceRow({ pool, cap }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
      {RESOURCE_IDS.map((id) => (
        <span key={id} style={{ ...S.chip, background: RESOURCES[id].color }}>
          {RESOURCES[id].label}: <strong>{pool[id] || 0}</strong>
        </span>
      ))}
      {cap !== undefined && (
        <span style={S.hint}>total {R.poolTotal(pool)} / cap {cap}</span>
      )}
    </div>
  )
}

function Shell({ children }) {
  return (
    <div style={S.page}>
      <div style={S.container}>{children}</div>
    </div>
  )
}

const S = {
  // ── Shell ──────────────────────────────────────────────────────────────
  page: {
    background: 'var(--bg)',
    minHeight: '100vh',
    padding: '18px 20px 40px',
    fontFamily: 'var(--sans)',
    color: 'var(--ink)',
  },
  // Wide. The board is the centrepiece and was being squeezed to about 480px
  // between the rail and the two mat columns; it now gets roughly double that.
  container: { width: '100%', maxWidth: 1640, margin: '0 auto', paddingBottom: 130 },

  // ── Header ─────────────────────────────────────────────────────────────
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  brand: { display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 },
  h1: { fontSize: 17, margin: 0, letterSpacing: '0.22em', fontWeight: 650 },
  roomLine: { fontSize: 12, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' },

  seats: { display: 'flex', gap: 7, flexWrap: 'wrap', flex: 1, justifyContent: 'center' },
  seat: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '5px 12px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 999,
    fontSize: 12.5,
    whiteSpace: 'nowrap',
    boxShadow: 'var(--sh-1)',
  },
  seatDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  seatName: { fontWeight: 550, display: 'flex', alignItems: 'baseline', gap: 5 },
  you: {
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--ink-3)',
    fontWeight: 600,
  },
  seatScore: { fontWeight: 650, color: 'var(--ink-2)' },

  bannerWrap: {
    position: 'sticky',
    top: 8,
    zIndex: 30,
    display: 'flex',
    justifyContent: 'center',
    height: 0,
    pointerEvents: 'none',
  },
  banner: {
    padding: '6px 18px',
    borderRadius: 999,
    color: 'var(--on-dark)',
    fontSize: 13,
    fontWeight: 550,
    boxShadow: 'var(--sh-3)',
  },

  // ── The table ──────────────────────────────────────────────────────────
  // Voter cards on top, board centre, opponents down each side, your own mat
  // floating along the bottom — the seating of a physical game.
  withRail: {
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, 300px) minmax(0, 1fr)',
    gap: 16,
    alignItems: 'start',
  },
  rail: { display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 14 },
  railBox: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    padding: 14,
    transition: 'border-color 220ms var(--ease)',
  },
  railHead: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    color: 'var(--ink-3)',
    fontWeight: 600,
    margin: '0 0 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 7,
  },
  railBadge: {
    fontSize: 9.5,
    background: 'var(--danger)',
    color: 'var(--on-dark)',
    borderRadius: 999,
    padding: '1px 7px',
    letterSpacing: 0,
    textTransform: 'none',
    fontWeight: 600,
  },

  table: { margin: '0 0 18px' },
  voterStrip: { display: 'flex', justifyContent: 'center' },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(160px, 215px) minmax(0, 1fr) minmax(160px, 215px)',
    gap: 14,
    alignItems: 'start',
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderTop: 'none',
    borderBottom: 'none',
    padding: 14,
  },
  sideMats: { display: 'flex', flexDirection: 'column', gap: 10 },
  boardCell: { minWidth: 0 },
  deckStrip: { display: 'flex', justifyContent: 'center' },

  // ── Type ───────────────────────────────────────────────────────────────
  rowBetween: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  h2: { fontSize: 17, margin: '0 0 4px', display: 'flex', alignItems: 'center' },
  h4: {
    fontSize: 10.5,
    margin: '18px 0 8px',
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    color: 'var(--ink-3)',
    fontWeight: 600,
  },
  muted: { color: 'var(--ink-3)', fontSize: 13.5 },
  hint: { color: 'var(--ink-3)', fontSize: 12, margin: '4px 0', lineHeight: 1.5 },

  // ── Surfaces ───────────────────────────────────────────────────────────
  panel: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    padding: 16,
    marginBottom: 16,
    transition: 'border-color 260ms var(--ease)',
  },
  subPanel: {
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    borderRadius: 'var(--r-md)',
    padding: 12,
    marginTop: 10,
  },
  callout: {
    background: 'var(--amber-bg)',
    border: '1px solid var(--amber-brd)',
    borderRadius: 'var(--r-md)',
    padding: '9px 12px',
    fontSize: 13,
    margin: '10px 0',
  },
  stall: {
    background: 'var(--danger-bg)',
    border: '1px solid var(--danger-brd)',
    borderRadius: 'var(--r-md)',
    padding: '10px 12px',
    fontSize: 13,
    marginTop: 10,
  },
  error: { color: 'var(--danger)', fontSize: 13, marginTop: 10 },

  // ── Controls ───────────────────────────────────────────────────────────
  btn: {
    padding: '8px 16px',
    background: 'var(--accent)',
    color: 'var(--on-dark)',
    border: 'none',
    borderRadius: 'var(--r-md)',
    fontSize: 14,
    fontWeight: 550,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
  },
  btnGhost: {
    padding: '7px 13px',
    background: 'var(--surface)',
    border: '1px solid var(--border-2)',
    borderRadius: 'var(--r-md)',
    fontSize: 13,
    cursor: 'pointer',
    textDecoration: 'none',
    color: 'var(--ink)',
    display: 'inline-block',
  },
  miniBtn: {
    fontSize: 10.5,
    padding: '3px 7px',
    border: '1px solid var(--border-2)',
    borderRadius: 'var(--r-sm)',
    background: 'var(--surface)',
    cursor: 'pointer',
  },
  link: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: 12,
    padding: 0,
  },

  // ── Bits ───────────────────────────────────────────────────────────────
  prompt: { fontSize: 15, margin: '0 0 12px', lineHeight: 1.5 },
  phaseTag: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    fontWeight: 600,
    background: 'var(--surface-3)',
    padding: '3px 9px',
    borderRadius: 999,
    color: 'var(--ink-3)',
  },
  dot: {
    display: 'inline-block',
    width: 9,
    height: 9,
    borderRadius: '50%',
    marginRight: 8,
    flexShrink: 0,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '2px 9px',
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 550,
    color: 'var(--on-dark)',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  // A Conspiracy card sitting in your hand, off-turn
  conspiracyCard: {
    width: 158,
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    padding: 10,
    background: 'var(--surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    boxShadow: 'var(--sh-1)',
  },
  cardText: {
    fontSize: 10.5,
    color: 'var(--ink-2)',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    maxHeight: 74,
    overflowY: 'auto',
  },
  cardBody: {
    fontSize: 12.5,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    fontFamily: 'inherit',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    padding: 11,
    borderRadius: 'var(--r-md)',
    margin: '0 0 8px',
  },
}
