import { BLOC_IDS, BLOCS, IDEOLOGIES, RESOURCES } from './constants'

// ---------------------------------------------------------------------------
// Policy cards — build your own support in voter blocs
// ---------------------------------------------------------------------------
export const POLICY_CARDS = {
  border_rail_pledge: {
    id: 'border_rail_pledge',
    name: 'Border Rail Pledge',
    description: 'Promise security roads and freight corridors along the marches.',
    apCost: 1,
    ideology: 'supremo',
    resource: 'clout',
    effects: [{ bloc: 'frontier', amount: 8 }],
  },
  crop_insurance_bill: {
    id: 'crop_insurance_bill',
    name: 'Crop Insurance Bill',
    description: 'A relief package for harvest shocks and debt-ridden villages.',
    apCost: 1,
    ideology: 'idealist',
    resource: 'trust',
    effects: [{ bloc: 'agraria', amount: 8 }],
  },
  chamber_of_commerce_tour: {
    id: 'chamber_of_commerce_tour',
    name: 'Chamber Tour',
    description: 'Court donors, exporters, and guild leaders in the capital.',
    apCost: 2,
    ideology: 'capitalist',
    resource: 'funds',
    effects: [{ bloc: 'capital', amount: 9 }],
  },
  port_modernization_scheme: {
    id: 'port_modernization_scheme',
    name: 'Port Modernization Scheme',
    description: 'Sell a future of container terminals, customs speed, and trade.',
    apCost: 2,
    ideology: 'capitalist',
    resource: 'media',
    effects: [{ bloc: 'coast', amount: 8 }],
  },
  labor_charter_march: {
    id: 'labor_charter_march',
    name: 'Labor Charter March',
    description: 'Stand with factory unions and frame the race as dignity versus greed.',
    apCost: 1,
    ideology: 'idealist',
    resource: 'clout',
    effects: [{ bloc: 'foundry', amount: 8 }],
  },
  river_dam_compromise: {
    id: 'river_dam_compromise',
    name: 'River Dam Compromise',
    description: 'Broker a televised settlement between engineers, villages, and traders.',
    apCost: 2,
    ideology: 'showstopper',
    resource: 'media',
    effects: [{ bloc: 'riverland', amount: 8 }],
  },
  hill_state_autonomy: {
    id: 'hill_state_autonomy',
    name: 'Hill Autonomy Pact',
    description: 'Promise dignity, local control, and protection for mountain communities.',
    apCost: 1,
    ideology: 'supremo',
    resource: 'trust',
    effects: [{ bloc: 'highlands', amount: 7 }],
  },
  startup_futures_summit: {
    id: 'startup_futures_summit',
    name: 'Startup Futures Summit',
    description: 'Flood the metro with founders, cameras, and a language of ambition.',
    apCost: 2,
    ideology: 'showstopper',
    resource: 'media',
    effects: [{ bloc: 'metro', amount: 9 }],
  },
  delta_relief_fleet: {
    id: 'delta_relief_fleet',
    name: 'Delta Relief Fleet',
    description: 'Launch boats, clinics, and volunteers before your rivals arrive.',
    apCost: 1,
    ideology: 'idealist',
    resource: 'trust',
    effects: [{ bloc: 'delta', amount: 8 }],
  },
  federal_unity_rally: {
    id: 'federal_unity_rally',
    name: 'Federal Unity Rally',
    description: 'Wave the flag of order while speaking to both the provinces and the capital.',
    apCost: 2,
    ideology: 'supremo',
    resource: 'clout',
    effects: [
      { bloc: 'frontier', amount: 4 },
      { bloc: 'capital', amount: 4 },
    ],
  },
  logistics_corridor_push: {
    id: 'logistics_corridor_push',
    name: 'Logistics Corridor Push',
    description: 'Tie factories, ports, and warehouses into one growth story.',
    apCost: 2,
    ideology: 'capitalist',
    resource: 'funds',
    effects: [
      { bloc: 'foundry', amount: 4 },
      { bloc: 'coast', amount: 4 },
    ],
  },
  public_broadcast_forum: {
    id: 'public_broadcast_forum',
    name: 'Public Broadcast Forum',
    description: 'Win the nightly debate and pull river towns and metro viewers into your frame.',
    apCost: 2,
    ideology: 'showstopper',
    resource: 'media',
    effects: [
      { bloc: 'riverland', amount: 4 },
      { bloc: 'metro', amount: 4 },
    ],
  },
  rural_health_mission: {
    id: 'rural_health_mission',
    name: 'Rural Health Mission',
    description: 'Send clinics from the plains into the hills and ask for trust in return.',
    apCost: 2,
    ideology: 'idealist',
    resource: 'trust',
    effects: [
      { bloc: 'agraria', amount: 4 },
      { bloc: 'highlands', amount: 4 },
    ],
  },
}

export const STARTER_HAND = [
  'crop_insurance_bill',
  'chamber_of_commerce_tour',
  'labor_charter_march',
  'startup_futures_summit',
  'delta_relief_fleet',
]

export const POLICY_DRAW_POOL = Object.keys(POLICY_CARDS)

// ---------------------------------------------------------------------------
// Scandal / Attack cards — reduce a target opponent's support in voter blocs
// Each card has `targets: 'opponent'` and negative amounts in effects.
// ---------------------------------------------------------------------------
export const SCANDAL_CARDS = {
  leaked_dossier: {
    id: 'leaked_dossier',
    name: 'Leaked Dossier',
    description: 'Strategically release embarrassing documents that hollow out a rival\'s capital base.',
    apCost: 2,
    cardType: 'scandal',
    ideology: 'showstopper',
    resource: 'media',
    targets: 'opponent',
    effects: [{ bloc: 'capital', amount: -9 }],
  },
  smear_campaign: {
    id: 'smear_campaign',
    name: 'Smear Campaign',
    description: 'Flood the airwaves with damaging half-truths aimed at your rival\'s metro support.',
    apCost: 2,
    cardType: 'scandal',
    ideology: 'showstopper',
    resource: 'media',
    targets: 'opponent',
    effects: [{ bloc: 'metro', amount: -9 }],
  },
  border_incident_report: {
    id: 'border_incident_report',
    name: 'Border Incident Report',
    description: 'Implicate a rival in mishandling frontier security. Veterans turn away in disgust.',
    apCost: 2,
    cardType: 'scandal',
    ideology: 'supremo',
    resource: 'clout',
    targets: 'opponent',
    effects: [{ bloc: 'frontier', amount: -8 }],
  },
  agrarian_exploitation_expose: {
    id: 'agrarian_exploitation_expose',
    name: 'Agrarian Expose',
    description: 'Circulate footage of a rival ignoring drought relief appeals from farming communities.',
    apCost: 2,
    cardType: 'scandal',
    ideology: 'idealist',
    resource: 'trust',
    targets: 'opponent',
    effects: [{ bloc: 'agraria', amount: -8 }],
  },
  factory_bribery_allegation: {
    id: 'factory_bribery_allegation',
    name: 'Factory Bribery Allegation',
    description: 'Leak evidence that a rival accepted union-busting funds from industry bosses.',
    apCost: 2,
    cardType: 'scandal',
    ideology: 'idealist',
    resource: 'clout',
    targets: 'opponent',
    effects: [{ bloc: 'foundry', amount: -8 }],
  },
  coastal_corruption_files: {
    id: 'coastal_corruption_files',
    name: 'Coastal Corruption Files',
    description: 'Publish port audit documents tying a rival to customs kickbacks.',
    apCost: 2,
    cardType: 'scandal',
    ideology: 'capitalist',
    resource: 'funds',
    targets: 'opponent',
    effects: [{ bloc: 'coast', amount: -8 }],
  },
  highland_betrayal_broadcast: {
    id: 'highland_betrayal_broadcast',
    name: 'Highland Betrayal Broadcast',
    description: 'Air evidence that a rival privately opposed hill-state autonomy while campaigning for it.',
    apCost: 2,
    cardType: 'scandal',
    ideology: 'supremo',
    resource: 'trust',
    targets: 'opponent',
    effects: [{ bloc: 'highlands', amount: -7 }],
  },
  delta_negligence_report: {
    id: 'delta_negligence_report',
    name: 'Delta Negligence Report',
    description: 'Expose how a rival stalled flood-relief legislation for three seasons.',
    apCost: 2,
    cardType: 'scandal',
    ideology: 'idealist',
    resource: 'trust',
    targets: 'opponent',
    effects: [{ bloc: 'delta', amount: -8 }],
  },
  riverland_patronage_scandal: {
    id: 'riverland_patronage_scandal',
    name: 'Riverland Patronage Scandal',
    description: 'Circulate receipts showing a rival diverted canal-repair funds to personal allies.',
    apCost: 2,
    cardType: 'scandal',
    ideology: 'showstopper',
    resource: 'media',
    targets: 'opponent',
    effects: [{ bloc: 'riverland', amount: -8 }],
  },
  national_credibility_collapse: {
    id: 'national_credibility_collapse',
    name: 'Credibility Collapse',
    description: 'A coordinated press offensive chips away at a rival\'s standing everywhere.',
    apCost: 2,
    cardType: 'scandal',
    ideology: 'showstopper',
    resource: 'media',
    targets: 'opponent',
    effects: [
      { bloc: 'capital', amount: -4 },
      { bloc: 'metro', amount: -4 },
    ],
  },
}

export const SCANDAL_DRAW_POOL = Object.keys(SCANDAL_CARDS)

// Keep a unified draw pool for policy hand refills (policy cards only)
export const DRAW_POOL = POLICY_DRAW_POOL

// ---------------------------------------------------------------------------
// Event cards — global effects drawn automatically every 3 rounds
// ---------------------------------------------------------------------------
export const EVENT_CARDS = {
  harvest_crisis: {
    id: 'harvest_crisis',
    name: 'Harvest Crisis',
    description: 'A devastating drought across the northern plains shifts voter anxiety toward rural relief.',
    effects: [
      { bloc: 'agraria', deltaAll: -5 },
      { bloc: 'highlands', deltaAll: -4 },
    ],
  },
  port_strike: {
    id: 'port_strike',
    name: 'Port Strike',
    description: 'Dockworkers shut down the coast. Coastal and foundry blocs demand immediate answers.',
    effects: [
      { bloc: 'coast', deltaAll: -6 },
      { bloc: 'foundry', deltaAll: 4 },
    ],
  },
  unity_summit: {
    id: 'unity_summit',
    name: 'Unity Summit',
    description: 'A rare moment of national goodwill boosts support across the frontier and capital.',
    effects: [
      { bloc: 'frontier', deltaAll: 5 },
      { bloc: 'capital', deltaAll: 5 },
    ],
  },
  media_blackout: {
    id: 'media_blackout',
    name: 'Media Blackout',
    description: 'A broadcast outage disrupts the metro news cycle, levelling the information war.',
    effects: [
      { bloc: 'metro', deltaAll: -6 },
      { bloc: 'riverland', deltaAll: 3 },
    ],
  },
  flooding_in_the_delta: {
    id: 'flooding_in_the_delta',
    name: 'Flooding in the Delta',
    description: 'Catastrophic floods put relief politics front and centre. Every campaign must respond.',
    effects: [
      { bloc: 'delta', deltaAll: -8 },
      { bloc: 'coast', deltaAll: -4 },
    ],
  },
  national_holiday_parade: {
    id: 'national_holiday_parade',
    name: 'National Holiday Parade',
    description: 'A televised national celebration gives a brief lift to all urban and capital sentiment.',
    effects: [
      { bloc: 'metro', deltaAll: 6 },
      { bloc: 'capital', deltaAll: 4 },
      { bloc: 'riverland', deltaAll: 3 },
    ],
  },
  highland_autonomy_protest: {
    id: 'highland_autonomy_protest',
    name: 'Highland Autonomy Protest',
    description: 'Tens of thousands march in the highlands, polarising national opinion.',
    effects: [
      { bloc: 'highlands', deltaAll: 7 },
      { bloc: 'frontier', deltaAll: -5 },
    ],
  },
  economic_boom_report: {
    id: 'economic_boom_report',
    name: 'Economic Boom Report',
    description: 'Unexpected GDP growth shifts the narrative toward industry and commerce.',
    effects: [
      { bloc: 'foundry', deltaAll: 6 },
      { bloc: 'coast', deltaAll: 6 },
      { bloc: 'capital', deltaAll: 4 },
    ],
  },
}

export const EVENT_POOL = Object.keys(EVENT_CARDS)

export function drawEventCard(usedEventIds = []) {
  const available = EVENT_POOL.filter((id) => !usedEventIds.includes(id))
  if (!available.length) return null
  return available[Math.floor(Math.random() * available.length)]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getCard(cardId) {
  const card = POLICY_CARDS[cardId] || SCANDAL_CARDS[cardId]
  if (!card) return null
  return {
    ...card,
    cardType: card.cardType || 'policy',
    ideologyMeta: IDEOLOGIES[card.ideology],
    resourceMeta: RESOURCES[card.resource],
  }
}

export function getEventCard(eventId) {
  return EVENT_CARDS[eventId] || null
}

export function drawRandomCard(exclude = []) {
  const available = POLICY_DRAW_POOL.filter((id) => !exclude.includes(id))
  if (!available.length) return null
  return available[Math.floor(Math.random() * available.length)]
}

export function drawRandomScandalCard(exclude = []) {
  const available = SCANDAL_DRAW_POOL.filter((id) => !exclude.includes(id))
  if (!available.length) return null
  return available[Math.floor(Math.random() * available.length)]
}

export function validateCardEffects(effects) {
  return effects.every((e) => BLOC_IDS.includes(e.bloc) && typeof e.amount === 'number' && BLOCS[e.bloc])
}
