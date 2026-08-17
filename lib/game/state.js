// Game state logic for Sashan election strategy game
// Handles board initialization, action validation, and state mutations

// Constants import
import {
  AP_PER_ROUND,
  MAX_ROUNDS,
  RALLY_AP_COST,
  RALLY_BONUS,
  BLOCS,
  BLOC_IDS,
  EVENT_ROUND_INTERVAL,
  SCORING_CHECKPOINT_ROUNDS,
  RESOURCE_CAP,
  createPlayerSupportMap,
} from './constants'

import { getCard, drawRandomCard, drawRandomScandalCard, drawEventCard, getEventCard, SCANDAL_CARDS } from './cards'
import { totalSupport, applyAllianceOutcome, scoringCheckpointSnapshot } from './scoring'

// Initialize resources for a player
function initPlayerResources() {
  return {
    [RESOURCES.trust.id]: 0,
    [RESOURCES.clout.id]: 0,
    [RESOURCES.media.id]: 0,
    [RESOURCES.funds.id]: 0,
  }
}

// Gain resources from playing an ideology card
function gainResourcesFromCard(playerState, playerId, card) {
  const resourceGains = {
    // Policy cards that grant resources
    border_rail_pledge: [[RESOURCES.trust.id, 1]],
    crop_insurance_bill: [[RESOURCES.trust.id, 1]],
    chamber_of_commerce_tour: [[RESOURCES.funds.id, 1]],
    port_modernization_scheme: [[RESOURCES.media.id, 1]],
    labor_charter_march: [[RESOURCES.trust.id, 1]],
    river_dam_compromise: [[RESOURCES.media.id, 1]],
    hill_state_autonomy: [[RESOURCES.trust.id, 1]],
    startup_futures_summit: [[RESOURCES.media.id, 1]],
    delta_relief_fleet: [[RESOURCES.trust.id, 1]],
    federal_unity_rally: [[RESOURCES.trust.id, 2]],
    logistics_corridor_push: [[RESOURCES.funds.id, 1]],
    public_broadcast_forum: [[RESOURCES.media.id, 1]],
    rural_health_mission: [[RESOURCES.trust.id, 1]],
    // Scandal cards
    leaked_dossier: [[RESOURCES.clout.id, 1]],
    smear_campaign: [[RESOURCES.media.id, 1]],
    border_incident_report: [[RESOURCES.clout.id, 1]],
    agrarian_exploitation_expose: [[RESOURCES.trust.id, 1]],
    factory_bribery_allegation: [[RESOURCES.clout.id, 1]],
    coastal_corruption_files: [[RESOURCES.funds.id, 1]],
    highland_betrayal_broadcast: [[RESOURCES.trust.id, 1]],
    delta_negligence_report: [[RESOURCES.trust.id, 1]],
    riverland_patronage_scandal: [[RESOURCES.media.id, 1]],
    national_credibility_collapse: [[RESOURCES.trust.id, -2], [RESOURCES.media.id, -2]],
  }

  const gains = resourceGains[card.id]
  if (!gains) return playerState

  let newState = { ...playerState }
  for (const [resourceId, amount] of gains) {
    const current = newState.resources?.[resourceId] || 0
    const newAmount = Math.min(RESOURCE_CAP, Math.max(0, current + amount))
    newState = {
      ...newState,
      resources: {
        ...newState.resources,
        [resourceId]: newAmount,
      },
    }
  }
  return newState
}

// Check if player needs to discard excess resources over cap
function checkResourceCap(playerState) {
  const resources = playerState.resources || {}
  const excess = {}
  for (const [resourceId, amount] of Object.entries(resources)) {
    if (amount > RESOURCE_CAP) {
      excess[resourceId] = amount - RESOURCE_CAP
    }
  }
  return Object.keys(excess).length > 0 ? excess : null
}

// How many pips to show per zone (represents the vote scale)
const PIPS_PER_ZONE = 20

// Uneven zone layout positions (x, y, width, height) - irregular pattern
// These positions are designed to create an "uneven zonal pattern" as seen in the board design
const ZONE_LAYOUT = {
  frontier:  { x: 40,  y: 40,  w: 120, h: 100 },
  agraria:   { x: 200, y: 20,  w: 100, h: 130 },
  capital:   { x: 350, y: 50,  w: 110, h: 90 },
  coast:     { x: 500, y: 15,  w: 95,  h: 120 },
  foundry:   { x: 420, y: 140, w: 100, h: 80 },
  riverland: { x: 300, y: 160, w: 110, h: 90 },
  highlands: { x: 150, y: 150, w: 95,  h: 85 },
  metro:     { x: 50,  y: 130, w: 90,  h: 100 },
  delta:     { x: 600, y: 130, w: 95,  h: 95 },
}

// Board initialisation
export function initBoardState(playerIds) {
  return {
    playerSupport: createPlayerSupportMap(playerIds),
    turnOrder: [...playerIds],
    // Alliance state
    pendingAlliances: [],
    resolvedAlliances: [],
    // Event tracking
    usedEventIds: [],
    lastEventCard: null,
    // Public resources pool
    publicResources: {
      [RESOURCES.trust.id]: PUBLIC_RESOURCE_START,
      [RESOURCES.clout.id]: PUBLIC_RESOURCE_START,
      [RESOURCES.media.id]: PUBLIC_RESOURCE_START,
      [RESOURCES.funds.id]: PUBLIC_RESOURCE_START,
    },
    // Scoring checkpoint snapshots
    checkpointSnapshots: {},
    // Log
    log: [{
      type: 'system',
      message: 'The campaign begins. May the best candidate win.',
      at: new Date().toISOString(),
    }],
  }
}

// Turn helpers
export function getNextPlayerId(turnOrder, currentId) {
  const idx = turnOrder.indexOf(currentId)
  if (idx === -1) return turnOrder[0]
  return turnOrder[(idx + 1) % turnOrder.length]
}

export function isPlayerTurn(gameState, playerId) {
  return gameState.current_turn_player_id === playerId && gameState.phase === 'campaign'
}

// Validation
export function validateAction(gameState, playerState, playerId, action) {
  if (gameState.phase === 'finished') {
    return { ok: false, error: 'Game is over' }
  }
  if (!isPlayerTurn(gameState, playerId)) {
    return { ok: false, error: 'Not your turn' }
  }

  if (action.type === 'play_card') {
    const card = getCard(action.cardId)
    if (!card) return { ok: false, error: 'Unknown card' }
    if (!playerState.hand?.includes(action.cardId)) {
      return { ok: false, error: 'Card not in hand' }
    }
    if (playerState.action_points < card.apCost) {
      return { ok: false, error: 'Not enough action points' }
    }
    // Scandal cards additionally require a valid target
    if (card.cardType === 'scandal') {
      if (!action.targetPlayerId) {
        return { ok: false, error: 'Scandal card requires a target player' }
      }
      if (action.targetPlayerId === playerId) {
        return { ok: false, error: 'Cannot target yourself with a scandal card' }
      }
    }
    return { ok: true, card }
  }

  if (action.type === 'rally') {
    if (!action.bloc || !BLOC_IDS.includes(action.bloc)) {
      return { ok: false, error: 'Invalid zone' }
    }
    if (playerState.action_points < RALLY_AP_COST) {
      return { ok: false, error: 'Not enough action points for rally' }
    }
    return { ok: true }
  }

  if (action.type === 'propose_alliance') {
    const { targetPlayerId, proposerBloc, targetBloc } = action
    if (!targetPlayerId || targetPlayerId === playerId) {
      return { ok: false, error: 'Invalid alliance target' }
    }
    if (!proposerBloc || !BLOC_IDS.includes(proposerBloc)) {
      return { ok: false, error: 'Invalid proposer bloc' }
    }
    if (!targetBloc || !BLOC_IDS.includes(targetBloc)) {
      return { ok: false, error: 'Invalid target bloc' }
    }
    // Only one pending alliance per pair
    const board = gameState.board_state || {}
    const alreadyPending = (board.pendingAlliances || []).some(
      (a) =>
        (a.proposerId === playerId && a.targetId === targetPlayerId) ||
        (a.proposerId === targetPlayerId && a.targetId === playerId)
    )
    if (alreadyPending) {
      return { ok: false, error: 'An alliance with this player is already pending' }
    }
    if (playerState.action_points < 1) {
      return { ok: false, error: 'Not enough AP to propose an alliance' }
    }
    return { ok: true }
  }

  if (action.type === 'end_turn') {
    return { ok: true }
  }

  return { ok: false, error: 'Unknown action' }
}

// Internal board mutation helpers
function appendLog(boardState, entry) {
  const log = [...(boardState.log || []), { ...entry, at: new Date().toISOString() }]
  return { ...boardState, log: log.slice(-50) }
}

function applySupport(boardState, playerId, effects) {
  const playerSupport = { ...boardState.playerSupport }
  const mine = { ...playerSupport[playerId] }
  for (const { bloc, amount } of effects) {
    mine[bloc] = Math.max(0, (mine[bloc] || 0) + amount)
  }
  playerSupport[playerId] = mine
  return { ...boardState, playerSupport }
}

// Apply an event card's deltaAll effects to ALL players
function applyEventCard(boardState, eventCard, playerIds) {
  let board = { ...boardState }
  for (const effect of eventCard.effects) {
    const { bloc, deltaAll } = effect
    for (const pid of playerIds) {
      const playerSupport = { ...board.playerSupport }
      const mine = { ...playerSupport[pid] }
      mine[bloc] = Math.max(0, (mine[bloc] || 0) + deltaAll)
      playerSupport[pid] = mine
      board = { ...board, playerSupport }
    }
  }
  return board
}

// Main action processor
export function applyAction(gameState, playerStates, playerId, action, playerNickname) {
  const playerState = playerStates.find((ps) => ps.player_id === playerId)
  const validation = validateAction(gameState, playerStates, playerId, action)
  if (!validation.ok) return { ok: false, error: validation.error }

  let nextGameState = { ...gameState }
  let nextPlayerState = { ...playerState }
  let nextBoard = { ...(gameState.board_state || {}) }
  // Ensure Phase 3 fields exist on older game records
  if (!nextBoard.pendingAlliances) nextBoard.pendingAlliances = []
  if (!nextBoard.resolvedAlliances) nextBoard.resolvedAlliances = []
  if (!nextBoard.usedEventIds) nextBoard.usedEventIds = []
  if (!nextBoard.checkpointSnapshots) nextBoard.checkpointSnapshots = {}

  // ---- play_card (policy or scandal) ----
  if (action.type === 'play_card') {
    const card = validation.card

    if (card.cardType === 'scandal') {
      // Apply negative effects to the target player
      nextBoard = applySupport(nextBoard, action.targetPlayerId, card.effects)
      nextBoard = appendLog(nextBoard, {
        type: 'scandal',
        playerId,
        targetPlayerId: action.targetPlayerId,
        message: `${playerNickname} played ${card.name} against their rival`,
      })
    } else {
      // Standard policy card — positive effects on self and grant resources
      nextBoard = applySupport(nextBoard, playerId, card.effects)
      // Grant resources to the player
      nextPlayerState = gainResourcesFromCard(nextPlayerState, playerId, card)
      // Check resource cap and discard if needed
      const excess = checkResourceCap(nextPlayerState)
      if (excess) {
        // Auto-discard resources exceeding cap (player chooses later in UI)
        for (const [resourceId, amount] of Object.keys(excess)) {
          nextPlayerState = {
            ...nextPlayerState,
            resources: {
              ...nextPlayerState.resources,
              [resourceId]: Math.max(0, nextPlayerState.resources[resourceId] - amount),
            },
          }
        }
      }
      nextBoard = appendLog(nextBoard, {
        type: 'play_card',
        playerId,
        message: `${playerNickname} played ${card.name}`,
      })
    }

    nextPlayerState = {
      ...nextPlayerState,
      hand: nextPlayerState.hand.filter((id) => id !== action.cardId),
      action_points: nextPlayerState.action_points - card.apCost,
      influence_score: totalSupport(nextBoard.playerSupport[playerId]),
    }
    nextGameState = { ...nextGameState, board_state: nextBoard }
  }

  // ---- rally ----
  if (action.type === 'rally') {
    nextBoard = applySupport(nextBoard, playerId, [{ bloc: action.bloc, amount: RALLY_BONUS }])
    nextBoard = appendLog(nextBoard, {
      type: 'rally',
      playerId,
      message: `${playerNickname} held a rally in ${BLOCS[action.bloc]?.label || action.bloc}`,
    })
    nextPlayerState = {
      ...nextPlayerState,
      action_points: nextPlayerState.action_points - RALLY_AP_COST,
      influence_score: totalSupport(nextBoard.playerSupport[playerId]),
    }
    nextGameState = { ...nextGameState, board_state: nextBoard }
  }

  // ---- propose_alliance ----
  if (action.type === 'propose_alliance') {
    const { targetPlayerId, proposerBloc, targetBloc } = action
    const allianceId = `alliance_${playerId}_${targetPlayerId}_r${gameState.round}`
    const newAlliance = {
      id: allianceId,
      proposerId: playerId,
      targetId: targetPlayerId,
      proposerBloc,
      targetBloc,
      round: gameState.round,
    }
    nextBoard = {
      ...nextBoard,
      pendingAlliances: [...nextBoard.pendingAlliances, newAlliance],
    }
    nextBoard = appendLog(nextBoard, {
      type: 'alliance_proposed',
      playerId,
      targetPlayerId,
      message: `${playerNickname} has proposed a secret alliance`,
    })
    nextPlayerState = {
      ...nextPlayerState,
      action_points: nextPlayerState.action_points - 1,
    }
    nextGameState = { ...nextGameState, board_state: nextBoard }
  }

  // ---- end_turn ----
  if (action.type === 'end_turn') {
    const turnOrder = nextBoard.turnOrder || []
    const nextPlayerId = getNextPlayerId(turnOrder, playerId)
    const currentIdx = turnOrder.indexOf(playerId)
    const isLastInRound = currentIdx === turnOrder.length - 1

    nextPlayerState = {
      ...nextPlayerState,
      influence_score: totalSupport(nextBoard.playerSupport[playerId]),
    }

    if (isLastInRound) {
      const nextRound = gameState.round + 1

      if (nextRound > MAX_ROUNDS) {
        // Game over
        nextGameState = {
          ...nextGameState,
          board_state: appendLog(nextBoard, {
            type: 'system',
            message: 'Final round complete. Tallying results…',
          }),
          round: MAX_ROUNDS,
          phase: 'finished',
          current_turn_player_id: null,
        }
        const finalStates = playerStates.map((ps) => ({
          ...ps,
          action_points: 0,
          influence_score: totalSupport(nextBoard.playerSupport[ps.player_id]),
        }))
        return { ok: true, gameState: nextGameState, playerStates: finalStates, gameOver: true }
      }

      // --- Round boundary processing ---
      let roundBoard = { ...nextBoard }

      // 1. Scoring checkpoint (rounds 3, 6, 9)
      const isCheckpoint = SCORING_CHECKPOINT_ROUNDS.includes(nextRound - 1)
      if (isCheckpoint) {
        const checkRound = nextRound - 1
        const snapshot = scoringCheckpointSnapshot(roundBoard, playerStates.map((ps) => ({
          id: ps.player_id,
          nickname: ps.nickname || ps.player_id,
        })))
        roundBoard = {
          ...roundBoard,
          checkpointSnapshots: {
            ...(roundBoard.checkpointSnapshots || {}),
            [checkRound]: snapshot,
          },
        }
        const leader = snapshot[0]
        roundBoard = appendLog(roundBoard, {
          type: 'checkpoint',
          message: `Scoring checkpoint — Round ${checkRound} complete. ${leader?.nickname || '?'} leads with ${leader?.total ?? 0} support.`,
        })
      }

      // 2. Event card (every EVENT_ROUND_INTERVAL rounds: 3, 6, 9)
      let firedEvent = null
      if ((nextRound - 1) % EVENT_ROUND_INTERVAL === 0) {
        const eventId = drawEventCard(roundBoard.usedEventIds || [])
        if (eventId) {
          const eventCard = getEventCard(eventId)
          const allPlayerIds = playerStates.map((ps) => ps.player_id)
          roundBoard = applyEventCard(roundBoard, eventCard, allPlayerIds)
          roundBoard = {
            ...roundBoard,
            usedEventIds: [...(roundBoard.usedEventIds || []), eventId],
            lastEventCard: { id: eventCard.id, name: eventCard.name, description: eventCard.description },
          }
          roundBoard = appendLog(roundBoard, {
            type: 'event',
            message: `Event: ${eventCard.name} — ${eventCard.description}`,
          })
          firedEvent = eventCard
        }
      } else {
        // Clear the last event card banner after it's been seen for one round
        roundBoard = { ...roundBoard, lastEventCard: null }
      }

      // 3. Refill hands, reset AP
      roundBoard = appendLog(roundBoard, {
        type: 'system',
        message: `Round ${nextRound} begins.`,
      })

      nextGameState = {
        ...nextGameState,
        board_state: roundBoard,
        round: nextRound,
        phase: 'campaign',
        current_turn_player_id: turnOrder[0],
      }

      const updatedPlayerStates = playerStates.map((ps) => {
        const newHand = [...(ps.hand || [])]
        // Deal one policy card into hand if there's room
        if (newHand.length < 5) {
          const drawn = drawRandomCard(newHand)
          if (drawn) newHand.push(drawn)
        }
        // Seed one scandal card every other round, capped at 2 scandal cards in hand
        if (nextRound % 2 === 0) {
          const currentScandalCount = newHand.filter((id) => id in SCANDAL_CARDS).length
          if (currentScandalCount < 2 && newHand.length < 5) {
            const scandalCard = drawRandomScandalCard(newHand)
            if (scandalCard) newHand.push(scandalCard)
          }
        }
        return {
          ...ps,
          hand: newHand,
          action_points: AP_PER_ROUND,
          influence_score: totalSupport(roundBoard.playerSupport[ps.player_id]),
          // Preserve resources across rounds
          resources: ps.resources,
        }
      })

      return {
        ok: true,
        gameState: nextGameState,
        playerStates: updatedPlayerStates,
        endedRound: true,
        firedEvent,
        isCheckpoint: SCORING_CHECKPOINT_ROUNDS.includes(nextRound - 1),
      }
    }

    // Not the last player in the round — just advance turn
    nextBoard = appendLog(nextBoard, {
      type: 'end_turn',
      playerId,
      message: `${playerNickname} ended their turn`,
    })
    nextGameState = {
      ...nextGameState,
      board_state: nextBoard,
      current_turn_player_id: nextPlayerId,
    }
  }

  // Update all player states except the acting player remain unchanged
  const updatedPlayerStates = playerStates.map((ps) =>
    ps.player_id === playerId ? nextPlayerState : ps
  )

  return {
    ok: true,
    gameState: nextGameState,
    playerStates: updatedPlayerStates,
  }
}
