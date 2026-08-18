import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import * as Game from '../../lib/shasn/game'
import { hydrate, mirrorColumns, rngFor, bumpRng, viewFor } from '../../lib/shasn/persistence'

// Actions only the player whose turn it is may take.
//
// Deliberately absent: trades and auction bids (p.11 lets any player be party to
// a trade and either party may be the active one), and answer_ideology_timeout —
// ANY player may fire the shot clock, otherwise a player who closes their tab
// stalls the table forever. The engine re-checks the deadline against the
// server's clock, so this cannot be rushed.
const TURN_ACTIONS = new Set([
  'answer_ideology',
  'redraw_ideology',
  'discard_to_cap',
  'influence',
  'gerrymander',
  'place_evicted',
  'buy_conspiracy',
  'resolve_headline',
  'resolve_awaiting',
  'resolve_manually',
  'end_turn',
  'prospect',
  'breaking_ground',
  'donations',
  'payback',
  'tough_love',
])

// Actions that consume randomness and therefore need the rng counter advanced.
const RANDOM_ACTIONS = new Set([
  'answer_ideology_timeout',
  'influence',
  'redraw_ideology',
  'buy_conspiracy',
  'resolve_headline',
  'end_turn',
])

function dispatch(game, rng, action, actorId) {
  const p = action.payload || {}
  switch (action.type) {
    case 'answer_ideology':
      // Answered by index: the active player is not shown which Ideologue is
      // which (p.12), so their client cannot name one.
      return Game.answerIdeology(
        game,
        typeof p.answerIndex === 'number' ? p.answerIndex : p.ideologue
      )
    case 'answer_ideology_timeout':
      // House rule: the clock ran out, so the card answers itself at random.
      return Game.answerIdeologyByTimeout(game, rng)
    case 'redraw_ideology':
      return Game.redrawIdeology(game, rng, p.allocation)
    case 'discard_to_cap':
      return Game.discardToCap(game, p.discard)
    case 'influence':
      return Game.influence(game, rng, p)
    case 'gerrymander':
      return Game.gerrymander(game, p)
    case 'place_evicted':
      return Game.placeEvicted(game, p)
    case 'buy_conspiracy':
      return Game.buyConspiracy(game, rng, p)
    case 'play_conspiracy':
      // p.22 allows playing out of turn, in the window before an opponent
      // answers their Ideology Card, so this is not turn-gated.
      return Game.playConspiracy(game, { ...p, playerId: actorId })
    case 'respond_interrupt':
      return Game.respondInterrupt(game, { ...p, playerId: actorId })
    case 'resolve_headline':
      return Game.resolveNextHeadline(game, rng, p)
    case 'resolve_awaiting':
      return Game.resolveAwaiting(game, p)
    case 'resolve_manually':
      return Game.resolveManually(game, p)
    case 'end_turn':
      return Game.endTurn(game, rng)
    case 'prospect':
      return Game.prospect(game, p)
    case 'breaking_ground':
      return Game.breakingGround(game, p)
    case 'donations':
      return Game.donations(game, p)
    case 'payback':
      return Game.payback(game, p)
    case 'tough_love':
      return Game.toughLove(game, p)
    case 'propose_trade':
      // Either party may initiate, but you can only ever offer your own goods.
      return Game.proposeTrade(game, { ...p, proposerId: actorId })
    case 'respond_trade':
      return Game.respondTrade(game, { ...p, playerId: actorId })
    case 'bid':
      return Game.bid(game, { ...p, playerId: actorId })
    case 'close_auction':
      // Any player may close the bidding — the engine picks the winner, so this
      // cannot be abused, and it stops a seller stalling an auction forever.
      return Game.closeAuction(game, p)
    case 'repay_debt':
      return Game.repayAuctionDebt(game, { ...p, playerId: actorId })
    default:
      return { error: `Unknown action ${action.type}` }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { code, sessionToken, action } = req.body || {}
  if (!code || !sessionToken || !action?.type) {
    return res.status(400).json({ error: 'Missing code, sessionToken, or action' })
  }

  const supabase = getSupabaseAdmin()
  const lobbyCode = code.trim().toUpperCase()

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, code, status')
    .eq('code', lobbyCode)
    .single()
  if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' })

  const { data: player, error: playerError } = await supabase
    .from('lobby_players')
    .select('id, nickname')
    .eq('lobby_id', lobby.id)
    .eq('session_token', sessionToken)
    .single()
  if (playerError || !player) return res.status(403).json({ error: 'You are not in this game' })

  const { data: row, error: gameError } = await supabase
    .from('game_state')
    .select('*')
    .eq('lobby_id', lobby.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  if (gameError || !row) return res.status(404).json({ error: 'Game not found' })

  const game = hydrate(row)
  if (!game) {
    return res.status(409).json({ error: 'This game predates the current engine.', legacy: true })
  }
  if (game.phase === 'finished') return res.status(400).json({ error: 'The election is over' })

  // Server-side turn ownership. The client must never be trusted for this.
  if (TURN_ACTIONS.has(action.type)) {
    const active = game.players[game.activeSeat]
    if (!active || active.id !== player.id) {
      return res.status(403).json({ error: 'It is not your turn' })
    }
  }

  const rng = rngFor(game)
  const result = dispatch(game, rng, action, player.id)
  if (result.error) return res.status(400).json({ error: result.error })

  let next = result.game
  if (RANDOM_ACTIONS.has(action.type)) next = bumpRng(next)

  // Optimistic lock: refuse the write if anything changed under us. Two players
  // acting at once is normal in a realtime game and must not silently clobber.
  const { data: saved, error: saveError } = await supabase
    .from('game_state')
    .update(mirrorColumns(next))
    .eq('id', row.id)
    .eq('updated_at', row.updated_at)
    .select('id')

  if (saveError) return res.status(500).json({ error: `Could not save: ${saveError.message}` })
  if (!saved?.length) {
    return res.status(409).json({ error: 'The game moved on. Try that again.' })
  }

  if (next.phase === 'finished') {
    await supabase.from('lobbies').update({ status: 'finished' }).eq('id', lobby.id)
  }

  return res.status(200).json({
    ok: true,
    game: viewFor(next, player.id),
    standings: Game.getStandings(next),
    scoreBreakdown: Game.getScoreBreakdown(next),
    manual: result.manual || false,
    card: result.card || null,
    // Only present on answer_ideology — the card unmasked now the answer is in.
    reveal: result.reveal || null,
  })
}
