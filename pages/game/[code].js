import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getStoredPlayer } from '../../lib/session'

export default function GameRoom() {
  const router = useRouter()
  const { code } = router.query
  const [player, setPlayer] = useState(null)

  useEffect(() => {
    const stored = getStoredPlayer()
    if (stored?.code === code) {
      setPlayer(stored)
    }
  }, [code])

  return (
    <main className="page">
      <div className="card">
        <h2>Game Started</h2>
        <p className="subtitle">
          Lobby <strong>{code}</strong> is in progress. Phase 2 will add the voter bloc board and card play here.
        </p>
        {player && (
          <p>Playing as <strong>{player.nickname}</strong>{player.isHost ? ' (Host)' : ''}.</p>
        )}
        <div className="actions">
          <Link href={`/lobby/${code}`} className="btn btn-secondary">Back to lobby</Link>
          <Link href="/" className="btn btn-secondary">Home</Link>
        </div>
      </div>
    </main>
  )
}
