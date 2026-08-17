import {
  AP_PER_ROUND,
  MAX_ROUNDS,
  RALLY_AP_COST,
  RALLY_BONUS,
  BLOC_IDS,
  createPlayerSupportMap,
} from './constants'
import { getCard, drawRandomCard } from './cards'
import { totalSupport } from './scoring'

export function initBoardState(playerIds) {
  return {
    playerSupport: createPlayerSupportMap(playerIds),
    turnOrder: [...playerIds],
    log: [{
      type: 'system',
      message: 'The campaign begins. May the best candidate win.',
      at: new Date().toISOString(),
    }],
  }
}

export function getNextPlayerId(turnOrder, currentId) {
  const idx = turnOrder.indexOf(currentId)
  if (idx === -1) return turnOrder[0]
  return turnOrder[(idx + 1) % turnOrder.length]
}

export function isPlayerTurn(gameState, playerId) {
  return gameState.current_turn_player_id === playerId && gameState.phase === 'campaign'
}

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
    return { ok: true, card }
  }

  if (action.type === 'rally') {
    if (!action.bloc || !BLOC_IDS.includes(action.bloc)) {
      return { ok: false, error: 'Invalid bloc' }
    }
    if (playerState.action_points < RALLY_AP_COST) {
      return { ok: false, error: 'Not enough action points for rally' }
    }
    return { ok: true }
  }

  if (action.type === 'end_turn') {
    return { ok: true }
  }

  return { ok: false, error: 'Unknown action' }
}

function appendLog(boardState, entry) {
  const log = [...(boardState.log || []), { ...entry, at: new Date().toISOString() }]
  return { ...boardState, log: log.slice(-50) }
}

function applySupport(boardState, playerId, effects) {
  const playerSupport = { ...boardState.playerSupport }
  const mine = { ...playerSupport[playerId] }
  for (const { bloc, amount } of effects) {
    mine[bloc] = (mine[bloc] || 0) + amount
  }
  playerSupport[playerId] = mine
  return { ...boardState, playerSupport }
}

export function applyAction(gameState, playerStates, playerId, action, playerNickname) {
  const playerState = playerStates.find((ps) => ps.player_id === playerId)
  const validation = validateAction(gameState, playerState, playerId, action)
  if (!validation.ok) return { ok: false, error: validation.error }

  let nextGameState = { ...gameState }
  let nextPlayerState = { ...playerState }
  let nextBoard = { ...gameState.board_state }

  if (action.type === 'play_card') {
    const card = validation.card
    nextBoard = applySupport(nextBoard, playerId, card.effects)
    nextBoard = appendLog(nextBoard, {
      type: 'play_card',
      playerId,
      message: `${playerNickname} played ${card.name}`,
    })
    nextPlayerState = {
      ...nextPlayerState,
      hand: nextPlayerState.hand.filter((id) => id !== action.cardId),
      action_points: nextPlayerState.action_points - card.apCost,
      influence_score: totalSupport(nextBoard.playerSupport[playerId]),
    }
    nextGameState = { ...nextGameState, board_state: nextBoard }
  }

  if (action.type === 'rally') {
    nextBoard = applySupport(nextBoard, playerId, [{ bloc: action.bloc, amount: RALLY_BONUS }])
    nextBoard = appendLog(nextBoard, {
      type: 'rally',
      playerId,
      message: `${playerNickname} held a rally targeting ${action.bloc.replace(/_/g, ' ')}`,
    })
    nextPlayerState = {
      ...nextPlayerState,
      action_points: nextPlayerState.action_points - RALLY_AP_COST,
      influence_score: totalSupport(nextBoard.playerSupport[playerId]),
    }
    nextGameState = { ...nextGameState, board_state: nextBoard }
  }

  if (action.type === 'end_turn') {
    const turnOrder = nextBoard.turnOrder || []
    const nextPlayerId = getNextPlayerId(turnOrder, playerId)
    const currentIdx = turnOrder.indexOf(playerId)
    const isLastInRound = currentIdx === turnOrder.length - 1

    if (isLastInRound) {
      const nextRound = gameState.round + 1
      if (nextRound > MAX_ROUNDS) {
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
      } else {
        nextBoard = appendLog(nextBoard, {
          type: 'system',
          message: `Round ${nextRound} begins.`,
        })
        nextGameState = {
          ...nextGameState,
          board_state: nextBoard,
          round: nextRound,
          phase: 'campaign',
          current_turn_player_id: turnOrder[0],
        }
        const updatedPlayerStates = playerStates.map((ps) => {
          const newHand = [...(ps.hand || [])]
          if (newHand.length < 5) {
            const drawn = drawRandomCard(newHand)
            if (drawn) newHand.push(drawn)
          }
          return {
            ...ps,
            hand: newHand,
            action_points: AP_PER_ROUND,
            influence_score: totalSupport(nextBoard.playerSupport[ps.player_id]),
          }
        })
        return {
          ok: true,
          gameState: nextGameState,
          playerStates: updatedPlayerStates,
          endedRound: true,
        }
      }
    } else {
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

    nextPlayerState = {
      ...nextPlayerState,
      influence_score: totalSupport(nextBoard.playerSupport[playerId]),
    }
  }

  const updatedPlayerStates = playerStates.map((ps) =>
    ps.player_id === playerId ? nextPlayerState : ps
  )

  if (action.type === 'end_turn' && nextGameState.phase === 'finished') {
    const finalStates = playerStates.map((ps) => ({
      ...ps,
      action_points: 0,
      influence_score: totalSupport(nextBoard.playerSupport[ps.player_id]),
    }))
    return {
      ok: true,
      gameState: nextGameState,
      playerStates: finalStates,
      gameOver: true,
    }
  }

  if (action.type === 'end_turn' && nextGameState.round !== gameState.round) {
    return {
      ok: true,
      gameState: nextGameState,
      playerStates: updatedPlayerStates,
      endedRound: true,
    }
  }

  return {
    ok: true,
    gameState: nextGameState,
    playerStates: updatedPlayerStates,
  }
}
