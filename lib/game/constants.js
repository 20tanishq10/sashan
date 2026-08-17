export const SETTING_NAME = 'Republic of Meridia'

export const BLOCS = {
  frontier: { label: 'Frontier Marches', color: '#6d4c41' },
  agraria: { label: 'Agraria', color: '#5f8d4e' },
  capital: { label: 'Capital Circle', color: '#8b5e34' },
  coast: { label: 'Coast of Trade', color: '#3f7d8c' },
  foundry: { label: 'Foundry Belt', color: '#9d3c2f' },
  riverland: { label: 'Riverland', color: '#3d6b9f' },
  highlands: { label: 'Highlands', color: '#7a5f9a' },
  metro: { label: 'Metro Corridor', color: '#2f8f83' },
  delta: { label: 'Delta Republic', color: '#b86a33' },
}

export const BLOC_IDS = Object.keys(BLOCS)

export const IDEOLOGIES = {
  capitalist: { label: 'Capitalist', color: '#8b5e34' },
  supremo: { label: 'Supremo', color: '#7a1f1a' },
  showstopper: { label: 'Showstopper', color: '#2f6f77' },
  idealist: { label: 'Idealist', color: '#556b2f' },
}

export const RESOURCES = {
  funds: { label: 'Campaign Funds' },
  clout: { label: 'Street Clout' },
  media: { label: 'Media Attention' },
  trust: { label: 'Public Trust' },
}

export const AP_PER_ROUND = 3
export const RALLY_AP_COST = 2
export const RALLY_BONUS = 10
export const MAX_ROUNDS = 9
export const HAND_LIMIT = 5

// Phase 3 constants
export const SCANDAL_AP_COST = 2
export const EVENT_ROUND_INTERVAL = 3          // event fires at rounds 3, 6, 9
export const SCORING_CHECKPOINT_ROUNDS = [3, 6, 9]
export const ALLIANCE_HONOR_BONUS = 12         // both honor → each gets +12 across two blocs
export const ALLIANCE_BETRAY_BONUS = 20        // betrayer gets +20 in one bloc
export const ALLIANCE_BETRAYED_PENALTY = 8     // honorer who was betrayed loses 8 support

export function emptyPlayerSupport() {
  return Object.fromEntries(BLOC_IDS.map((id) => [id, 0]))
}

export function createPlayerSupportMap(playerIds) {
  return Object.fromEntries(playerIds.map((id) => [id, emptyPlayerSupport()]))
}
