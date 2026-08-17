import { BLOC_IDS } from './constants'

export const POLICY_CARDS = {
  youth_outreach: {
    id: 'youth_outreach',
    name: 'Youth Outreach',
    description: 'Campus tours and social media push.',
    apCost: 1,
    effects: [{ bloc: 'youth', amount: 8 }],
  },
  farm_subsidies: {
    id: 'farm_subsidies',
    name: 'Farm Subsidies',
    description: 'Direct aid for agricultural communities.',
    apCost: 1,
    effects: [{ bloc: 'farmers', amount: 6 }],
  },
  tax_cut_business: {
    id: 'tax_cut_business',
    name: 'Business Tax Cut',
    description: 'Lower corporate rates to win industry backing.',
    apCost: 2,
    effects: [{ bloc: 'business', amount: 7 }],
  },
  union_support: {
    id: 'union_support',
    name: 'Union Solidarity',
    description: 'Back labor rights on the stump.',
    apCost: 1,
    effects: [{ bloc: 'working_class', amount: 7 }],
  },
  retiree_benefits: {
    id: 'retiree_benefits',
    name: 'Retiree Benefits',
    description: 'Expand pension protections.',
    apCost: 1,
    effects: [{ bloc: 'retirees', amount: 6 }],
  },
  tech_hub_grant: {
    id: 'tech_hub_grant',
    name: 'Tech Hub Grant',
    description: 'Fund innovation districts in major cities.',
    apCost: 2,
    effects: [{ bloc: 'urban_professionals', amount: 8 }],
  },
  rural_broadband: {
    id: 'rural_broadband',
    name: 'Rural Broadband',
    description: 'Connect farms and young remote workers.',
    apCost: 2,
    effects: [
      { bloc: 'farmers', amount: 4 },
      { bloc: 'youth', amount: 4 },
    ],
  },
  small_business_loans: {
    id: 'small_business_loans',
    name: 'Small Business Loans',
    description: 'Micro-lending for entrepreneurs.',
    apCost: 2,
    effects: [
      { bloc: 'business', amount: 5 },
      { bloc: 'urban_professionals', amount: 3 },
    ],
  },
}

export const STARTER_HAND = [
  'youth_outreach',
  'farm_subsidies',
  'tax_cut_business',
  'union_support',
  'retiree_benefits',
]

export const DRAW_POOL = Object.keys(POLICY_CARDS)

export function getCard(cardId) {
  return POLICY_CARDS[cardId] || null
}

export function drawRandomCard(exclude = []) {
  const available = DRAW_POOL.filter((id) => !exclude.includes(id))
  if (!available.length) return null
  return available[Math.floor(Math.random() * available.length)]
}

export function validateCardEffects(effects) {
  return effects.every((e) => BLOC_IDS.includes(e.bloc) && e.amount > 0)
}
