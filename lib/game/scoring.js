import { BLOC_IDS, SCORING_CHECKPOINT_ROUNDS, ALLIANCE_HONOR_BONUS, ALLIANCE_BETRAY_BONUS, ALLIANCE_BETRAYED_PENALTY } from './constants'

export function totalSupport(playerSupport) {
  if (!playerSupport) return 0
  return BLOC_IDS.reduce((sum, bloc) => sum + (playerSupport[bloc] || 0), 0)
}

export function getStandings(gameState, players) {
  const support = gameState.board_state?.playerSupport || {}
  return players
    .map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      total: totalSupport(support[p.id]),
      blocs: support[p.id] || {},
    }))
    .sort((a, b) => b.total - a.total)
}

export function getWinner(gameState, players) {
  const standings = getStandings(gameState, players)
  if (!standings.length) return null
  return standings[0]
}

export function isGameOver(gameState) {
  return gameState.round > 9 || gameState.phase === 'finished'
}

export function blocLeaders(gameState, players) {
  const support = gameState.board_state?.playerSupport || {}
  const leaders = {}

  for (const bloc of BLOC_IDS) {
    let best = null
    let bestScore = -1
    for (const p of players) {
      const score = support[p.id]?.[bloc] || 0
      if (score > bestScore) {
        bestScore = score
        best = p
      }
    }
    leaders[bloc] = best ? { playerId: best.id, nickname: best.nickname, score: bestScore } : null
  }

  return leaders
}

export function isScoringCheckpoint(round) {
  return SCORING_CHECKPOINT_ROUNDS.includes(round)
}

/**
 * Apply the alliance outcome to the board's playerSupport.
 * Returns an updated boardState.
 *
 * choices: { [playerId]: 'honor' | 'betray' }
 * alliance: { proposerId, targetId, proposerBloc, targetBloc }
 *   - proposerBloc: the bloc the proposer gains/loses support in
 *   - targetBloc: the bloc the target gains/loses support in
 */
export function applyAllianceOutcome(boardState, alliance, choices) {
  const { proposerId, targetId, proposerBloc, targetBloc } = alliance
  const proposerChoice = choices[proposerId]
  const targetChoice = choices[targetId]

  let playerSupport = { ...boardState.playerSupport }

  function addSupport(playerId, bloc, amount) {
    const updated = { ...playerSupport[playerId] }
    updated[bloc] = Math.max(0, (updated[bloc] || 0) + amount)
    playerSupport = { ...playerSupport, [playerId]: updated }
  }

  if (proposerChoice === 'honor' && targetChoice === 'honor') {
    // Both honour — mutual moderate gain
    addSupport(proposerId, proposerBloc, ALLIANCE_HONOR_BONUS)
    addSupport(targetId, targetBloc, ALLIANCE_HONOR_BONUS)
  } else if (proposerChoice === 'betray' && targetChoice === 'betray') {
    // Both betray — small mutual penalty
    addSupport(proposerId, proposerBloc, -Math.floor(ALLIANCE_BETRAYED_PENALTY / 2))
    addSupport(targetId, targetBloc, -Math.floor(ALLIANCE_BETRAYED_PENALTY / 2))
  } else if (proposerChoice === 'betray' && targetChoice === 'honor') {
    // Proposer betrays, target honoured
    addSupport(proposerId, proposerBloc, ALLIANCE_BETRAY_BONUS)
    addSupport(targetId, targetBloc, -ALLIANCE_BETRAYED_PENALTY)
  } else if (proposerChoice === 'honor' && targetChoice === 'betray') {
    // Target betrays, proposer honoured
    addSupport(targetId, targetBloc, ALLIANCE_BETRAY_BONUS)
    addSupport(proposerId, proposerBloc, -ALLIANCE_BETRAYED_PENALTY)
  }

  return { ...boardState, playerSupport }
}

/**
 * Take a snapshot of current standings for the scoring checkpoint log.
 * Returns an array sorted by total support.
 */
export function scoringCheckpointSnapshot(boardState, players) {
  const support = boardState.playerSupport || {}
  return players
    .map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      total: totalSupport(support[p.id]),
    }))
    .sort((a, b) => b.total - a.total)
}
