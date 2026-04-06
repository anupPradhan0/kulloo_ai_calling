import './App.css'
import { ApiExplorer } from './components/ApiExplorer'

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Kulloo</h1>
        <p className="subtitle">
          Public API tools you can use from an app: check status, place a hello
          call, and fetch recordings. Carrier webhooks and operator-only routes
          are not listed here.
        </p>
      </header>
      <ApiExplorer />
    </div>
  )
}
