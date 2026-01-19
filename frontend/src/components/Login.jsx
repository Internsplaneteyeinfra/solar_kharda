import React, { useState } from 'react'
import './Login.css'
import { useNavigate } from 'react-router-dom'   
import bgImage from '../assets/images/solar-bg.jpg' // Background image import

function Login({ onSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()

    if (username === 'admin' && password === 'mitcon@2025') {
      setError('')
      onSuccess()  // ✅ inform parent about successful login
      navigate('/cards')   // ✅ redirect to dashboard
    } else {
      setError('Invalid credentials')
    }
  }

  return (
    <div className="login-container"style={{ backgroundImage: `url(${bgImage})` }}>
      <div className="login-card">
        <div className="login-header">
          <h1>Solar Farm Dashboard</h1>
          <p>Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </div>

          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-button">
            Sign In
          </button>
        </form>

        <div className="login-footer">
          © {new Date().getFullYear()} solar analyzer
        </div>
      </div>
    </div>
  )
}

export default Login
