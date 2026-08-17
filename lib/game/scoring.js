import { BLOC_IDS } from './constants'

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
