import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import '@xyflow/react/dist/style.css'
import './App.css'
import { AuthGate } from './components/AuthGate'
import { Layout } from './components/Layout'
import { CorePage } from './pages/CorePage'
import { RacksPage } from './pages/RacksPage'
import { SettingsPage } from './pages/SettingsPage'
import { TemplatesPage } from './pages/TemplatesPage'
import { TopologyPage } from './pages/TopologyPage'

function App() {
  return <AuthGate><HashRouter>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/racks" replace />} />
        <Route path="racks" element={<RacksPage />} />
        <Route path="topology" element={<TopologyPage />} />
        <Route path="topology/:id" element={<TopologyPage />} />
        <Route path="core" element={<CorePage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/racks" replace />} />
      </Route>
    </Routes>
  </HashRouter></AuthGate>
}

export default App
