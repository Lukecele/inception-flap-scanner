import React from 'react'
import Header from './components/Header'
import Scanner from './components/Scanner'

function App() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      
      <div style={{ flex: 1, minHeight: 0, marginTop: '1rem' }}>
        <Scanner />
      </div>
    </div>
  )
}

export default App
