// SHASN — multiplayer game room
//
// Drives lib/shasn through /api/game-action. The server holds the authoritative
// game object and enforces turn ownership; this page only renders and submits.
//
// Sync is Supabase Realtime on the game_state row, with a 4s poll as a fallback
// for when the socket drops.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getOrCreateSessionToken, getStoredPlayer, storePlayer } from '../../lib/session'
import { getSupabase } from '../../lib/supabaseClient'
import ShasnBoard, { colorForSeat } from '../../components/ShasnBoard'
import CardResolver from '../../components/CardResolver'
import IdeologyPrompt from '../../components/IdeologyPrompt'
import Scoreboard from '../../components/Scoreboard'
import PlayerMat from '../../components/PlayerMat'
import PowerPanel from '../../components/PowerPanel'
import TradePanel from '../../components/TradePanel'
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
      {pendingIdeology && !finished && (
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

      <div style={S.topBar}>
        <div>
          <h1 style={S.h1}>SHASN</h1>
          <span style={S.muted}>
            Room {code} · Turn {game.turnNumber}
            {isSpectator && ' · spectating'}
          </span>
        </div>
        <div style={S.seats}>
          {game.players.map((p, i) => {
            const isUp = i === game.activeSeat
            const s = standings.find((x) => x.playerId === p.id)
            return (
              <div
                key={p.id}
                style={{
                  ...S.seat,
                  borderColor: colorForSeat(i),
                  background: isUp ? colorForSeat(i) : '#fff',
                  color: isUp ? '#fff' : '#2b2b2b',
                }}
                title={isUp ? 'Playing now' : ''}
              >
                <strong>{p.name}{p.id === myPlayerId ? ' (you)' : ''}</strong>
                <span style={{ opacity: 0.85 }}>{s?.score ?? 0}</span>
              </div>
            )
          })}
        </div>
        <Link href="/" style={S.btnGhost}>Leave</Link>
      </div>

      {finished ? (
        <div style={{ ...S.panel, borderColor: '#4fa363' }}>
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
        <div style={{ ...S.panel, borderColor: isMyTurn ? colorOf(myPlayerId) : '#d8d2c4' }}>
          <div style={S.rowBetween}>
            <h2 style={S.h2}>
              <span style={{ ...S.dot, background: colorOf(active?.id) }} />
              {isMyTurn ? 'Your turn' : `${active?.name} is playing`}
            </h2>
            <span style={S.phaseTag}>{game.turnPhase}</span>
          </div>

          {me && <ResourceRow pool={me.pool} cap={me.resourceCap} />}

          {!isMyTurn && !isSpectator && (
            <p style={S.hint}>Waiting for {active?.name}…</p>
          )}


          {isMyTurn && game.turnPhase === TURN_PHASES.RESOURCE_CAP && me && (
            <div style={{ ...S.subPanel, borderColor: '#c9a227' }}>
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
                      style={{ ...S.btnGhost, borderColor: gerry?.rightsZoneId === z ? '#111' : '#d8d2c4' }}
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
            <div style={{ ...S.subPanel, borderColor: '#b3452f' }}>
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
              <div style={{ ...S.subPanel, borderColor: '#c9a227' }}>
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

        {me && (
          <div style={S.myMat}>
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
                      // Click again to put a token back; otherwise mark one more.
                      if (marked >= held || R.poolTotal(capDiscard) >= need) {
                        if (marked > 0) {
                          setCapDiscard({ ...capDiscard, [resourceId]: marked - 1 })
                        }
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
          </div>
        )}
      </div>

      {me && !finished && (
        <div style={{ ...S.panel, borderColor: incomingTrades > 0 ? '#b3452f' : '#d8d2c4' }}>
          <h3 style={S.h3}>
            Trading
            {incomingTrades > 0 && (
              <span style={S.tradeBadge}>{incomingTrades} waiting on you</span>
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
        </div>
      )}

      <div style={S.columns}>
        <div style={S.panel}>
          <h3 style={S.h3}>Scores</h3>
          <Scoreboard standings={standings} colorOf={colorOf} myPlayerId={myPlayerId} />
        </div>
        <div style={S.panel}>
          <h3 style={S.h3}>Campaign log</h3>
          <div style={S.log}>
            {[...(game.log || [])].reverse().slice(0, 40).map((l, i) => (
              <div key={i} style={S.logLine}>
                <span style={S.logType}>{l.type}</span>
                {l.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  )
}

// ── Small components ───────────────────────────────────────────────────────

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
  page: { background: '#efe9dc', minHeight: '100vh', padding: '20px 16px 40px', fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif', color: '#2b2b2b' },
  container: { maxWidth: 1180, margin: '0 auto' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' },
  seats: { display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, justifyContent: 'center' },

  // The table. Voter cards on top, board centre, opponents down each side,
  // your own mat along the bottom — the seating of a physical game.
  table: { margin: '10px 0 18px' },
  voterStrip: { display: 'flex', justifyContent: 'center' },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(150px, 200px) minmax(0, 1fr) minmax(150px, 200px)',
    gap: 12,
    alignItems: 'start',
    background: '#3a2f26',
    padding: 12,
    borderRadius: '4px 4px 12px 12px',
  },
  sideMats: { display: 'flex', flexDirection: 'column', gap: 10 },
  boardCell: { minWidth: 0 },
  deckStrip: { display: 'flex', justifyContent: 'center' },
  // Your own mat stays pinned to the bottom of the window while you scroll the
  // board — centred and width-constrained rather than full-bleed, so it reads as
  // your mat on the table rather than a browser chrome bar.
  tradeBadge: {
    marginLeft: 8, fontSize: 10, background: '#b3452f', color: '#fff',
    borderRadius: 9, padding: '2px 8px', letterSpacing: 0.4, textTransform: 'none',
  },
  myMat: {
    position: 'sticky',
    bottom: 10,
    zIndex: 20,
    marginTop: 12,
    maxWidth: 760,
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  seat: { display: 'flex', gap: 7, alignItems: 'baseline', border: '2px solid', borderRadius: 20, padding: '4px 12px', fontSize: 12, whiteSpace: 'nowrap' },
  rowBetween: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  h1: { fontSize: 24, margin: '0 0 2px', letterSpacing: 4, fontWeight: 700 },
  h2: { fontSize: 19, margin: '0 0 4px' },
  h3: { fontSize: 14, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b6559' },
  h4: { fontSize: 12, margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b6559' },
  muted: { color: '#6b6559', fontSize: 13 },
  hint: { color: '#8a8478', fontSize: 12, margin: '4px 0' },
  small: { fontSize: 11, color: '#4a4a4a' },
  panel: { background: '#fff', border: '1px solid #d8d2c4', borderRadius: 10, padding: 16, marginBottom: 16 },
  subPanel: { border: '1px solid #e6e0d2', borderRadius: 8, padding: 12, marginTop: 10 },
  columns: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 },
  input: { padding: '7px 10px', border: '1px solid #d8d2c4', borderRadius: 6, fontSize: 14, width: '100%', boxSizing: 'border-box' },
  btn: { padding: '9px 16px', background: '#2b2b2b', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },
  btnGhost: { padding: '7px 12px', background: '#fff', border: '1px solid #d8d2c4', borderRadius: 6, fontSize: 13, cursor: 'pointer', textDecoration: 'none', color: '#2b2b2b', display: 'inline-block' },
  miniBtn: { fontSize: 10, padding: '3px 6px', border: '1px solid #d8d2c4', borderRadius: 4, background: '#fff', cursor: 'pointer' },
  link: { background: 'none', border: 'none', color: '#b3452f', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, padding: 0 },
  stepBtn: { width: 22, height: 22, border: '1px solid #d8d2c4', background: '#fff', borderRadius: 4, cursor: 'pointer', lineHeight: 1 },
  stepper: { display: 'flex', alignItems: 'center', gap: 5 },
  answerBtn: { flex: '1 1 240px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, padding: 12, background: '#fff', border: '2px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  payout: { fontSize: 11, color: '#6b6559' },
  prompt: { fontSize: 15, margin: '0 0 12px', lineHeight: 1.45 },
  phaseTag: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, background: '#efeadd', padding: '3px 8px', borderRadius: 4, color: '#6b6559' },
  callout: { background: '#fdf6e3', border: '1px solid #e8dcb8', borderRadius: 6, padding: '8px 10px', fontSize: 13, margin: '10px 0' },
  error: { color: '#b3452f', fontSize: 13, marginTop: 10 },
  stall: { background: '#fdecea', border: '1px solid #e8b4ae', borderRadius: 6, padding: '10px 12px', fontSize: 13, marginTop: 10 },
  dot: { display: 'inline-block', width: 10, height: 10, borderRadius: '50%', marginRight: 7, verticalAlign: 'middle' },
  chip: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, color: '#fff', marginRight: 4, whiteSpace: 'nowrap' },
  voterCard: { width: 92, border: '1px solid #d8d2c4', borderRadius: 8, padding: 10, cursor: 'pointer', background: '#fff', textAlign: 'center' },
  voterCount: { fontSize: 28, fontWeight: 700, lineHeight: 1 },
  pips: { display: 'flex', gap: 3, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' },
  pip: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },
  conspiracyCard: { width: 150, border: '1px solid #d8d2c4', borderRadius: 8, padding: 9, background: '#fffdf6', display: 'flex', flexDirection: 'column', gap: 5 },
  cardText: { fontSize: 10, color: '#6b6559', lineHeight: 1.45, whiteSpace: 'pre-wrap', maxHeight: 70, overflowY: 'auto' },
  cardBody: { fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#fbf8f0', padding: 10, borderRadius: 6, margin: '0 0 8px' },
  powerBtn: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '7px 11px', background: '#fff', border: '2px solid #ddd', borderRadius: 7, cursor: 'pointer', fontSize: 12, textAlign: 'left' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e6e0d2', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b6559' },
  td: { padding: '6px 8px', borderBottom: '1px solid #f0ece1' },
  log: { maxHeight: 300, overflowY: 'auto', fontSize: 12, lineHeight: 1.6 },
  logLine: { padding: '3px 0', borderBottom: '1px solid #f4f1ea' },
  logType: { display: 'inline-block', minWidth: 74, fontSize: 10, textTransform: 'uppercase', color: '#a09a8c' },
}
