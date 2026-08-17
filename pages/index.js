import Link from 'next/link'
import Rulebook from '../components/Rulebook'

export default function Home() {
  return (
    <main className="page page--top">
      <div className="landing">

        {/* ── Hero ── */}
        <section className="hero">
          <p className="hero-eyebrow">Political strategy · 2–6 players · Private lobbies</p>
          <h1>Sas<span>han</span></h1>
          <p className="hero-sub">
            Build a national coalition, outmanoeuvre rival campaigns, and decide
            the fate of the Republic of Meridia — one voter bloc at a time.
          </p>
          <div className="hero-actions">
            <Link href="/create" className="btn btn--primary">Launch campaign</Link>
            <Link href="/join" className="btn btn--ghost">Enter election code</Link>
          </div>
        </section>

        {/* ── Feature row ── */}
        <div className="feature-grid">
          <article className="feature-card">
            <span className="label">The map</span>
            <h3>Nine contested zones</h3>
            <p>Fight bloc by bloc across Meridia. A national story beats a local stronghold every time.</p>
          </article>
          <article className="feature-card">
            <span className="label">The arsenal</span>
            <h3>Policy, Attack & Event cards</h3>
            <p>Build support with Policy cards, kneecap rivals with Attack files, and survive the national events nobody controls.</p>
          </article>
          <article className="feature-card">
            <span className="label">The gamble</span>
            <h3>Alliances & betrayal</h3>
            <p>Propose a secret pact. At every checkpoint, honour it for mutual gain — or betray for a bigger cut.</p>
          </article>
        </div>

        {/* ── Rulebook ── */}
        <Rulebook />

      </div>
    </main>
  )
}
