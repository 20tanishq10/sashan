import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getOrCreateSessionToken, storePlayer } from '../lib/session'

export default function Join() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleJoin(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const sessionToken = getOrCreateSessionToken()
    const res = await fetch('/api/join-lobby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim().toUpperCase(), nickname, sessionToken }),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error || 'Join failed')
      return
    }

    storePlayer({
      playerId: json.playerId,
      lobbyId: json.lobbyId,
      code: json.code,
      nickname: json.nickname,
      sessionToken,
      isHost: json.isHost,
    })

    router.push(`/lobby/${json.code}`)
  }

  return (
    <main className="page dossier-page">
      <div className="card dossier-card">
        <Link href="/" className="back-link">← Back</Link>
        <div className="section-heading">
          <span className="hud-label">Election access</span>
          <h2>Join an existing table</h2>
        </div>
        <p className="subtitle">Enter the six-character code and register the name you want on the ballot.</p>
        <form onSubmit={handleJoin} className="form">
          <label>
            Election code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              required
            />
          </label>
          <label>
            Candidate name
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Enter candidate name"
              maxLength={20}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading || !code.trim() || !nickname.trim()}>
            {loading ? 'Joining…' : 'Join Lobby'}
          </button>
        </form>
      </div>
    </main>
  )
}
