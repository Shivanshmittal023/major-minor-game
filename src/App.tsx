import { useEffect, useState } from 'react'
import { client, hasSession, useClient } from './net/client'
import { GameScreen } from './screens/Game'
import { Home } from './screens/Home'
import { JoinRoom, RoomMessage } from './screens/Join'
import { Lobby } from './screens/Lobby'
import { setTeamNames } from './ui/kit'
import { Toasts } from './ui/Toasts'

function codeFromPath(): string | null {
  const m = /^\/r\/([A-Za-z0-9]{4,8})\/?$/.exec(location.pathname)
  return m ? m[1].toUpperCase() : null
}

export function navigate(path: string) {
  history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export default function App() {
  const st = useClient()
  const [code, setCode] = useState(codeFromPath)

  useEffect(() => {
    client.connect()
    const on = () => setCode(codeFromPath())
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])

  useEffect(() => {
    if (code) client.enterRoom(code)
  }, [code])

  // After creating a room the server tells us its code — move to the room URL (the shareable link).
  const snapCode = st.snapshot?.code
  useEffect(() => {
    if (snapCode && snapCode !== code) navigate(`/r/${snapCode}`)
  }, [snapCode, code])

  setTeamNames(st.snapshot?.teamNames)
  let screen: React.ReactNode
  if (!code) screen = <Home />
  else if (st.fatal) screen = <RoomMessage title="Can't open this table" message={st.fatal} />
  else if (!st.snapshot || st.snapshot.code !== code)
    screen = hasSession(code) ? <RoomMessage title="Rejoining your seat…" message="Reconnecting to the table." busy /> : <JoinRoom code={code} />
  else if (st.snapshot.phase === 'lobby') screen = <Lobby snap={st.snapshot} />
  else screen = <GameScreen snap={st.snapshot} />

  return (
    <>
      {st.status !== 'open' && (
        <div className="fixed inset-x-0 top-0 z-[60] flex h-7 items-center justify-center gap-2 bg-champagne/90 text-xs font-medium text-ink-900">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-900 border-t-transparent" />
          {st.status === 'connecting' ? 'Connecting…' : 'Connection lost — reconnecting. Your seat is safe.'}
        </div>
      )}
      {screen}
      <Toasts toasts={st.toasts} />
    </>
  )
}
