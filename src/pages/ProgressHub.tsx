import { useState } from 'react'
import { CalendarDays, TrendingUp } from 'lucide-react'
import { PageHeader, Segmented } from '../components/ui'
import Progress from './Progress'
import History from './History'

/** "Progresso": evolução do corpo + calendário/histórico em uma só seção */
export default function ProgressHub({ initial }: { initial: 'corpo' | 'calendario' }) {
  const [tab, setTab] = useState(initial)
  return (
    <div className="page">
      <PageHeader title="Progresso">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'calendario', label: <><CalendarDays size={14} /> Dias</> },
          { value: 'corpo', label: <><TrendingUp size={14} /> Corpo</> },
        ]} />
      </PageHeader>
      {tab === 'corpo' ? <Progress embedded /> : <History embedded />}
    </div>
  )
}
