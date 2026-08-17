import { BLOC_IDS, BLOCS, IDEOLOGIES, RESOURCES } from './constants'

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

export const DRAW_POOL = Object.keys(POLICY_CARDS)

export function getCard(cardId) {
  const card = POLICY_CARDS[cardId]
  if (!card) return null
  return {
    ...card,
    ideologyMeta: IDEOLOGIES[card.ideology],
    resourceMeta: RESOURCES[card.resource],
  }
}

export function drawRandomCard(exclude = []) {
  const available = DRAW_POOL.filter((id) => !exclude.includes(id))
  if (!available.length) return null
  return available[Math.floor(Math.random() * available.length)]
}

export function validateCardEffects(effects) {
  return effects.every((e) => BLOC_IDS.includes(e.bloc) && e.amount > 0 && BLOCS[e.bloc])
}
