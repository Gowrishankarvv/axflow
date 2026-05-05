import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { LoadingProvider } from './lib/LoadingContext'
import { AppDataProvider } from './lib/AppDataContext'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LoadingProvider>
        <AppDataProvider>
          <App />
        </AppDataProvider>
      </LoadingProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
