import '../styles/globals.css'
import ArtDefs from '../components/art/ArtDefs'

export default function App({ Component, pageProps }) {
  return (
    <>
      {/* Every pattern, gradient and filter in the game, mounted once so any
          component can reference them by id. There are no image files here —
          all of it is drawn. See components/art/ArtDefs.js. */}
      <ArtDefs />
      <Component {...pageProps} />
    </>
  )
}
