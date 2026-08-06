import { useState } from 'react'
import { EquipmentPanel } from './components/scheme/EquipmentPanel'
import { SchemeViewer } from './components/scheme/SchemeViewer'
import './App.css'

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-title">КТК ЭЛОУ-АВТ</span>
          <span className="app-subtitle">Мнемосхема по схеме КТС</span>
        </div>
        <div className="app-meta">Ч2026 / ГПН · этап отображения</div>
      </header>
      <main className="app-main">
        <SchemeViewer selectedId={selectedId} onSelect={setSelectedId} />
        <EquipmentPanel selectedId={selectedId} />
      </main>
    </div>
  )
}
