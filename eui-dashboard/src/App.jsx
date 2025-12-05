import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { EuiProvider } from '@elastic/eui'
import DashboardContainer from './components/dashboard/DashboardContainer'

function App() {
  return (
    <EuiProvider colorMode="light">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard/*" element={<DashboardContainer />} />
        </Routes>
      </BrowserRouter>
    </EuiProvider>
  )
}

export default App
