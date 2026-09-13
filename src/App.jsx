import React from 'react'
import Header from './components/Header'
import Scanner from './components/Scanner'

function App() {
  return (
    <div className="app-container">
      <Header />
      
      <div className="app-content">
        <Scanner />
      </div>
    </div>
  )
}

export default App
