import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import '@xyflow/react/dist/style.css'
import './App.css'
import { AuthGate } from './components/AuthGate'
import { Layout } from './components/Layout'
import { CorePage } from './pages/CorePage'
import { RacksPage } from './pages/RacksPage'
import { SettingsPage } from './pages/SettingsPage'
import { TemplatesPage } from './pages/TemplatesPage'
import { DataQualityPage } from './pages/DataQualityPage'
import { TopologyPage } from './pages/TopologyPage'

const SshTerminalPage = lazy(() => import('./pages/SshTerminalPage').then((module) => ({ default: module.SshTerminalPage })))

function RacksRoute() {
  const { search } = useLocation()
  return <RacksPage key={search} />
}

function App() {
  return <AuthGate><HashRouter>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/racks" replace />} />
        <Route path="racks" element={<RacksRoute />} />
        <Route path="topology" element={<TopologyPage />} />
        <Route path="topology/:id" element={<TopologyPage />} />
        <Route path="core" element={<CorePage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="quality" element={<DataQualityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="terminal" element={<Suspense fallback={<div className="login-loading" role="status">Загрузка терминала…</div>}><SshTerminalPage /></Suspense>} />
        <Route path="terminal/:deviceId" element={<Suspense fallback={<div className="login-loading" role="status">Загрузка терминала…</div>}><SshTerminalPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/racks" replace />} />
      </Route>
    </Routes>
  </HashRouter></AuthGate>
}

export default App
