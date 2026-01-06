import React, { useState } from 'react'
import './Login.css'

function Login({ onSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    // static validation; do not show creds in UI
    if (username === 'admin' && password === 'mitcon@2025') {
      setError('')
      onSuccess()
    } else {
      setError('Invalid credentials')
    }
  }

  return (
    <div className="login-container">
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
              autoComplete="username"
            />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-button">Sign In</button>
        </form>
        <div className="login-footer">© {new Date().getFullYear()} Solar Analytics</div>
      </div>
    </div>
  )
}

export default Login

