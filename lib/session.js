import { customAlphabet } from 'nanoid'

const TOKEN_KEY = 'sashan_session_token'
const PLAYER_KEY = 'sashan_player'
const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
const nano = customAlphabet(alphabet, 32)

export function getOrCreateSessionToken() {
  if (typeof window === 'undefined') return null
  let token = localStorage.getItem(TOKEN_KEY)
  if (!token) {
    token = nano()
    localStorage.setItem(TOKEN_KEY, token)
  }
  return token
}

export function getStoredPlayer() {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(PLAYER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function storePlayer(player) {
  if (typeof window === 'undefined') return
  localStorage.setItem(PLAYER_KEY, JSON.stringify(player))
}

export function clearStoredPlayer() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(PLAYER_KEY)
}
