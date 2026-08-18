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
  const pendingCard = game.pendingIdeologyCard
    ? Ideology.getIdeologyCard(game.pendingIdeologyCard)
    : null
  const selectedCard = selection ? Voter.getVoterCard(game.market.open[selection.openIndex]) : null

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

  return (
    <Shell>
      <div style={S.topBar}>
        <div>
          <h1 style={S.h1}>SHASN · {code}</h1>
          <span style={S.muted}>
            Turn {game.turnNumber} ·{' '}
            {finished ? 'finished' : `${active?.name}'s turn`}
            {isSpectator && ' · spectating'}
          </span>
        </div>
        <Link href="/" style={S.btnGhost}>Leave</Link>
      </div>

      {finished ? (
        <div style={{ ...S.panel, borderColor: '#4fa363' }}>
          <h2 style={S.h2}>Election over</h2>
          <p style={S.muted}>Most majority voters wins (p.19).</p>
          <Standings standings={standings} colorOf={colorOf} />
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

          {isMyTurn && game.turnPhase === TURN_PHASES.IDEOLOGY && pendingCard && (
            <div style={S.subPanel}>
              <p style={S.prompt}>{pendingCard.prompt}</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {pendingCard.answers.map((a) => (
                  <button
                    key={a.ideologue}
                    disabled={busy}
                    style={{ ...S.answerBtn, borderColor: IDEOLOGUES[a.ideologue].color }}
                    onClick={() => send('answer_ideology', { ideologue: a.ideologue })}
                  >
                    <strong style={{ color: IDEOLOGUES[a.ideologue].color }}>
                      {IDEOLOGUES[a.ideologue].label}
                    </strong>
                    <span style={S.small}>{a.text}</span>
                    <span style={S.payout}>
                      {RESOURCE_IDS.filter((id) => a.resources[id])
                        .map((id) => `+${a.resources[id]} ${RESOURCES[id].label}`)
                        .join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
              <button
                style={{ ...S.btnGhost, marginTop: 10 }}
                disabled={busy}
                onClick={() => send('redraw_ideology')}
              >
                Redraw for any 4 resources
              </button>
            </div>
          )}

          {isMyTurn && game.turnPhase === TURN_PHASES.RESOURCE_CAP && me && (
            <div style={{ ...S.subPanel, borderColor: '#c9a227' }}>
              <p style={S.prompt}>
                Over the cap of {me.resourceCap}. Discard exactly{' '}
                <strong>{R.excessOverCap(me.pool, me.resourceCap)}</strong> (p.11).
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {RESOURCE_IDS.map((id) => (
                  <div key={id} style={S.stepper}>
                    <span style={{ ...S.chip, background: RESOURCES[id].color }}>
                      {RESOURCES[id].label}
                    </span>
                    <button
                      style={S.stepBtn}
                      onClick={() => setCapDiscard({ ...capDiscard, [id]: Math.max(0, capDiscard[id] - 1) })}
                    >−</button>
                    <span style={{ minWidth: 18, textAlign: 'center' }}>{capDiscard[id]}</span>
                    <button
                      style={S.stepBtn}
                      onClick={() =>
                        setCapDiscard({ ...capDiscard, [id]: Math.min(me.pool[id], capDiscard[id] + 1) })
                      }
                    >+</button>
                  </div>
                ))}
              </div>
              <button
                style={S.btn}
                disabled={busy}
                onClick={async () => {
                  const r = await send('discard_to_cap', { discard: capDiscard })
                  if (r?.ok) setCapDiscard(R.emptyPool())
                }}
              >
                Discard {R.poolTotal(capDiscard)}
              </button>
              <button
                style={{ ...S.btnGhost, marginLeft: 8 }}
                onClick={() => setCapDiscard(R.autoDiscardToCap(me.pool, me.resourceCap))}
              >
                auto-pick
              </button>
            </div>
          )}

          {isMyTurn && game.turnPhase === TURN_PHASES.ACTIONS && (
            <div style={S.subPanel}>
              <p style={S.hint}>No action points — act as often as you can afford (p.22).</p>

              <h4 style={S.h4}>Voter Cards</h4>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Voter.affordableCards(game.market, me.pool).map((o) => (
                  <div
                    key={o.openIndex}
                    style={{
                      ...S.voterCard,
                      opacity: o.affordable ? 1 : 0.45,
                      borderWidth: selection?.openIndex === o.openIndex ? 2 : 1,
                      borderColor: selection?.openIndex === o.openIndex ? '#111' : '#d8d2c4',
                    }}
                    onClick={() =>
                      o.affordable
                        ? setSelection({ openIndex: o.openIndex, zoneId: null, areas: [] })
                        : setError('You cannot afford that card.')
                    }
                  >
                    <div style={S.voterCount}>{o.card.voters}</div>
                    <div style={S.pips}>
                      {RESOURCE_IDS.flatMap((id) =>
                        Array.from({ length: o.cost[id] || 0 }, (_, k) => (
                          <span key={`${id}${k}`} style={{ ...S.pip, background: RESOURCES[id].color }} />
                        ))
                      )}
                      {Array.from({ length: o.cost.any || 0 }, (_, k) => (
                        <span key={`a${k}`} style={{ ...S.pip, background: '#fff', border: '1px solid #999' }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

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

              <h4 style={S.h4}>Conspiracy Cards</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button style={S.btnGhost} disabled={busy} onClick={() => send('buy_conspiracy')}>
                  Buy top card (any 4)
                </button>
                <span style={S.hint}>{game.conspiracyDeck?.size ?? 0} in the deck</span>
              </div>
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

              <h4 style={S.h4}>Ideologue powers</h4>
              {powers.length === 0 ? (
                <p style={S.hint}>None yet — 3 cards of one Ideologue unlocks Level 3 (p.14).</p>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {powers.map((p) => {
                    const action = {
                      capitalist3: 'prospect',
                      capitalist5: 'breaking_ground',
                      supremo3: 'donations',
                      supremo5: 'payback',
                      idealist5: 'tough_love',
                    }[`${p.ideologue}${p.level}`]
                    return (
                      <button
                        key={p.key}
                        style={{ ...S.powerBtn, borderColor: IDEOLOGUES[p.ideologue].color }}
                        title={p.text}
                        onClick={() =>
                          action
                            ? setPowerMode({ action, name: p.name, picked: [] })
                            : setError(`${p.name} applies automatically.`)
                        }
                      >
                        <strong>{p.name}</strong>
                        <span style={S.small}>L{p.level}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              {powerMode && (
                <p style={S.callout}>
                  <strong>{powerMode.name}</strong> — click{' '}
                  {powerMode.action === 'tough_love'
                    ? `2 voters of one opponent in one zone (${(powerMode.picked || []).length}/2)`
                    : 'a voter on the board'}
                  .{' '}
                  <button style={S.link} onClick={() => setPowerMode(null)}>cancel</button>
                </p>
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
            <div style={{ ...S.subPanel, borderColor: '#c9a227' }}>
              <ManualCard resolution={game.awaitingResolution} />
              {isMyTurn && (
                <>
                  <input
                    style={S.input}
                    placeholder="What did the table agree?"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <button
                    style={{ ...S.btn, marginTop: 8 }}
                    disabled={busy}
                    onClick={async () => {
                      const r = await send('resolve_manually', { note })
                      if (r?.ok) setNote('')
                    }}
                  >
                    Mark resolved
                  </button>
                </>
              )}
            </div>
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

      <div style={{ margin: '16px 0' }}>
        <ShasnBoard
          board={game.board}
          players={game.players}
          colorOf={colorOf}
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

      <div style={S.columns}>
        <div style={S.panel}>
          <h3 style={S.h3}>Standings</h3>
          <Standings standings={standings} colorOf={colorOf} players={game.players} />
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

function Standings({ standings, colorOf, players }) {
  return (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>Candidate</th>
          <th style={S.th}>Score</th>
          {players && <th style={S.th}>Ideology</th>}
        </tr>
      </thead>
      <tbody>
        {standings.map((s, i) => {
          const p = players?.find((x) => x.id === s.playerId)
          const counts = p ? Ideology.ideologueCounts(p.ideologyCards) : {}
          return (
            <tr key={s.playerId}>
              <td style={S.td}>
                <span style={{ ...S.dot, background: colorOf(s.playerId) }} />
                {s.nickname} {i === 0 && s.score > 0 && '👑'}
              </td>
              <td style={S.td}><strong>{s.score}</strong></td>
              {players && (
                <td style={S.td}>
                  {Object.entries(counts)
                    .filter(([, n]) => n > 0)
                    .map(([id, n]) => (
                      <span key={id} style={{ ...S.chip, background: IDEOLOGUES[id].color }}>
                        {IDEOLOGUES[id].label.replace('The ', '')} {n}
                      </span>
                    ))}
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
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
  page: { background: '#f0ece1', minHeight: '100vh', padding: '24px 16px', fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif', color: '#2b2b2b' },
  container: { maxWidth: 1180, margin: '0 auto' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  rowBetween: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  h1: { fontSize: 22, margin: '0 0 4px' },
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
