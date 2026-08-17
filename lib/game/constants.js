export const SETTING_NAME = 'Republic of Meridia'

export const BLOCS = {
  youth: { label: 'Youth', color: '#6366f1' },
  farmers: { label: 'Farmers', color: '#16a34a' },
  business: { label: 'Business', color: '#ca8a04' },
  working_class: { label: 'Working Class', color: '#dc2626' },
  retirees: { label: 'Retirees', color: '#9333ea' },
  urban_professionals: { label: 'Urban Pros', color: '#0891b2' },
}

export const BLOC_IDS = Object.keys(BLOCS)

export const AP_PER_ROUND = 3
export const RALLY_AP_COST = 2
export const RALLY_BONUS = 10
export const MAX_ROUNDS = 9
export const HAND_LIMIT = 5

export function emptyPlayerSupport() {
  return Object.fromEntries(BLOC_IDS.map((id) => [id, 0]))
}

export function createPlayerSupportMap(playerIds) {
  return Object.fromEntries(playerIds.map((id) => [id, emptyPlayerSupport()]))
}
