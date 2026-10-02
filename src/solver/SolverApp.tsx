import { useGame } from './state/useGame'
import { Dashboard } from './ui/Dashboard'
import { SetupScreen } from './ui/SetupScreen'

export default function App() {
  const api = useGame()
  if (!api.setup || !api.state) return <SetupScreen onStart={api.startGame} />
  return <Dashboard api={api} state={api.state} />
}
