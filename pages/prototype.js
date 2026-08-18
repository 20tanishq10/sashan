// SHASN — hot-seat prototype
//
// A single local page that drives lib/shasn directly. No Supabase, no realtime,
// no lobby: every player takes their turn on the same screen. This exists to
// playtest the RULES before the multiplayer UI is built on top of them.
//
// Implemented: Ideology Cards (answer + redraw), resource cap, Voter Card
// market, voter placement with area selection, majority forming/breaking,
// Gerrymandering, evicted-voter replacement, scoring, game end.
//
// Not yet wired here: trading and auctions (the engine supports both).

import { useMemo, useRef, useState } from 'react'
import Head from 'next/head'

import * as Game from '../lib/shasn/game'
import * as Board from '../lib/shasn/board'
import * as R from '../lib/shasn/resources'
import * as Ideology from '../lib/shasn/ideology'
import * as Voter from '../lib/shasn/voterCards'
import * as Cards from '../lib/shasn/cards'
import ShasnBoard, { colorForSeat } from '../components/ShasnBoard'
import CardResolver from '../components/CardResolver'
import IdeologyPrompt from '../components/IdeologyPrompt'
import Scoreboard from '../components/Scoreboard'
import ResourceChain from '../components/ResourceChain'
import DeckStrip from '../components/DeckStrip'
import { ZONES, ZONE_IDS, isVolatile } from '../lib/shasn/zones'
import {
  RESOURCES,
  RESOURCE_IDS,
  IDEOLOGUES,
  TURN_PHASES,
  GAME_PHASES,
} from '../lib/shasn/constants'

export default function Prototype() {
  const [setup, setSetup] = useState({ names: ['Player 1', 'Player 2', 'Player 3'], seed: 1234 })
  const [game, setGame] = useState(null)
  const [error, setError] = useState(null)
  const [selection, setSelection] = useState(null) // influencing a Voter Card
  const [gerry, setGerry] = useState(null) // gerrymander mode
  const [capDiscard, setCapDiscard] = useState(R.emptyPool())
  const [powerMode, setPowerMode] = useState(null) // activated Ideologue power
  const [resolutionNote, setResolutionNote] = useState('')
  const [reveal, setReveal] = useState(null)
  const rngRef = useRef(null)

  const player = game ? Game.activePlayer(game) : null
  const colorOf = (playerId) => colorForSeat(game.players.findIndex((p) => p.id === playerId))

  function apply(result) {
    if (!result) return
    if (result.error) {
      setError(result.error)
      return
    }
    setError(null)
    setGame(result.game)
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  function startGame() {
    const players = setup.names.map((name, i) => ({ id: `p${i + 1}`, name: name || `Player ${i + 1}` }))
    const created = Game.createGame({ players, seed: Number(setup.seed) || 1234 })
    if (created.error) {
      setError(created.error)
      return
    }
    rngRef.current = created.rng
    setGame(created.game)
    setError(null)
  }

  if (!game) {
    return (
      <Shell>
        <h1 style={S.h1}>SHASN — hot-seat prototype</h1>
        <p style={S.muted}>
          Rules playtest for the rebuilt engine. Everyone plays on this one screen.
        </p>
        <div style={S.panel}>
          <h3 style={S.h3}>Players (3–5)</h3>
          {setup.names.map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <span style={{ ...S.dot, background: colorForSeat(i) }} />
              <input
                style={S.input}
                value={n}
                onChange={(e) => {
                  const names = [...setup.names]
                  names[i] = e.target.value
                  setSetup({ ...setup, names })
                }}
              />
              {setup.names.length > 3 && (
                <button
                  style={S.btnGhost}
                  onClick={() =>
                    setSetup({ ...setup, names: setup.names.filter((_, j) => j !== i) })
                  }
                >
                  remove
                </button>
              )}
            </div>
          ))}
          {setup.names.length < 5 && (
            <button
              style={S.btnGhost}
              onClick={() =>
                setSetup({ ...setup, names: [...setup.names, `Player ${setup.names.length + 1}`] })
              }
            >
              + add player
            </button>
          )}

          <h3 style={{ ...S.h3, marginTop: 18 }}>Shuffle seed</h3>
          <p style={S.hint}>Same seed → same decks. Handy for reproducing a bug.</p>
          <input
            style={S.input}
            value={setup.seed}
            onChange={(e) => setSetup({ ...setup, seed: e.target.value })}
          />

          <div style={{ marginTop: 18 }}>
            <button style={S.btn} onClick={startGame}>
              Start election
            </button>
          </div>
          {error && <p style={S.error}>{error}</p>}
        </div>
        <StubNotice />
      </Shell>
    )
  }

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const standings = Game.getStandings(game)
  const rights = Board.gerrymanderingRights(game.board)
  const powers = Ideology.activePowerList(player.ideologyCards)
  const activePowers = Game.availablePowers(game)
  const counts = Ideology.ideologueCounts(player.ideologyCards)
  const finished = game.phase === GAME_PHASES.FINISHED
  const pendingCard = game.pendingIdeologyCard
    ? Ideology.getIdeologyCard(game.pendingIdeologyCard)
    : null

  const selectedCard = selection ? Voter.getVoterCard(game.market.open[selection.openIndex]) : null
  const votersNeeded = selectedCard ? selectedCard.voters : 0

  // -------------------------------------------------------------------------
  // Board interaction
  // -------------------------------------------------------------------------

  function onAreaClick(zoneId, areaIndex) {
    if (finished) return
    const occupant = game.board.zones[zoneId].owners[areaIndex]

    // Board-targeted Ideologue powers.
    if (powerMode && ['breakingGround', 'payback', 'toughLove'].includes(powerMode.action)) {
      if (!occupant) return setError('Select a voter.')
      setError(null)

      if (powerMode.action === 'breakingGround') {
        apply(Game.breakingGround(game, { zoneId, areaIndex }))
        setPowerMode(null)
        return
      }
      if (powerMode.action === 'payback') {
        apply(Game.payback(game, { zoneId, areaIndex }))
        setPowerMode(null)
        return
      }
      // Tough Love converts two voters, same owner, same zone.
      const picked = powerMode.picked || []
      if (picked.length && picked[0].zoneId !== zoneId) {
        return setError('Both voters must be in the same zone.')
      }
      const next = [...picked, { zoneId, areaIndex }]
      if (next.length < 2) {
        setPowerMode({ ...powerMode, picked: next })
        return
      }
      apply(Game.toughLove(game, { zoneId, areaIndices: next.map((p) => p.areaIndex) }))
      setPowerMode(null)
      return
    }

    // Gerrymander: pick source, then destination.
    if (gerry) {
      if (!gerry.from) {
        if (!occupant) return setError('Pick a voter to move.')
        setError(null)
        setGerry({ ...gerry, from: { zoneId, areaIndex } })
        return
      }
      if (occupant) return setError('Destination must be an empty area.')
      apply(
        Game.gerrymander(game, {
          rightsZoneId: gerry.rightsZoneId,
          from: gerry.from,
          to: { zoneId, areaIndex },
        })
      )
      setGerry(null)
      return
    }

    // Placing an evicted voter.
    if (!selection && (game.board.evicted[player.id] || 0) > 0 && !occupant) {
      apply(Game.placeEvicted(game, { zoneId, areaIndex }))
      return
    }

    // Selecting areas for an influenced Voter Card.
    if (!selection) return
    if (occupant) return setError('That area is taken.')
    if (selection.zoneId && selection.zoneId !== zoneId) {
      return setError('Voters from one Voter Card cannot be split across zones.')
    }

    const areas = [...selection.areas, areaIndex]
    setError(null)

    if (areas.length < votersNeeded) {
      setSelection({ ...selection, zoneId, areas })
      return
    }

    const result = Game.influence(game, rngRef.current, {
      openIndex: selection.openIndex,
      zoneId,
      areaIndices: areas,
    })
    apply(result)
    setSelection(null)
  }

  function selectVoterCard(openIndex, affordable) {
    if (finished) return
    if (game.turnPhase !== TURN_PHASES.ACTIONS) {
      return setError('Answer your Ideology Card first.')
    }
    if (!affordable) return setError('You cannot afford that card.')
    setGerry(null)
    setError(null)
    setSelection({ openIndex, zoneId: null, areas: [] })
  }

  function wasteCard(openIndex) {
    // p.9 — a card with nowhere to fit is paid for and its voters discarded.
    const result = Game.influence(game, rngRef.current, {
      openIndex,
      zoneId: ZONE_IDS[0],
      areaIndices: [],
    })
    apply(result)
    setSelection(null)
  }

  function submitCapDiscard() {
    apply(Game.discardToCap(game, capDiscard))
    setCapDiscard(R.emptyPool())
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Shell>
      <Head>
        <title>SHASN prototype</title>
      </Head>

      <div style={S.topBar}>
        <div>
          <h1 style={{ ...S.h1, margin: 0, fontSize: 22 }}>SHASN — hot-seat prototype</h1>
          <span style={S.muted}>
            Turn {game.turnNumber} · seed {game.seed}
            {game.finalRoundSeatsRemaining !== null && !finished && ' · FINAL ROUND'}
          </span>
        </div>
        <button style={S.btnGhost} onClick={() => setGame(null)}>
          restart
        </button>
      </div>

      {finished ? (
        <div style={{ ...S.panel, borderColor: '#4fa363' }}>
          <h2 style={S.h2}>Election over</h2>
          <Scoreboard
            standings={standings}
            breakdown={Game.getScoreBreakdown(game)}
            colorOf={colorOf}
            finished
          />
        </div>
      ) : (
        <div style={{ ...S.panel, borderColor: colorOf(player.id) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={S.h2}>
              <span style={{ ...S.dot, background: colorOf(player.id) }} />
              {player.name}
            </h2>
            <span style={S.phaseTag}>{game.turnPhase}</span>
          </div>

          <ResourceRow pool={player.pool} cap={player.resourceCap} />

          {/* --- Ideology phase --- */}
          {game.turnPhase === TURN_PHASES.IDEOLOGY && pendingCard && (
            <IdeologyPrompt
              pending={{
                prompt: pendingCard.prompt,
                advisory: pendingCard.advisory,
                // Hot-seat: the answering player must not see the payouts either
                // (p.12), so redact locally the way the server does online.
                answers: pendingCard.answers.map((a) => ({ text: a.text })),
              }}
              reveal={reveal}
              onAnswer={(i) => {
                const r = Game.answerIdeology(game, i)
                if (r.error) return setError(r.error)
                setError(null)
                setGame(r.game)
                setReveal(r.reveal)
              }}
              onRedraw={() => apply(Game.redrawIdeology(game, rngRef.current))}
              onRevealDone={() => setReveal(null)}
            />
          )}

          {/* --- Resource cap phase --- */}
          {game.turnPhase === TURN_PHASES.RESOURCE_CAP && (
            <div style={{ ...S.subPanel, borderColor: '#c9a227' }}>
              <p style={S.prompt}>
                Over the cap of {player.resourceCap}. Hand back exactly{' '}
                <strong>{R.excessOverCap(player.pool, player.resourceCap)}</strong> — click tokens
                on the chain to lift them off (p.11).
              </p>
              <ResourceChain
                pool={player.pool}
                cap={player.resourceCap}
                selected={capDiscard}
                size={30}
                onTokenClick={(resourceId) => {
                  const need = R.excessOverCap(player.pool, player.resourceCap)
                  const held = player.pool[resourceId] || 0
                  const marked = capDiscard[resourceId] || 0
                  if (marked >= held || R.poolTotal(capDiscard) >= need) {
                    if (marked > 0) setCapDiscard({ ...capDiscard, [resourceId]: marked - 1 })
                    return
                  }
                  setCapDiscard({ ...capDiscard, [resourceId]: marked + 1 })
                }}
              />
              <div style={{ marginTop: 10 }}>
                <button
                  style={S.btn}
                  disabled={
                    R.poolTotal(capDiscard) !== R.excessOverCap(player.pool, player.resourceCap)
                  }
                  onClick={submitCapDiscard}
                >
                  Hand back {R.poolTotal(capDiscard)}
                </button>
                <button
                  style={{ ...S.btnGhost, marginLeft: 8 }}
                  onClick={() => setCapDiscard(R.autoDiscardToCap(player.pool, player.resourceCap))}
                >
                  auto-pick
                </button>
              </div>
            </div>
          )}

          {/* --- Actions phase --- */}
          {game.turnPhase === TURN_PHASES.ACTIONS && (
            <div style={S.subPanel}>
              <p style={S.hint}>
                No action points — take as many actions as you can afford, in any order (p.22).
              </p>

              <h4 style={S.h4}>Voter Cards</h4>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Voter.affordableCards(game.market, player.pool).map((o) => {
                  const anyRoom = ZONE_IDS.some((z) =>
                    Board.canPlaceCard(game.board, z, o.card.voters)
                  )
                  const active = selection?.openIndex === o.openIndex
                  return (
                    <div
                      key={o.openIndex}
                      style={{
                        ...S.voterCard,
                        opacity: o.affordable ? 1 : 0.45,
                        borderColor: active ? '#111' : '#d8d2c4',
                        borderWidth: active ? 2 : 1,
                      }}
                      onClick={() => selectVoterCard(o.openIndex, o.affordable)}
                    >
                      <div style={S.voterCount}>{o.card.voters}</div>
                      <div style={S.pips}>
                        {RESOURCE_IDS.flatMap((id) =>
                          Array.from({ length: o.cost[id] || 0 }, (_, k) => (
                            <span
                              key={`${id}${k}`}
                              style={{ ...S.pip, background: RESOURCES[id].color }}
                              title={RESOURCES[id].label}
                            />
                          ))
                        )}
                        {Array.from({ length: o.cost.any || 0 }, (_, k) => (
                          <span
                            key={`any${k}`}
                            style={{ ...S.pip, background: '#fff', border: '1px solid #999' }}
                            title="Any resource"
                          />
                        ))}
                      </div>
                      {!anyRoom && o.affordable && (
                        <button
                          style={S.wasteBtn}
                          onClick={(e) => {
                            e.stopPropagation()
                            wasteCard(o.openIndex)
                          }}
                        >
                          no room — waste it
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {selection && (
                <p style={S.callout}>
                  Click {votersNeeded - selection.areas.length} empty area(s)
                  {selection.zoneId ? ` in ${ZONES[selection.zoneId].label}` : ' in a single zone'}.{' '}
                  <button style={S.linkBtn} onClick={() => setSelection(null)}>
                    cancel
                  </button>
                </p>
              )}

              {(game.board.evicted[player.id] || 0) > 0 && !selection && (
                <p style={S.callout}>
                  You have {game.board.evicted[player.id]} evicted voter(s). Click any empty area to
                  place one, or lose them at end of turn (p.23).
                </p>
              )}

              <h4 style={S.h4}>Gerrymandering</h4>
              {ZONE_IDS.filter((z) => rights[z] === player.id).length === 0 ? (
                <p style={S.hint}>
                  No Gerrymandering Rights — you need strictly the most voters in a zone (p.15).
                </p>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ZONE_IDS.filter((z) => rights[z] === player.id).map((z) => (
                    <button
                      key={z}
                      style={{
                        ...S.btnGhost,
                        borderColor: gerry?.rightsZoneId === z ? '#111' : '#d8d2c4',
                      }}
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
                  {gerry.from
                    ? 'Now click an empty destination area.'
                    : 'Click a voter to move (non-majority, not in a Volatile Area).'}{' '}
                  <button style={S.linkBtn} onClick={() => setGerry(null)}>
                    cancel
                  </button>
                </p>
              )}

              <h4 style={S.h4}>Conspiracy Cards</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  style={S.btnGhost}
                  onClick={() => apply(Game.buyConspiracy(game, rngRef.current))}
                >
                  Buy top card (any 4)
                </button>
                <span style={S.hint}>{game.conspiracyDeck.drawPile.length} left in the deck</span>
              </div>
              {player.conspiracyCards.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {player.conspiracyCards.map((cardId, i) => {
                    const c = Cards.getConspiracyCard(cardId)
                    return (
                      <div key={`${cardId}${i}`} style={S.conspiracyCard}>
                        <strong style={{ fontSize: 12 }}>{c.name}</strong>
                        <span style={S.cardText}>{c.text}</span>
                        <button
                          style={S.wasteBtn}
                          onClick={() => apply(Game.playConspiracy(game, { cardId }))}
                        >
                          play
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              <h4 style={S.h4}>Ideologue powers</h4>
              {activePowers.length === 0 ? (
                <p style={S.hint}>
                  None unlocked. 3 cards of one Ideologue unlocks Level 3, 5 unlocks Level 5 (p.14).
                </p>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {activePowers.map((p) => (
                    <button
                      key={`${p.ideologue}${p.level}`}
                      style={{
                        ...S.powerBtn,
                        borderColor: IDEOLOGUES[p.ideologue].color,
                        opacity: p.remaining > 0 ? 1 : 0.4,
                      }}
                      disabled={p.remaining === 0}
                      onClick={() => setPowerMode({ ...p, step: 'start' })}
                      title={p.text}
                    >
                      <strong>{p.name}</strong>
                      <span style={S.hint}>
                        L{p.level} · {p.remaining === Infinity ? 'passive' : `${p.remaining} left`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {powerMode && (
                <PowerPanel
                  power={powerMode}
                  game={game}
                  player={player}
                  onCancel={() => setPowerMode(null)}
                  onRun={(result) => {
                    apply(result)
                    setPowerMode(null)
                  }}
                />
              )}

              <div style={{ marginTop: 16 }}>
                <button style={S.btn} onClick={() => apply(Game.endTurn(game, rngRef.current))}>
                  End turn
                </button>
                {game.pendingHeadlines.length > 0 && (
                  <span style={{ ...S.hint, marginLeft: 10 }}>
                    {game.pendingHeadlines.length} Headline(s) must resolve first
                  </span>
                )}
              </div>
            </div>
          )}

          {/* --- Headlines queued from Volatile Areas (p.17) --- */}
          {game.pendingHeadlines.length > 0 && !game.awaitingResolution && (
            <div style={{ ...S.subPanel, borderColor: '#b3452f' }}>
              <p style={S.prompt}>
                <strong>{game.pendingHeadlines.length} Headline(s) pending.</strong> A voter landed
                in a Volatile Area — Headlines resolve at the end of the turn, in the order the
                voters were placed.
              </p>
              <button
                style={S.btn}
                onClick={() => apply(Game.resolveNextHeadline(game, rngRef.current))}
              >
                Draw the next Headline
              </button>
            </div>
          )}

          {/* --- A card that needs resolving --- */}
          {game.awaitingResolution && (
            <CardResolver
              kind={game.awaitingResolution.kind}
              card={
                game.awaitingResolution.kind === 'headline'
                  ? Cards.getHeadlineCard(game.awaitingResolution.cardId)
                  : Cards.getConspiracyCard(game.awaitingResolution.cardId)
              }
              prompt={game.awaitingResolution.prompt}
              onResolve={(choice) => apply(Game.resolveAwaiting(game, { choice }))}
              onManual={(n) => apply(Game.resolveAwaiting(game, { note: n }))}
            />
          )}

          {error && <p style={S.error}>{error}</p>}

          {Game.isStalled(game) && (
            <div style={S.stall}>
              <strong>The campaign has stalled.</strong> Every player is at the resource cap and
              none of the three open Voter Cards can be paid for. Because the market only cycles
              when a card is bought, nothing can change from here.
              <br />
              <br />
              In the physical game you would escape this by trading (p.11) or with the Capitalist's
              Prospecting power, "give 1 resource, take any 2" (p.23). Both are later phases — until
              they exist, restart with a different seed.
            </div>
          )}
        </div>
      )}

      {/* --- Board --- */}
      <div style={{ margin: '16px 0' }}>
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
          onAreaClick={finished ? null : onAreaClick}
        />
        <DeckStrip
          conspiracyDeck={game.conspiracyDeck}
          headlineDeck={game.headlineDeck}
          pendingHeadlines={game.pendingHeadlines?.length || 0}
          canBuy={!finished && game.turnPhase === TURN_PHASES.ACTIONS}
          hand={player.conspiracyCards?.length || 0}
          onBuyConspiracy={() => apply(Game.buyConspiracy(game, rngRef.current))}
        />
      </div>

      {/* --- Player status --- */}
      <div style={S.columns}>
        <div style={S.panel}>
          <h3 style={S.h3}>Scores</h3>
          <Scoreboard standings={standings} colorOf={colorOf} myPlayerId={player.id} />

          <h3 style={{ ...S.h3, marginTop: 18 }}>{player.name}'s unlocked powers</h3>
          {powers.length === 0 ? (
            <p style={S.hint}>
              None yet. Collect 3 cards of one Ideologue for Level 3, 5 for Level 5 (p.14). Passive
              income is 1 resource per 2 cards.
            </p>
          ) : (
            <ul style={S.list}>
              {powers.map((p) => (
                <li key={p.key}>
                  <strong style={{ color: IDEOLOGUES[p.ideologue].color }}>
                    L{p.level} {p.name}
                  </strong>{' '}
                  — {p.text}
                  <span style={S.notWired}> not wired yet</span>
                </li>
              ))}
            </ul>
          )}
          <p style={S.hint}>
            Passive income next turn:{' '}
            {RESOURCE_IDS.filter((id) => Ideology.passiveIncome(player.ideologyCards)[id] > 0)
              .map((id) => `+${Ideology.passiveIncome(player.ideologyCards)[id]} ${RESOURCES[id].label}`)
              .join(', ') || 'none'}
          </p>
        </div>

        <div style={S.panel}>
          <h3 style={S.h3}>Campaign log</h3>
          <div style={S.log}>
            {[...game.log]
              .reverse()
              .slice(0, 40)
              .map((l, i) => (
                <div key={i} style={S.logLine}>
                  <span style={S.logType}>{l.type}</span>
                  {l.message}
                </div>
              ))}
          </div>
          <h3 style={{ ...S.h3, marginTop: 14 }}>Public Reserve</h3>
          <ResourceRow pool={game.reserve} />
          {game.pendingHeadlines.length > 0 && (
            <p style={S.hint}>
              {game.pendingHeadlines.length} Headline(s) queued from Volatile Areas — effects land
              in Phase 5.
            </p>
          )}
        </div>
      </div>

      <StubNotice />
    </Shell>
  )
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ResourceRow({ pool, cap }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
      {RESOURCE_IDS.map((id) => (
        <span key={id} style={{ ...S.chip, background: RESOURCES[id].color }}>
          {RESOURCES[id].label}: <strong>{pool[id] || 0}</strong>
        </span>
      ))}
      {cap !== undefined && (
        <span style={{ ...S.hint, marginLeft: 4 }}>
          total {R.poolTotal(pool)} / cap {cap}
        </span>
      )}
    </div>
  )
}

function StubNotice() {
  return (
    <p style={S.stub}>
      ⚠ Card content is placeholder. The 60 Voter Cards and 24 Ideology Cards are generated to the
      rulebook's spec so the engine is playable — costs and payouts are an invented balance curve,
      not the real decks. Volatile Area positions and zone adjacency in <code>zones.js</code> are
      also provisional pending a full board scan.
    </p>
  )
}

function Shell({ children }) {
  return (
    <div style={S.page}>
      <div style={S.container}>{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S = {
  page: { background: '#f0ece1', minHeight: '100vh', padding: '24px 16px', fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif', color: '#2b2b2b' },
  container: { maxWidth: 1180, margin: '0 auto' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  h1: { fontSize: 26, margin: '0 0 6px' },
  h2: { fontSize: 19, margin: '0 0 4px' },
  h3: { fontSize: 15, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b6559' },
  h4: { fontSize: 13, margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b6559' },
  muted: { color: '#6b6559', fontSize: 13 },
  hint: { color: '#8a8478', fontSize: 12, margin: '4px 0' },
  panel: { background: '#fff', border: '1px solid #d8d2c4', borderRadius: 10, padding: 16, marginBottom: 16 },
  subPanel: { border: '1px solid #e6e0d2', borderRadius: 8, padding: 12, marginTop: 10 },
  columns: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 },
  input: { padding: '7px 10px', border: '1px solid #d8d2c4', borderRadius: 6, fontSize: 14, flex: 1, minWidth: 0 },
  btn: { padding: '9px 16px', background: '#2b2b2b', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' },
  btnGhost: { padding: '7px 12px', background: '#fff', border: '1px solid #d8d2c4', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  linkBtn: { background: 'none', border: 'none', color: '#b3452f', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, padding: 0 },
  stepBtn: { width: 22, height: 22, border: '1px solid #d8d2c4', background: '#fff', borderRadius: 4, cursor: 'pointer', lineHeight: 1 },
  answerBtn: { flex: '1 1 240px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, padding: 12, background: '#fff', border: '2px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  answerText: { color: '#4a4a4a' },
  payout: { fontSize: 11, color: '#6b6559' },
  prompt: { fontSize: 15, margin: '0 0 12px', lineHeight: 1.45 },
  phaseTag: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, background: '#efeadd', padding: '3px 8px', borderRadius: 4, color: '#6b6559' },
  callout: { background: '#fdf6e3', border: '1px solid #e8dcb8', borderRadius: 6, padding: '8px 10px', fontSize: 13, margin: '10px 0' },
  error: { color: '#b3452f', fontSize: 13, marginTop: 10 },
  dot: { display: 'inline-block', width: 10, height: 10, borderRadius: '50%', marginRight: 7, verticalAlign: 'middle' },
  chip: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, color: '#fff', marginRight: 4, whiteSpace: 'nowrap' },
  countChip: { display: 'inline-block', minWidth: 16, textAlign: 'center', padding: '1px 5px', borderRadius: 8, fontSize: 10, color: '#fff', marginRight: 3 },
  boardWrap: { background: '#fff', border: '1px solid #d8d2c4', borderRadius: 10, padding: 12, marginBottom: 16 },
  boardRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 },
  zone: { border: '1px solid #d8d2c4', borderRadius: 8, padding: 10, minHeight: 120 },
  zoneHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, marginBottom: 8 },
  zoneReq: { fontSize: 12, color: '#6b6559', fontVariantNumeric: 'tabular-nums' },
  areas: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 },
  area: { width: 17, height: 17, borderRadius: '50%', padding: 0, cursor: 'pointer' },
  zoneFoot: { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  gerryTag: { fontSize: 9, textTransform: 'uppercase', border: '1px solid', borderRadius: 3, padding: '0 4px', color: '#6b6559' },
  majorityTag: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, background: '#2b2b2b', color: '#fff', borderRadius: 3, padding: '1px 5px' },
  voterCard: { width: 96, border: '1px solid #d8d2c4', borderRadius: 8, padding: 10, cursor: 'pointer', background: '#fff', textAlign: 'center' },
  voterCount: { fontSize: 30, fontWeight: 700, lineHeight: 1 },
  pips: { display: 'flex', gap: 3, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' },
  pip: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },
  wasteBtn: { marginTop: 8, fontSize: 10, padding: '3px 5px', border: '1px solid #d8d2c4', borderRadius: 4, background: '#fff', cursor: 'pointer' },
  discardControl: { display: 'flex', alignItems: 'center', gap: 5 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e6e0d2', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b6559' },
  td: { padding: '6px 8px', borderBottom: '1px solid #f0ece1' },
  list: { margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 },
  notWired: { fontSize: 10, background: '#efeadd', color: '#8a8478', borderRadius: 3, padding: '1px 5px', marginLeft: 6 },
  log: { maxHeight: 260, overflowY: 'auto', fontSize: 12, lineHeight: 1.6 },
  logLine: { padding: '3px 0', borderBottom: '1px solid #f4f1ea' },
  logType: { display: 'inline-block', minWidth: 74, fontSize: 10, textTransform: 'uppercase', color: '#a09a8c' },
  stub: { fontSize: 11, color: '#8a8478', lineHeight: 1.6, marginTop: 8 },
  stall: { background: '#fdecea', border: '1px solid #e8b4ae', borderRadius: 6, padding: '10px 12px', fontSize: 13, lineHeight: 1.5, marginTop: 12 },
  conspiracyCard: { width: 150, border: '1px solid #d8d2c4', borderRadius: 8, padding: 9, background: '#fffdf6', display: 'flex', flexDirection: 'column', gap: 5 },
  cardText: { fontSize: 10, color: '#6b6559', lineHeight: 1.45, whiteSpace: 'pre-wrap', maxHeight: 78, overflowY: 'auto' },
  cardBody: { fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#fbf8f0', padding: 10, borderRadius: 6, margin: '0 0 8px' },
  powerBtn: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '7px 11px', background: '#fff', border: '2px solid #ddd', borderRadius: 7, cursor: 'pointer', fontSize: 12, textAlign: 'left' },
  powerPanel: { border: '1px solid #e6e0d2', background: '#fbf8f0', borderRadius: 8, padding: 12, marginTop: 10 },
  chipBtn: { padding: '4px 9px', borderRadius: 10, fontSize: 11, color: '#fff', border: 'none', cursor: 'pointer' },
}
