import { Component, type ReactNode } from 'react'
import { Home, Dumbbell, Utensils, TrendingUp, Settings as SettingsIcon, Loader2, AlertTriangle } from 'lucide-react'
import { AppProvider, useApp } from './lib/store'
import { FeedbackProvider } from './components/feedback'
import { useRoute, type Route } from './lib/route'
import Dashboard from './pages/Dashboard'
import Workouts from './pages/Workouts'
import Food from './pages/Food'
import Hydration from './pages/Hydration'
import ProgressHub from './pages/ProgressHub'
import SettingsPage from './pages/Settings'
import { dayPlan } from './lib/day'

// 5 itens no menu; Hidratação fica dentro de "Hoje" e Histórico dentro de "Progresso"
const NAV: { route: Route; label: string; short: string; icon: ReactNode; also?: Route[] }[] = [
  { route: 'dashboard', label: 'Hoje', short: 'Hoje', icon: <Home size={20} />, also: ['hidratacao'] },
  { route: 'alimentacao', label: 'Dieta', short: 'Dieta', icon: <Utensils size={20} /> },
  { route: 'treinos', label: 'Treino', short: 'Treino', icon: <Dumbbell size={20} /> },
  { route: 'evolucao', label: 'Progresso', short: 'Progresso', icon: <TrendingUp size={20} />, also: ['historico'] },
  { route: 'config', label: 'Ajustes', short: 'Ajustes', icon: <SettingsIcon size={20} /> },
]

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="boot">
          <AlertTriangle size={32} className="warn-text" />
          <h2>Algo deu errado nesta tela</h2>
          <p className="muted">Seus dados continuam salvos no navegador. Detalhe: {this.state.error.message}</p>
          <button className="btn btn-primary" onClick={() => { this.setState({ error: null }); window.location.hash = '#/dashboard' }}>Voltar ao dashboard</button>
        </div>
      )
    }
    return this.props.children
  }
}

function Shell() {
  const route = useRoute()
  const { store, today } = useApp()
  const plan = dayPlan(store.settings, today)
  const page = {
    dashboard: <Dashboard />,
    treinos: <Workouts />,
    alimentacao: <Food />,
    hidratacao: <Hydration />,
    evolucao: <ProgressHub initial="corpo" />,
    historico: <ProgressHub initial="calendario" />,
    config: <SettingsPage />,
  }[route]
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">CT</div>
          <div>
            <strong>Cutting Tracker</strong>
            <span className="muted small">
              {plan.inProject ? `Dia ${plan.dayIndex} de ${plan.totalDays}` : plan.dayIndex < 1 ? 'Antes do início' : 'Projeto encerrado'}
            </span>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <a key={n.route} href={`#/${n.route}`} className={route === n.route || n.also?.includes(route) ? 'active' : ''} aria-current={route === n.route ? 'page' : undefined}>
              {n.icon}
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
        <p className="sidebar-foot muted small">Dados salvos apenas neste navegador.</p>
      </aside>
      <main className="main">
        <ErrorBoundary key={route}>{page}</ErrorBoundary>
      </main>
      <nav className="bottom-nav">
        {NAV.map((n) => (
          <a key={n.route} href={`#/${n.route}`} className={route === n.route || n.also?.includes(route) ? 'active' : ''} aria-label={n.label}>
            {n.icon}
            <span>{n.short}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <FeedbackProvider>
      <AppProvider
        fallback={({ error }) => (
          <div className="boot">
            {error ? (
              <>
                <AlertTriangle size={32} className="warn-text" />
                <h2>Não foi possível abrir o banco de dados local</h2>
                <p className="muted">{error}</p>
                <p className="muted small">Verifique se o navegador permite armazenamento (IndexedDB) e se não está em modo privativo restrito.</p>
              </>
            ) : (
              <>
                <Loader2 className="spin" size={28} />
                <p className="muted">Carregando seus dados…</p>
              </>
            )}
          </div>
        )}
      >
        <Shell />
      </AppProvider>
    </FeedbackProvider>
  )
}
