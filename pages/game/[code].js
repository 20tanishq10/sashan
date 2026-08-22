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
import { colorForSeat } from '../../components/ShasnBoard'
import CardResolver from '../../components/CardResolver'
import Scoreboard from '../../components/Scoreboard'
import RoomHeader from '../../components/room/RoomHeader'
import RivalRail from '../../components/room/RivalRail'
import BoardStage from '../../components/room/BoardStage'
import MarketRail from '../../components/room/MarketRail'
import MatDock from '../../components/room/MatDock'
import CommandBar from '../../components/room/CommandBar'
import TurnDigest from '../../components/room/TurnDigest'
import RoundPanel from '../../components/room/RoundPanel'
import IdeologyPrompt from '../../components/IdeologyPrompt'
import InterruptPrompt from '../../components/InterruptPrompt'
import TradePanel from '../../components/TradePanel'
import AuctionPanel from '../../components/AuctionPanel'
import Card, { CardText } from '../../components/Card'
import Announcer, { pushNotice, dropNotice } from '../../components/Announcer'
import { partyForSeat } from '../../lib/shasn/parties'
import * as Board from '../../lib/shasn/board'
import * as R from '../../lib/shasn/resources'
import * as Ideology from '../../lib/shasn/ideology'
import * as Voter from '../../lib/shasn/voterCards'
import * as Cards from '../../lib/shasn/cards'
import * as Jumla from '../../lib/shasn/jumla'
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
  const [legacy, setLegacy] = useState(false)
  // Feedback used to be one red line inside a panel near the bottom of the page,
  // and the client-side validation messages were only cleared by making a server
  // call — so correcting your mistake left the complaint on screen. Notices now
  // appear over the table and clear themselves.
  const [notices, setNotices] = useState([])

  // interaction modes
  const [selection, setSelection] = useState(null) // influencing a Voter Card
  const [gerry, setGerry] = useState(null)
  const [powerMode, setPowerMode] = useState(null)
  const [capDiscard, setCapDiscard] = useState(R.emptyPool())
  const [note, setNote] = useState('')
  const [reveal, setReveal] = useState(null) // ideology card unmasked after answering
  const [justTucked, setJustTucked] = useState(null) // stack that just gained a card
  const [focusedRival, setFocusedRival] = useState(null) // whose territory to light
  const [hoveredZone, setHoveredZone] = useState(null)
  // Taking your slot in a card that is going round the table. Same shape as
  // `gerry` so the board click handler can treat them alike.
  const [roundGerry, setRoundGerry] = useState(null)
  // The turn number whose digest you have already read, so it appears once.
  const [digestSeen, setDigestSeen] = useState(null)

  /**
   * Tell the player something, over the table, where they are looking.
   *
   * Declared above the effects that use it and never behind a branch — hooks
   * must run in the same order on every render, and getting that wrong here once
   * took the whole room down. See tests/hooks.test.mjs.
   */
  const say = useCallback((tone, text) => {
    setNotices((n) => pushNotice(n, tone, typeof text === 'string' ? text : String(text || '')))
  }, [])

  const hush = useCallback((id) => setNotices((n) => dropNotice(n, id)), [])

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
          say('error', e.message)
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

  // ── Acknowledging what goes right ────────────────────────────────────────
  //
  // Nothing did. You could take a zone — the single most consequential thing
  // that happens in this game — and the interface would not react at all. The
  // board animates the outline sweeping to your colour, but only if you happen
  // to be looking at that corner of the map.
  //
  // Unconditional and above the render guards, like every other hook here.
  const heldBefore = useRef(null)
  useEffect(() => {
    if (!game || !myPlayerId) return
    const mine = new Set(
      ZONE_IDS.filter((z) => Board.majorityHolder(game.board, z) === myPlayerId)
    )

    const before = heldBefore.current
    heldBefore.current = mine
    if (!before) return // first look; nothing to compare against

    for (const z of mine) {
      if (!before.has(z)) say('gain', `You took ${ZONES[z].label} — ${ZONES[z].majority} points`)
    }
    for (const z of before) {
      if (!mine.has(z)) say('warn', `You lost your majority in ${ZONES[z].label}`)
    }
  }, [game, myPlayerId, say])

  // ── Actions ──────────────────────────────────────────────────────────────

  async function send(type, payload = {}) {
    // Spectators cannot act at all, but players can respond to trades and fire
    // the shot clock on someone else's turn — so this is not gated on isMyTurn.
    if (isSpectator || busy) return
    setBusy(true)
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
        say('error', json.error)
      } else {
        setGame(json.game)
        setStandings(json.standings || [])
        if (json.scoreBreakdown) setBreakdown(json.scoreBreakdown)
      }
      return json
    } catch (e) {
      say('error', e.message)
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
          <p style={S.error}>Game not found.</p>
          <Link href="/" style={S.btnGhost}>Home</Link>
        </div>
      </Shell>
    )
  }

  const active = game.players[game.activeSeat]
  const me = game.players.find((p) => p.id === myPlayerId)
  const isMyTurn = !isSpectator && active?.id === myPlayerId
  const finished = game.phase === 'finished'
  const seatOf = (pid) => game.players.findIndex((p) => p.id === pid)
  const colorOf = (pid) => colorForSeat(seatOf(pid))
  // Every seat has a party emblem as well as a colour, so identity survives both
  // the four resource hues and colourblindness. See lib/shasn/parties.js.
  const partyOf = (pid) => partyForSeat(seatOf(pid)).id
  const pendingIdeology = game.pendingIdeology
  const selectedCard = selection ? Voter.getVoterCard(game.market.open[selection.openIndex]) : null
  const openAuctions = (game.auctions || []).filter((a) => a.status === 'open').length
  const incomingTrades = (game.pendingTrades || []).filter(
    (t) => t.status === 'pending' && t.targetId === myPlayerId
  ).length

  // A rail box is worth its width when there is a live auction, a debt to
  // repay, a trade on the table, or it is your turn and you could start one.
  const showAuction = openAuctions > 0 || (me?.auctionDebt || 0) > 0
  const showTrading =
    incomingTrades > 0 ||
    (game.pendingTrades || []).some((t) => t.status === 'pending') ||
    isMyTurn

  // Shown once when the turn returns to you, and gone the moment you act on it.
  const showDigest = isMyTurn && !finished && digestSeen !== game.turnNumber

  // ── A card going round the table ────────────────────────────────────────
  // Submerged and A Trip To Goalpara ask every player in turn, so for most of
  // their duration it is NOT your turn and you still have to act.
  const round = game.round || null
  const myRoundSlot = Boolean(round) && round.queue[0] === myPlayerId && !isSpectator

  // Jumla sits in somebody's Ideology stack and can be bought off them at any
  // time (p.18), so this is not gated on whose turn it is.
  const jumlaAt = Jumla.findJumla(game)
  const jumlaPrice = jumlaAt ? Jumla.priceOf(game) : 0
  const jumlaHolder = jumlaAt ? game.players.find((p) => p.id === jumlaAt.playerId) : null
  const canTakeJumla =
    Boolean(jumlaAt) &&
    !isSpectator &&
    jumlaAt.playerId !== myPlayerId &&
    R.poolTotal(me?.pool || {}) >= jumlaPrice

  // ── Board interaction ────────────────────────────────────────────────────

  function onAreaClick(zoneId, areaIndex) {
    // A round is the one time you act on the board when it is not your turn, so
    // this is checked before the isMyTurn guard below rather than after it.
    if (roundGerry) {
      const occupant = game.board.zones[zoneId].owners[areaIndex]
      if (!roundGerry.from) {
        if (!occupant) return say('error', 'Pick a voter to move.')
        return setRoundGerry({ ...roundGerry, from: { zoneId, areaIndex } })
      }
      if (occupant) return say('error', 'Destination must be empty.')
      send('act_in_round', {
        action: 'act',
        rightsZoneId: roundGerry.rightsZoneId,
        from: roundGerry.from,
        to: { zoneId, areaIndex },
      })
      setRoundGerry(null)
      return
    }

    if (!isMyTurn || finished) return
    const occupant = game.board.zones[zoneId].owners[areaIndex]

    if (powerMode) {
      if (!occupant) return say('error', 'Select a voter.')
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
          return say('error', 'Both voters must be in the same zone.')
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
        if (!occupant) return say('error', 'Pick a voter to move.')
        return setGerry({ ...gerry, from: { zoneId, areaIndex } })
      }
      if (occupant) return say('error', 'Destination must be empty.')
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
    if (occupant) return say('error', 'That area is taken.')
    if (selection.zoneId && selection.zoneId !== zoneId) {
      return say('error', 'Voters from one Voter Card cannot be split across zones.')
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
  // ── What needs you, in priority order ───────────────────────────────────
  //
  // These used to be stacked above the board, which is how the board ended up
  // below the fold. They are yours to deal with, so they sit at the top of your
  // own rail rather than in front of the game.

  const attention = []

  if (round) {
    attention.push(
      <RoundPanel
        key="round"
        round={round}
        players={game.players}
        myPlayerId={myPlayerId}
        colorOf={colorOf}
        busy={busy}
        onPass={() => {
          setRoundGerry(null)
          send('act_in_round', { action: 'pass' })
        }}
      >
        {myRoundSlot && round.kind === 'gerrymander' && (
          <div style={S.attnRow}>
            {myRightsZones.length === 0 ? (
              <p style={S.attnText}>
                You hold no majorities, so you have no Gerrymandering Rights and nothing to
                move (p.15). Pass.
              </p>
            ) : roundGerry ? (
              <p style={S.attnText}>
                {roundGerry.from
                  ? 'Now click an empty area to move it to — not a Volatile one.'
                  : 'Click the voter you want to move.'}
              </p>
            ) : (
              myRightsZones.map((z) => (
                <button
                  key={z}
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() => {
                    setSelection(null)
                    setGerry(null)
                    setPowerMode(null)
                    setRoundGerry({ rightsZoneId: z, from: null })
                  }}
                >
                  using {ZONES[z].label}
                </button>
              ))
            )}
          </div>
        )}
        {myRoundSlot && round.kind === 'cashOutVoter' && (
          <p style={S.attnText}>Click one of the open Voter Cards to take it.</p>
        )}
      </RoundPanel>
    )
  }

  if (isMyTurn && game.turnPhase === TURN_PHASES.RESOURCE_CAP && me) {
    const over = R.excessOverCap(me.pool, me.resourceCap)
    attention.push(
      <section key="cap" style={{ ...S.attn, borderColor: 'var(--amber-brd)' }}>
        <h3 style={S.attnHead}>Over the cap</h3>
        <p style={S.attnText}>
          Hand back exactly <strong>{over}</strong> — click tokens on your chain to lift them
          off (p.11). Marked {R.poolTotal(capDiscard)} of {over}.
        </p>
        <div style={S.attnRow}>
          <button
            className="btn btn--primary btn--sm"
            disabled={busy || R.poolTotal(capDiscard) !== over}
            onClick={async () => {
              const r = await send('discard_to_cap', { discard: capDiscard })
              if (r?.ok) setCapDiscard(R.emptyPool())
            }}
          >
            Hand back {R.poolTotal(capDiscard)}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setCapDiscard(R.autoDiscardToCap(me.pool, me.resourceCap))}
          >
            auto-pick
          </button>
          {R.poolTotal(capDiscard) > 0 && (
            <button className="btn btn--ghost btn--sm" onClick={() => setCapDiscard(R.emptyPool())}>
              clear
            </button>
          )}
        </div>
      </section>
    )
  }

  if (isMyTurn && game.pendingHeadlines?.length > 0 && !game.awaitingResolution) {
    attention.push(
      <section key="headline" style={{ ...S.attn, borderColor: 'var(--danger-brd)' }}>
        <h3 style={S.attnHead}>{game.pendingHeadlines.length} Headline pending</h3>
        <p style={S.attnText}>A voter landed in a Volatile Area (p.17).</p>
        <button
          className="btn btn--primary btn--sm"
          disabled={busy}
          onClick={() => send('resolve_headline')}
        >
          Draw the next Headline
        </button>
      </section>
    )
  }

  if (game.awaitingResolution) {
    attention.push(
      isMyTurn ? (
        <CardResolver
          key="resolve"
          kind={game.awaitingResolution.kind}
          card={
            game.awaitingResolution.kind === 'headline'
              ? Cards.getHeadlineCard(game.awaitingResolution.cardId)
              : Cards.getConspiracyCard(game.awaitingResolution.cardId)
          }
          prompt={game.awaitingResolution.prompt}
          busy={busy}
          players={game.players}
          myPlayerId={myPlayerId}
          onResolve={(choice, extra) => send('resolve_awaiting', { choice, ...(extra || {}) })}
          onManual={(n) => send('resolve_awaiting', { note: n })}
        />
      ) : (
        <section key="resolve" style={{ ...S.attn, borderColor: 'var(--amber-brd)' }}>
          <ManualCard resolution={game.awaitingResolution} />
          <p style={S.attnText}>Waiting for {active?.name} to resolve it.</p>
        </section>
      )
    )
  }

  if (stalled) {
    attention.push(
      <section key="stall" style={{ ...S.attn, borderColor: 'var(--danger-brd)' }}>
        <h3 style={S.attnHead}>The campaign has stalled</h3>
        <p style={S.attnText}>
          Everyone is at the cap and no open Voter Card can be paid for. Trading, or the
          Capitalist&apos;s Prospecting, breaks it.
        </p>
      </section>
    )
  }

  // ── The one-line instruction under the board ────────────────────────────

  let prompt = null
  if (isMyTurn && selection && selectedCard) {
    prompt = {
      text: `Click ${selectedCard.voters - selection.areas.length} empty area${
        selectedCard.voters - selection.areas.length === 1 ? '' : 's'
      }${selection.zoneId ? ` in ${ZONES[selection.zoneId].label}` : ' in a single zone'}.`,
      onCancel: () => setSelection(null),
    }
  } else if (isMyTurn && gerry) {
    prompt = {
      text: gerry.from ? 'Click an empty destination.' : 'Click a voter to move.',
      onCancel: () => setGerry(null),
    }
  } else if (isMyTurn && powerMode) {
    prompt = { text: `${powerMode.name} — pick on the board.`, onCancel: () => setPowerMode(null) }
  } else if (isMyTurn && (game.board.evicted[myPlayerId] || 0) > 0) {
    prompt = {
      text: `${game.board.evicted[myPlayerId]} evicted voter(s) — click an empty area to place one, or lose them at end of turn (p.23).`,
    }
  } else if (!isMyTurn && !isSpectator) {
    prompt = { text: `Waiting for ${active?.name}…` }
  }

  // ── The command bar ─────────────────────────────────────────────────────

  const canAct = isMyTurn && game.turnPhase === TURN_PHASES.ACTIONS
  const commands = []

  if (canAct) {
    for (const z of myRightsZones) {
      commands.push({
        id: `gerry-${z}`,
        label: 'Gerrymander',
        detail: ZONES[z].label,
        available: true,
        active: gerry?.rightsZoneId === z,
        hint: `Move a voter within or out of ${ZONES[z].label} (p.15)`,
        onClick: () => {
          setSelection(null)
          setGerry(gerry?.rightsZoneId === z ? null : { rightsZoneId: z, from: null })
        },
      })
    }
    if (myRightsZones.length === 0) {
      commands.push({
        id: 'gerry-none',
        label: 'Gerrymander',
        available: false,
        why: 'You need the most voters in a zone to hold Gerrymandering Rights (p.15).',
      })
    }
  }

  // Jumla (p.18) — "At the end of your turn, you may place this card under a
  // different Ideologue." Strictly optional, so it is an action you take rather
  // than a prompt you have to dismiss.
  if (canAct && jumlaAt?.playerId === myPlayerId) {
    for (const id of Object.keys(IDEOLOGUES)) {
      if (id === jumlaAt.ideologue) continue
      commands.push({
        id: `jumla-${id}`,
        label: 'Move Jumla',
        detail: IDEOLOGUES[id].label,
        available: true,
        hint: `Re-file Jumla under ${IDEOLOGUES[id].label}. It currently props up ${
          IDEOLOGUES[jumlaAt.ideologue].label
        } at level ${jumlaPrice}.`,
        onClick: () => send('move_jumla', { ideologue: id }),
      })
    }
  }

  // Taking it off somebody else is NOT turn-gated — the card says "opponents"
  // with no timing restriction, and the moment worth taking it is usually not
  // your own turn.
  if (jumlaAt && jumlaAt.playerId !== myPlayerId && !isSpectator && !finished) {
    commands.push({
      id: 'jumla-take',
      label: 'Take Jumla',
      detail: `${jumlaPrice} resource${jumlaPrice === 1 ? '' : 's'}`,
      available: canTakeJumla && !busy,
      why: canTakeJumla
        ? undefined
        : `Jumla is on level ${jumlaPrice} — you need ${jumlaPrice} resources to take it.`,
      hint: `Buy Jumla from ${jumlaHolder?.name} for ${jumlaPrice}. It counts as one of their Ideology Cards, so taking it may cost them a power.`,
      onClick: () => send('take_jumla', {}),
    })
  }

  return (
    <div className="room">
      {/* Overlays first: they sit above everything and own the screen while up. */}
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

      <RoomHeader
        code={code}
        turnNumber={game.turnNumber}
        isSpectator={isSpectator}
        turnLabel={finished ? 'Election over' : isMyTurn ? 'Your turn' : `${active?.name} is playing`}
        turnColor={finished ? 'var(--good)' : colorOf(active?.id)}
        phase={finished ? null : game.turnPhase}
      >
        {!finished && <TurnBanner active={active} isMyTurn={isMyTurn} />}
      </RoomHeader>

      <Announcer notices={notices} onDismiss={hush} />

      {finished ? (
        <div style={S.finished}>
          <div style={S.panel}>
            <h2 style={S.h2}>Election over</h2>
            <Scoreboard
              standings={standings}
              breakdown={breakdown}
              colorOf={colorOf}
              myPlayerId={myPlayerId}
              finished
            />
          </div>
        </div>
      ) : (
        <div className="room-stage">
          <RivalRail
            players={game.players}
            activeId={active?.id}
            myPlayerId={myPlayerId}
            standings={standings}
            colorOf={colorOf}
            partyOf={partyOf}
            board={game.board}
            focusedId={focusedRival}
            onFocus={setFocusedRival}
          >
            {showDigest && (
              <TurnDigest game={game} playerId={myPlayerId} onDismiss={() => setDigestSeen(game.turnNumber)} />
            )}

            {attention}

            {me?.conspiracyCards?.length > 0 && (
              <section style={S.attn}>
                <h3 style={S.attnHead}>Your hand</h3>
                <div style={S.hand}>
                  {me.conspiracyCards
                    .filter(
                      (cid) =>
                        canAct ||
                        (game.turnPhase === TURN_PHASES.IDEOLOGY &&
                          !isMyTurn &&
                          Cards.getConspiracyCard(cid)?.mode !== 'interrupt')
                    )
                    .map((cid, i) => {
                      const c = Cards.getConspiracyCard(cid)
                      return (
                        <Card
                          key={`${cid}${i}`}
                          deck="conspiracy"
                          compact
                          title={c.name}
                          footer={
                            <button
                              style={S.miniBtn}
                              disabled={busy}
                              onClick={() => send('play_conspiracy', { cardId: cid })}
                            >
                              {isMyTurn ? 'Play' : 'Play now'}
                            </button>
                          }
                        >
                          <CardText>{c.text}</CardText>
                        </Card>
                      )
                    })}
                </div>
              </section>
            )}

            {me && showAuction && (
              <section style={{ ...S.railBox, borderColor: openAuctions > 0 ? 'var(--amber)' : undefined }}>
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
            )}

            {me && showTrading && (
              <section style={{ ...S.railBox, borderColor: incomingTrades > 0 ? 'var(--danger)' : undefined }}>
                <h3 style={S.railHead}>
                  Trading
                  {incomingTrades > 0 && <span style={S.railBadge}>{incomingTrades} for you</span>}
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
            )}
          </RivalRail>

          <BoardStage
            board={game.board}
            players={game.players}
            colorOf={colorOf}
            partyOf={partyOf}
            myPlayerId={myPlayerId}
            legalZones={selection?.zoneId ? new Set([selection.zoneId]) : null}
            selectedAreas={
              selection
                ? selection.areas.map((a) => ({ zoneId: selection.zoneId, areaIndex: a }))
                : gerry?.from
                ? [gerry.from]
                : powerMode?.picked || []
            }
            onAreaClick={isMyTurn && !finished ? onAreaClick : null}
            focusPlayerId={focusedRival}
            hoveredZone={hoveredZone}
            onZoneHover={setHoveredZone}
            prompt={prompt}
            focusedName={game.players.find((p) => p.id === focusedRival)?.name || null}
            onReleaseFocus={() => setFocusedRival(null)}
          />

          <MarketRail
            market={game.market}
            pool={me?.pool}
            onSelect={(i) => {
              // During A Trip To Goalpara the same three cards mean something
              // else: you are not buying one, you are cashing one out.
              if (myRoundSlot && round.kind === 'cashOutVoter') {
                send('act_in_round', { action: 'act', openIndex: i })
                return
              }
              setGerry(null)
              setPowerMode(null)
              setSelection({ openIndex: i, zoneId: null, areas: [] })
            }}
            selectedIndex={selection?.openIndex ?? null}
            disabled={myRoundSlot && round.kind === 'cashOutVoter' ? busy : !canAct}
            conspiracyDeck={game.conspiracyDeck}
            headlineDeck={game.headlineDeck}
            pendingHeadlines={game.pendingHeadlines?.length || 0}
            canBuy={canAct && !busy}
            surcharge={me?.conspiracySurcharge || 0}
            hand={me?.conspiracyCards?.length || 0}
            onBuyConspiracy={() => send('buy_conspiracy')}
            log={game.log}
          />
        </div>
      )}

      {me && !finished && (
        <MatDock
          player={me}
          color={colorOf(me.id)}
          party={partyOf(me.id)}
          board={game.board}
          isMyTurn={isMyTurn}
          score={standings.find((s) => s.playerId === me.id)?.score ?? 0}
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
            })[`${ideo}${lvl}`]
          }
          onUsePower={(ideo, lvl, action, def) => {
            if (!canAct) return say('error', 'You can only use powers during your actions.')
            setSelection(null)
            setGerry(null)
            setPowerMode({ action, name: def.name, picked: [] })
          }}
          commandBar={
            <CommandBar
              actions={commands}
              busy={busy}
              canEndTurn={canAct}
              onEndTurn={() => send('end_turn')}
            />
          }
        />
      )}
    </div>
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
  // ── The loading / error shell ──────────────────────────────────────────
  // Only used before the room exists; the room itself is a full-viewport grid.
  page: { minHeight: '100vh', padding: '40px 20px', fontFamily: 'var(--sans)' },
  container: { width: '100%', maxWidth: 560, margin: '0 auto' },
  btn: {
    padding: '9px 18px',
    background: 'linear-gradient(180deg, var(--saffron), var(--saffron-deep))',
    color: '#fff6e4',
    border: '1px solid var(--brass-dark)',
    borderRadius: 'var(--r-md)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
    boxShadow: 'var(--sh-brass)',
  },
  btnGhost: {
    padding: '8px 15px',
    background: 'linear-gradient(180deg, var(--lacquer-3), var(--lacquer-2))',
    border: '1px solid rgba(217,173,62,.4)',
    borderRadius: 'var(--r-md)',
    fontSize: 13,
    cursor: 'pointer',
    textDecoration: 'none',
    color: 'var(--ivory)',
    boxShadow: 'var(--sh-brass)',
    display: 'inline-block',
  },
  error: { color: 'var(--danger)', fontSize: 13.5, marginBottom: 12 },

  // ── A card being resolved at the table ─────────────────────────────────
  prompt: { fontSize: 15, margin: '0 0 10px', lineHeight: 1.5, color: 'var(--ivory)' },
  cardBody: {
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    fontFamily: 'inherit',
    background: 'rgba(0,0,0,.28)',
    border: '1px solid rgba(217,173,62,.22)',
    padding: 11,
    borderRadius: 'var(--r-md)',
    margin: '0 0 8px',
    color: 'var(--ink-on-dark-2)',
  },
  hint: { color: 'var(--ink-on-dark-3)', fontSize: 12.5, margin: '4px 0', lineHeight: 1.55 },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '2px 9px',
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--on-dark)',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },

  // ── The rail's own furniture ───────────────────────────────────────────
  // Things demanding your attention: over the cap, a headline to draw, a card
  // to resolve, a stalled campaign. They sit at the top of your own rail rather
  // than stacked above the board, which is how the board ended up below the fold.
  attn: {
    backgroundColor: 'var(--lacquer-2)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,220,150,.07), transparent 42%)',
    border: '1px solid rgba(217,173,62,.32)',
    borderRadius: 'var(--r-lg)',
    padding: 12,
    boxShadow: 'var(--sh-2)',
    flexShrink: 0,
  },
  attnHead: {
    fontFamily: 'var(--head)',
    fontSize: 11.5,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--brass)',
    margin: '0 0 7px',
  },
  attnText: { fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-on-dark-2)', margin: '0 0 9px' },
  attnRow: { display: 'flex', gap: 7, flexWrap: 'wrap' },
  hand: { display: 'flex', flexDirection: 'column', gap: 8 },

  finished: { overflowY: 'auto', padding: '16px 20px 24px' },

  // ── Shell ──────────────────────────────────────────────────────────────
  // Wide. The board is the centrepiece and was being squeezed to about 480px
  // between the rail and the two mat columns; it now gets roughly double that.

  // ── Header ─────────────────────────────────────────────────────────────


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
    fontFamily: 'var(--head)',
    padding: '7px 22px',
    borderRadius: 999,
    color: '#fff6e4',
    fontSize: 14,
    letterSpacing: '0.1em',
    border: '1px solid var(--brass-dark)',
    boxShadow: 'var(--sh-3), var(--sh-brass)',
    textShadow: '0 1px 2px rgba(0,0,0,.4)',
  },

  // ── The table ──────────────────────────────────────────────────────────
  // Voter cards on top, board centre, opponents down each side, your own mat
  // floating along the bottom — the seating of a physical game.
  railBox: {
    backgroundColor: 'var(--lacquer-2)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,220,150,.06), transparent 40%)',
    border: '1px solid rgba(217,173,62,.3)',
    borderRadius: 'var(--r-lg)',
    color: 'var(--ink-on-dark)',
    padding: 15,
    boxShadow: 'var(--sh-2)',
    transition: 'border-color 220ms var(--ease)',
  },
  railHead: {
    fontFamily: 'var(--head)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: 'var(--brass)',
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


  // ── Type ───────────────────────────────────────────────────────────────
  h2: {
    fontFamily: 'var(--head)',
    fontSize: 19,
    margin: '0 0 5px',
    display: 'flex',
    alignItems: 'center',
    color: 'var(--ivory)',
  },
  muted: { color: 'var(--ink-on-dark-3)', fontSize: 14 },

  // ── Surfaces ───────────────────────────────────────────────────────────
  panel: {
    backgroundColor: 'var(--lacquer-2)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,220,150,.07), transparent 42%)',
    border: '1px solid rgba(217,173,62,.3)',
    borderRadius: 'var(--r-lg)',
    color: 'var(--ink-on-dark)',
    padding: 17,
    marginBottom: 16,
    boxShadow: 'var(--sh-2)',
    transition: 'border-color 260ms var(--ease)',
  },

  // ── Controls ───────────────────────────────────────────────────────────
  miniBtn: {
    fontFamily: 'var(--head)',
    fontSize: 11,
    letterSpacing: '0.08em',
    padding: '4px 10px',
    border: '1px solid var(--brass-dark)',
    borderRadius: 'var(--r-sm)',
    background: 'linear-gradient(180deg, #f6e1a0, #d9ad3e 55%, #9c6e14)',
    color: '#3a2508',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255,245,215,.7), 0 1px 2px rgba(0,0,0,.35)',
  },

  // ── Bits ───────────────────────────────────────────────────────────────
  // A Conspiracy card sitting in your hand, off-turn
}
