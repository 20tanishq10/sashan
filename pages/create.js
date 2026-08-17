import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getOrCreateSessionToken, storePlayer } from '../lib/session'

export default function Create() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const sessionToken = getOrCreateSessionToken()
    const res = await fetch('/api/create-lobby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, sessionToken }),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error || 'Create failed')
      return
    }

    storePlayer({
      playerId: json.playerId,
      lobbyId: json.lobbyId,
      code: json.code,
      nickname: json.nickname,
      sessionToken,
      isHost: true,
    })

    router.push(`/lobby/${json.code}`)
  }

  return (
    <main className="page">
      <div className="card">
        <Link href="/" className="back-link">← Back</Link>
        <h2>Create Lobby</h2>
        <p className="subtitle">You will be the host. Share the lobby code with friends once created.</p>
        <form onSubmit={handleCreate} className="form">
          <label>
            Your nickname
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Enter nickname"
              maxLength={20}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading || !nickname.trim()}>
            {loading ? 'Creating…' : 'Create Lobby'}
          </button>
        </form>
      </div>
    </main>
  )
}
