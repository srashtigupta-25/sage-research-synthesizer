import { useState, useEffect, useRef } from 'react'
import { signIn, signUp, confirmSignUp, resendCode, signOut, isAuthenticated, getEmail } from './auth'
import { submitReport, getReport, deleteReport, listReports } from './api'
import './App.css'

// ── Pipeline stages shown during generation ──────────────────────────────────
const STAGES = [
  { id: 'decompose', label: 'Decomposing topic', detail: 'Breaking into 3 research vectors', icon: '◈' },
  { id: 'research',  label: 'Researching in parallel', detail: 'Running 3 concurrent AI analysis threads', icon: '◎' },
  { id: 'synthesize',label: 'Synthesizing report', detail: 'Generating structured intelligence brief', icon: '◇' },
  { id: 'complete',  label: 'Report ready', detail: 'Persisted to DynamoDB', icon: '◆' }
]

// ── Tech stack used ───────────────────────────────────────────────────────────
const STACK = [
  { name: 'AWS Lambda', desc: '7 serverless functions', color: '#FF9900' },
  { name: 'Step Functions', desc: '5-state pipeline', color: '#FF4F8B' },
  { name: 'Amazon Bedrock', desc: 'Claude Haiku 4.5', color: '#4f9eff' },
  { name: 'API Gateway', desc: 'REST API + Auth', color: '#34d399' },
  { name: 'DynamoDB', desc: 'NoSQL report store', color: '#d4a853' },
  { name: 'Cognito', desc: 'JWT authentication', color: '#a78bfa' }
]

export default function App() {
  const [screen, setScreen] = useState('landing') // landing | login | signup | verify | research | report | history
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirm, setSignupConfirm] = useState('')
  const [verifyEmail, setVerifyEmail] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [topic, setTopic] = useState('')
  const [topicError, setTopicError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [stageIndex, setStageIndex] = useState(0)
  const [report, setReport] = useState(null)
  const [userEmail, setUserEmail] = useState('')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Load history from DynamoDB when user is on history screen
  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const data = await listReports()
      const dbReports = (data.reports || []).map(r => ({
        reportId: r.reportId,
        topic: r.topic,
        generatedAt: r.generatedAt || new Date().toISOString(),
        generationTime: r.generationTime || null
      }))
      setHistory(dbReports)
      localStorage.setItem('sage_history', JSON.stringify(dbReports))
    } catch (err) {
      // Fallback to localStorage
      try {
        const local = JSON.parse(localStorage.getItem('sage_history') || '[]')
        setHistory(local)
      } catch { setHistory([]) }
    } finally {
      setHistoryLoading(false)
    }
  }
  const [fatalError, setFatalError] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => {
    if (isAuthenticated()) {
      setUserEmail(getEmail())
      setScreen('research')
    }
  }, [])

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    try {
      await signIn(email, password)
      setUserEmail(email)
      setScreen('research')
    } catch (err) {
      setAuthError(err.message || 'Login failed. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    if (signupPassword !== signupConfirm) {
      setAuthError('Passwords do not match.')
      setAuthLoading(false)
      return
    }
    if (signupPassword.length < 8) {
      setAuthError('Password must be at least 8 characters.')
      setAuthLoading(false)
      return
    }
    try {
      const result = await signUp(signupEmail, signupPassword)
      setVerifyEmail(signupEmail)
      if (result.codeResent) {
        setAuthSuccess('A new verification code has been sent to your email.')
      } else {
        setAuthSuccess('Account created! Check your email for the verification code.')
      }
      setScreen('verify')
    } catch (err) {
      setAuthError(err.message || 'Signup failed. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    try {
      await confirmSignUp(verifyEmail, verifyCode)
      setAuthSuccess('Email verified! Please sign in.')
      setScreen('login')
      setEmail(verifyEmail)
    } catch (err) {
      setAuthError(err.message || 'Verification failed. Check your code.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleResendCode = async () => {
    try {
      await resendCode(verifyEmail)
      setAuthSuccess('New code sent to your email!')
    } catch (err) {
      setAuthError(err.message)
    }
  }







  const handleSignOut = () => {
    signOut()
    setReport(null)
    setTopic('')
    setScreen('landing')
  }

  // ── Report Generation ─────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!topic.trim()) return
    setTopicError('')
    setGenerating(true)
    setStageIndex(0)

    try {
      const startTime = Date.now()
      const { reportId, error, message } = await submitReport(topic)

      if (error) {
        setTopicError(message || error)
        setGenerating(false)
        return
      }

      // Animate pipeline stages
      let stage = 0
      const stageTimer = setInterval(() => {
        stage++
        if (stage < STAGES.length - 1) setStageIndex(stage)
        else clearInterval(stageTimer)
      }, 9000)

      // Poll for completion
      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        try {
          const data = await getReport(reportId)
          if (data.status === 'COMPLETE') {
            clearInterval(pollRef.current)
            clearInterval(stageTimer)
            setStageIndex(3)

            // Save to history
            try {
              const newEntry = {
                reportId: data.reportId,
                topic: data.topic,
                generatedAt: new Date().toISOString(),
                generationTime: Math.round((Date.now() - startTime) / 1000)
              }
              const existing = JSON.parse(localStorage.getItem('sage_history') || '[]')
              const updated = [newEntry, ...existing].slice(0, 20)
              localStorage.setItem('sage_history', JSON.stringify(updated))
              setHistory(updated)
              console.log('History saved:', updated.length, 'reports')
            } catch(e) {
              console.error('History save error:', e)
            }

            setTimeout(() => {
              setReport({...data, generationTime: Math.round((Date.now() - startTime) / 1000)})
              setGenerating(false)
              setScreen('report')
            }, 1000)
          }
        } catch (e) { /* keep polling */ }
        if (attempts > 30) {
          clearInterval(pollRef.current)
          setTopicError('Report generation timed out. Please try again.')
          setGenerating(false)
        }
      }, 3000)

    } catch (err) {
      const status = err.response?.status
      if (status === 401) {
        setFatalError({ title: 'Session expired', message: 'Your session has expired. Please sign in again.', action: 'signin' })
        setGenerating(false)
        return
      }
      if (status === 500) {
        setFatalError({ title: 'Pipeline error', message: 'The research pipeline encountered an error. This sometimes happens with complex topics. Please try again.', action: 'retry' })
        setGenerating(false)
        return
      }
      const msg = err.response?.data?.message || err.response?.data?.error || 'Something went wrong. Please try again.'
      setTopicError(msg)
      setGenerating(false)
    }
  }

  // ── Report text renderer ──────────────────────────────────────────────────
  const renderReport = (text) => {
    if (!text) return null
    const blocks = text.split('\n\n').map(b => b.trim()).filter(Boolean)
    const sections = []
    let currentHeader = null
    let currentBody = []

    blocks.forEach((block, i) => {
      const isHeader = block === block.toUpperCase() && block.length < 80 && /[A-Z]{3}/.test(block)
      if (isHeader) {
        if (currentHeader !== null) {
          sections.push({ header: currentHeader, body: currentBody.join(' ') })
        }
        currentHeader = block
        currentBody = []
      } else {
        currentBody.push(block)
      }
    })
    if (currentHeader !== null) {
      sections.push({ header: currentHeader, body: currentBody.join(' ') })
    }

    const wordCount = text.split(/\s+/).length

    return (
      <>
        {sections.map((s, i) => (
          <div key={i} className="report-section">
            <div className="report-section-title">{s.header}</div>
            <div className="report-section-text">{s.body}</div>
          </div>
        ))}
        <div className="report-word-count">~{wordCount} words · Generated by Sage</div>
      </>
    )
  }

  // ── Screens ───────────────────────────────────────────────────────────────
  if (screen === 'landing') return <Landing onGetStarted={() => setScreen('login')} />

  if (screen === 'signup') return (
    <SignupScreen
      email={signupEmail} setEmail={setSignupEmail}
      password={signupPassword} setPassword={setSignupPassword}
      confirm={signupConfirm} setConfirm={setSignupConfirm}
      error={authError} success={authSuccess}
      loading={authLoading}
      onSubmit={handleSignup}
      onLogin={() => { setAuthError(''); setAuthSuccess(''); setScreen('login') }}
      onBack={() => setScreen('landing')}
    />
  )

  if (screen === 'verify') return (
    <VerifyScreen
      email={verifyEmail}
      code={verifyCode} setCode={setVerifyCode}
      error={authError} success={authSuccess}
      loading={authLoading}
      onSubmit={handleVerify}
      onResend={handleResendCode}
      onBack={() => setScreen('login')}
    />
  )

  if (screen === 'signup') return (
    <SignupScreen
      email={signupEmail} setEmail={setSignupEmail}
      password={signupPassword} setPassword={setSignupPassword}
      confirm={signupConfirm} setConfirm={setSignupConfirm}
      error={authError} success={authSuccess}
      loading={authLoading}
      onSubmit={handleSignup}
      onLogin={() => { setAuthError(''); setAuthSuccess(''); setScreen('login') }}
      onBack={() => setScreen('landing')}
    />
  )

  if (screen === 'verify') return (
    <VerifyScreen
      email={verifyEmail}
      code={verifyCode} setCode={setVerifyCode}
      error={authError} success={authSuccess}
      loading={authLoading}
      onSubmit={handleVerify}
      onResend={handleResendCode}
      onBack={() => setScreen('login')}
    />
  )

  if (screen === 'signup') return (
    <SignupScreen
      email={signupEmail} setEmail={setSignupEmail}
      password={signupPassword} setPassword={setSignupPassword}
      confirm={signupConfirm} setConfirm={setSignupConfirm}
      error={authError} success={authSuccess}
      loading={authLoading}
      onSubmit={handleSignup}
      onLogin={() => { setAuthError(''); setAuthSuccess(''); setScreen('login') }}
      onBack={() => setScreen('landing')}
    />
  )

  if (screen === 'verify') return (
    <VerifyScreen
      email={verifyEmail}
      code={verifyCode} setCode={setVerifyCode}
      error={authError} success={authSuccess}
      loading={authLoading}
      onSubmit={handleVerify}
      onResend={handleResendCode}
      onBack={() => setScreen('login')}
    />
  )

  if (screen === 'login') return (
    <LoginScreen
      email={email} setEmail={setEmail}
      password={password} setPassword={setPassword}
      error={authError} loading={authLoading}
      onSubmit={handleLogin}
      onBack={() => setScreen('landing')}
      onSignup={() => { setAuthError(''); setAuthSuccess(''); setScreen('signup') }}
    />
  )

  if (fatalError) return (
    <FatalErrorScreen
      error={fatalError}
      onRetry={() => { setFatalError(null); setTopic('') }}
      onSignIn={() => { setFatalError(null); handleSignOut(); setScreen('login') }}
    />
  )

  if (screen === 'history') return (
    <HistoryScreen
      history={history}
      historyLoading={historyLoading}
      onLoad={loadHistory}
      onBack={() => setScreen('research')}
      onSignOut={handleSignOut}
      onDelete={(reportId) => {
        const updated = history.filter(h => h.reportId !== reportId)
        setHistory(updated)
        localStorage.setItem('sage_history', JSON.stringify(updated))
      }}
      onViewReport={async (reportId) => {
        try {
          const { getReport } = await import('./api')
          const data = await getReport(reportId)
          setReport(data)
          setScreen('report')
        } catch(e) {
          alert('Could not load report. It may have expired.')
        }
      }}
    />
  )

  if (screen === 'research') return (
    <ResearchScreen
      topic={topic} setTopic={setTopic}
      error={topicError} setError={setTopicError}
      generating={generating}
      stageIndex={stageIndex}
      userEmail={userEmail}
      onGenerate={handleGenerate}
      onSignOut={handleSignOut}
      onHistory={() => setScreen('history')}
    />
  )

  if (screen === 'report') return (
    <ReportScreen
      report={report}
      renderReport={renderReport}
      onResearch={() => { setReport(null); setTopic(''); setScreen('research') }}
      onSignOut={handleSignOut}
      onHistory={() => setScreen('history')}
    />
  )
}

// ── Landing Screen ────────────────────────────────────────────────────────────
function Landing({ onGetStarted }) {
  const [topicIdx, setTopicIdx] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [typing, setTyping] = useState(true)
  const [pipelineStep, setPipelineStep] = useState(0)

  const topics = [
    'How Netflix recommends what you watch',
    'Nvidia investment thesis 2025',
    'How CRISPR gene editing works',
    'What caused the 2008 financial crisis',
    'How Kubernetes orchestrates containers',
    'Tesla Autopilot architecture explained',
  ]

  // Typewriter effect
  useEffect(() => {
    const current = topics[topicIdx]
    if (typing) {
      if (displayed.length < current.length) {
        const t = setTimeout(() => setDisplayed(current.slice(0, displayed.length + 1)), 45)
        return () => clearTimeout(t)
      } else {
        const t = setTimeout(() => setTyping(false), 1800)
        return () => clearTimeout(t)
      }
    } else {
      if (displayed.length > 0) {
        const t = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 25)
        return () => clearTimeout(t)
      } else {
        setTopicIdx((topicIdx + 1) % topics.length)
        setTyping(true)
      }
    }
  }, [displayed, typing, topicIdx])

  // Pipeline animation
  useEffect(() => {
    const t = setInterval(() => {
      setPipelineStep(s => (s + 1) % 5)
    }, 800)
    return () => clearInterval(t)
  }, [])

  const pipelineSteps = [
    { icon: '⬡', label: 'API Gateway' },
    { icon: '◈', label: 'Decompose' },
    { icon: '◎', label: 'Research ×3' },
    { icon: '◇', label: 'Synthesize' },
    { icon: '◆', label: 'Persist' },
  ]

  return (
    <div className="landing">
      <div className="landing-bg">
        <div className="landing-grid" />
        <div className="landing-glow" />
      </div>

      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-logo-mark">S</div>
          <div>
            <span className="nav-wordmark">SAGE</span>
            <span className="nav-wordmark-sub">AI RESEARCH</span>
          </div>
        </div>
        <button className="btn-ghost" onClick={onGetStarted}>Sign In</button>
      </nav>

      <div className="landing-hero">
        <div className="landing-badge">AI Research Synthesizer · Serverless · AWS</div>
        <h1 className="landing-title">
          Ask anything.<br />
          <span className="landing-title-accent">Understand everything.</span>
        </h1>

        <div className="typewriter-wrap">
          <span className="typewriter-prefix">Try: </span>
          <span className="typewriter-text">{displayed}</span>
          <span className="typewriter-cursor">|</span>
        </div>

        <button className="btn-primary landing-cta" onClick={onGetStarted}>
          Start Researching
          <span className="btn-arrow">→</span>
        </button>

        <div className="landing-stats">
          <div className="landing-stat">
            <span className="landing-stat-val">45s</span>
            <span className="landing-stat-label">avg generation</span>
          </div>
          <div className="landing-stat-sep" />
          <div className="landing-stat">
            <span className="landing-stat-val">3×</span>
            <span className="landing-stat-label">parallel threads</span>
          </div>
          <div className="landing-stat-sep" />
          <div className="landing-stat">
            <span className="landing-stat-val">7</span>
            <span className="landing-stat-label">Lambda functions</span>
          </div>
          <div className="landing-stat-sep" />
          <div className="landing-stat">
            <span className="landing-stat-val">∞</span>
            <span className="landing-stat-label">topics supported</span>
          </div>
        </div>
      </div>

      <div className="pipeline-section">
        <p className="pipeline-label">LIVE PIPELINE PREVIEW</p>
        <div className="pipeline-animated">
          {pipelineSteps.map((s, i) => (
            <div key={s.label} className="pipeline-anim-item">
              <div className={`pipeline-anim-node ${i === pipelineStep ? 'active' : ''} ${i < pipelineStep ? 'done' : ''}`}>
                <span className="pipeline-node-icon">{s.icon}</span>
                <span className="pipeline-node-label">{s.label}</span>
              </div>
              {i < pipelineSteps.length - 1 && (
                <div className={`pipeline-anim-arrow ${i < pipelineStep ? 'active' : ''}`}>→</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="how-row">
        {[
          { num: '01', icon: '◈', title: 'Submit', desc: 'Any topic — tech, finance, science, history' },
          { num: '02', icon: '◎', title: 'Research', desc: '3 parallel AI threads on Amazon Bedrock' },
          { num: '03', icon: '◆', title: 'Read', desc: 'Structured brief in your history forever' },
        ].map((s, i) => (
          <div key={s.num} className="how-row-step">
            <div className="how-row-num">{s.num}</div>
            <div className="how-row-icon">{s.icon}</div>
            <div className="how-row-title">{s.title}</div>
            <div className="how-row-desc">{s.desc}</div>
          </div>
        ))}
      </div>

      <div className="stack-badges">
        {STACK.map(s => (
          <div key={s.name} className="stack-badge">
            <div className="stack-badge-dot" style={{ background: s.color }} />
            <span className="stack-badge-name">{s.name}</span>
          </div>
        ))}
      </div>

      <footer className="landing-footer">
        <span>Built on Amazon Web Services</span>
        <span className="footer-sep">·</span>
        <span>Java 25 · Serverless Lambdas</span>
        <span className="footer-sep">·</span>
        <span>Claude Haiku 4.5 on Bedrock</span>
      </footer>
    </div>
  )
}

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({ email, setEmail, password, setPassword, error, loading, onSubmit, onBack, onSignup }) {
  return (
    <div className="auth-screen">
      <div className="auth-bg" />
      <div className="auth-card">
        <div className="auth-brand">
          <div className="nav-logo-mark">S</div>
          <div>
            <span className="nav-wordmark">SAGE</span>
            <span className="nav-wordmark-sub">AI RESEARCH</span>
          </div>
        </div>
        <h2 className="auth-title">Welcome back</h2>
        <p className="auth-sub">Sign in to access your research workspace</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label className="field-label">Email</label>
            <input
              className="field-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <input
              className="field-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? <span className="btn-spinner" /> : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button
          className="btn-demo"
          onClick={() => {
            const emailInput = document.querySelector('input[type="email"]')
            const passInput = document.querySelector('input[type="password"]')
            if (emailInput) emailInput.value = 'test@sage.com'
            if (passInput) passInput.value = 'Test1234!'
            setEmail('test@sage.com')
            setPassword('Test1234!')
          }}
        >
          <span className="demo-icon">◆</span>
          Try Demo — instant access, no signup
        </button>

        <div className="auth-switch">
          Don't have an account?
          <button className="auth-switch-btn" onClick={onSignup}>Sign up free</button>
        </div>

        <button className="btn-back" onClick={onBack}>← Back to home</button>
      </div>
    </div>
  )
}

// ── Signup Screen ─────────────────────────────────────────────────────────────
function SignupScreen({ email, setEmail, password, setPassword, confirm, setConfirm, error, success, loading, onSubmit, onLogin, onBack }) {
  return (
    <div className="auth-screen">
      <div className="auth-bg" />
      <div className="auth-card">
        <div className="auth-brand">
          <div className="nav-logo-mark">S</div>
          <div>
            <span className="nav-wordmark">SAGE</span>
            <span className="nav-wordmark-sub">AI RESEARCH</span>
          </div>
        </div>
        <h2 className="auth-title">Create your account</h2>
        <p className="auth-sub">Start researching any topic with AI-powered intelligence briefs</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label className="field-label">Email</label>
            <input className="field-input" type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required />
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <input className="field-input" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters" required />
          </div>
          <div className="field">
            <label className="field-label">Confirm Password</label>
            <input className="field-input" type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat your password" required />
          </div>
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}
          <button className="btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? <span className="btn-spinner" /> : 'Create Account'}
          </button>
        </form>

        <div className="auth-switch">
          Already have an account?
          <button className="auth-switch-btn" onClick={onLogin}>Sign in</button>
        </div>

        <button className="btn-back" onClick={onBack}>← Back to home</button>
      </div>
    </div>
  )
}

// ── Verify Screen ─────────────────────────────────────────────────────────────
function VerifyScreen({ email, code, setCode, error, success, loading, onSubmit, onResend, onBack }) {
  return (
    <div className="auth-screen">
      <div className="auth-bg" />
      <div className="auth-card">
        <div className="auth-brand">
          <div className="nav-logo-mark">S</div>
          <div>
            <span className="nav-wordmark">SAGE</span>
            <span className="nav-wordmark-sub">AI RESEARCH</span>
          </div>
        </div>
        <div className="verify-icon">✉️</div>
        <h2 className="auth-title">Check your email</h2>
        <p className="auth-sub">We sent a 6-digit verification code to <strong>{email}</strong></p>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label className="field-label">Verification Code</label>
            <input className="field-input verify-input" type="text"
              value={code} onChange={e => setCode(e.target.value)}
              placeholder="123456" maxLength={6} required />
          </div>
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}
          <button className="btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? <span className="btn-spinner" /> : 'Verify Email'}
          </button>
        </form>

        <div className="auth-switch">
          Didn't receive it?
          <button className="auth-switch-btn" onClick={onResend}>Resend code</button>
        </div>

        <button className="btn-back" onClick={onBack}>← Back to sign in</button>
      </div>
    </div>
  )
}

// ── Research Screen ───────────────────────────────────────────────────────────
function ResearchScreen({ topic, setTopic, error, setError, generating, stageIndex, userEmail, onGenerate, onSignOut, onHistory }) {
  return (
    <div className="research-screen">
      <nav className="nav nav-app">
        <div className="nav-brand">
          <div className="nav-logo-mark">S</div>
          <div>
            <span className="nav-wordmark">SAGE</span>
            <span className="nav-wordmark-sub">AI RESEARCH</span>
          </div>
        </div>
        <div className="nav-right">
          <span className="nav-user">{userEmail}</span>
          <button className="btn-ghost btn-sm" onClick={onHistory}>History</button>
          <button className="btn-ghost btn-sm" onClick={onSignOut}>Sign out</button>
        </div>
      </nav>

      <div className="research-content">
        {!generating ? (
          <>
            <div className="research-header">
              <h1 className="research-title">What do you want to research?</h1>
              <p className="research-sub">
                Enter any topic — technical, financial, scientific, historical.
                Sage will generate a structured intelligence brief in under 45 seconds.
              </p>
            </div>

            <div className="input-section">
              <div className={`topic-input-wrap ${error ? 'has-error' : ''}`}>
                <textarea
                  className="topic-input"
                  value={topic}
                  onChange={e => { if (e.target.value.length <= 400) { setTopic(e.target.value); setError('') }}}
                  placeholder="e.g. How does Kubernetes manage container orchestration"
                  rows={3}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onGenerate() }}}
                  maxLength={400}
                />
                <div className="char-counter" style={{color: topic.length > 250 ? 'var(--warning)' : 'var(--text-dim)'}}>
                  {topic.length}/400
                </div>
                <button
                  className="topic-submit"
                  onClick={onGenerate}
                  disabled={!topic.trim()}
                >
                  <span>Generate</span>
                  <span className="btn-arrow">→</span>
                </button>
              </div>
              {error && (
                <div className="topic-error">
                  <span className="error-icon">⚠</span>
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="examples-section">
              <p className="examples-label">EXAMPLE TOPICS</p>
              <div className="examples-grid">
                {[
                  'How Tesla Autopilot works',
                  'What caused the 2008 financial crisis',
                  'How CRISPR gene editing works',
                  'Nvidia investment thesis 2025',
                  'How Spotify recommends music',
                  'Microservices vs monolithic architecture'
                ].map(ex => (
                  <button key={ex} className="example-chip" onClick={() => { setTopic(ex); setError('') }}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <div className="stack-mini">
              {STACK.map(s => (
                <div key={s.name} className="stack-mini-item">
                  <div className="stack-mini-dot" style={{ background: s.color }} />
                  <span>{s.name}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="generating-view">
            <div className="generating-topic">
              <span className="generating-label">RESEARCHING</span>
              <p className="generating-topic-text">"{topic}"</p>
            </div>

            <div className="pipeline-progress">
              {STAGES.map((stage, i) => (
                <div key={stage.id} className={`stage-item ${i <= stageIndex ? 'active' : ''} ${i === stageIndex ? 'current' : ''}`}>
                  <div className="stage-icon-wrap">
                    <span className="stage-icon">{stage.icon}</span>
                    {i < stageIndex && <span className="stage-check">✓</span>}
                    {i === stageIndex && <span className="stage-spinner" />}
                  </div>
                  <div className="stage-info">
                    <div className="stage-label">{stage.label}</div>
                    <div className="stage-detail">{stage.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="generating-status">
              <p className="generating-note">
                Claude Haiku 4.5 is running 3 parallel research threads on Amazon Bedrock
              </p>
              <p className="generating-note" style={{marginTop: '0.5rem', color: 'var(--text-dim)'}}>
                This takes 30-60 seconds. Do not close this tab.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Report Screen ─────────────────────────────────────────────────────────────
function ReportScreen({ report, renderReport, onResearch, onSignOut, onHistory, onBack }) {
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 20
      const maxWidth = pageWidth - margin * 2
      let y = margin

      // Header
      doc.setFillColor(8, 12, 20)
      doc.rect(0, 0, pageWidth, 18, 'F')
      doc.setTextColor(79, 158, 255)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('SAGE', margin, 12)
      doc.setTextColor(150, 150, 170)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text('AI RESEARCH SYNTHESIZER', margin + 14, 12)
      doc.setTextColor(150, 150, 170)
      doc.setFontSize(7)
      doc.text(new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }), pageWidth - margin, 12, { align: 'right' })
      y = 30

      // Topic
      doc.setFillColor(15, 20, 35)
      doc.rect(0, y - 8, pageWidth, 22, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      const topicLines = doc.splitTextToSize(report.topic || 'Research Report', maxWidth)
      doc.text(topicLines, margin, y)
      y += topicLines.length * 7 + 10

      // Stats
      doc.setFillColor(20, 28, 48)
      doc.rect(margin, y, maxWidth, 10, 'F')
      doc.setTextColor(79, 158, 255)
      doc.setFontSize(7)
      const stats = [report.generationTime ? 'Generated in ' + report.generationTime + 's' : '', '3 parallel research threads', 'Claude Haiku 4.5 on Bedrock'].filter(Boolean).join('   ·   ')
      doc.text(stats, margin + 4, y + 6.5)
      y += 18

      // Content
      const sections = (report.reportText || '').split('\n\n')
      for (const section of sections) {
        if (!section.trim()) continue
        const lines = section.split('\n')
        const firstLine = lines[0].trim()
        const isHeader = firstLine === firstLine.toUpperCase() && firstLine.length > 2 && !firstLine.includes('.')
        if (isHeader) {
          y += 4
          doc.setTextColor(79, 158, 255)
          doc.setFontSize(8)
          doc.setFont('helvetica', 'bold')
          doc.text(firstLine, margin, y)
          y += 2
          doc.setDrawColor(79, 158, 255)
          doc.setLineWidth(0.3)
          doc.line(margin, y, margin + 40, y)
          y += 5
          const bodyText = lines.slice(1).join('\n').trim()
          if (bodyText) {
            doc.setTextColor(40, 45, 65)
            doc.setFontSize(9)
            doc.setFont('helvetica', 'normal')
            const bodyLines = doc.splitTextToSize(bodyText, maxWidth)
            for (const bl of bodyLines) {
              if (y > pageHeight - margin) { doc.addPage(); y = 20 }
              doc.text(bl, margin, y)
              y += 5
            }
          }
        } else {
          doc.setTextColor(40, 45, 65)
          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
          const paraLines = doc.splitTextToSize(section.trim(), maxWidth)
          for (const pl of paraLines) {
            if (y > pageHeight - margin) { doc.addPage(); y = 20 }
            doc.text(pl, margin, y)
            y += 5
          }
        }
        y += 3
      }

      // Footer
      doc.setFillColor(8, 12, 20)
      doc.rect(0, pageHeight - 12, pageWidth, 12, 'F')
      doc.setTextColor(100, 100, 120)
      doc.setFontSize(7)
      doc.text('Generated by Sage — AI Research Synthesizer', margin, pageHeight - 5)

      const filename = (report.topic || 'sage-report').slice(0, 40).replace(/[^a-z0-9]/gi, '-').toLowerCase()
      doc.save(filename + '.pdf')
    } catch (err) {
      console.error('PDF failed:', err)
      alert('Could not generate PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const wordCount = report.reportText?.split(/\s+/).length || 0
  const readTime = Math.ceil(wordCount / 200)
  const sectionCount = (report.reportText?.match(/^[A-Z\s]{4,}$/gm) || []).length

  const handleCopy = () => {
    navigator.clipboard.writeText(
      `${report.topic}

${report.reportText}

Generated by Sage — AI Research Synthesizer`
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Extract sub-questions from researchResults
  const subQuestions = report.researchResults?.map(r => r.question) || []

  return (
    <div className="report-screen">
      <nav className="nav nav-app">
        <div className="nav-brand">
          <div className="nav-logo-mark">S</div>
          <div>
            <span className="nav-wordmark">SAGE</span>
            <span className="nav-wordmark-sub">AI RESEARCH</span>
          </div>
        </div>
        <div className="nav-right">
          {onBack && (
            <button className="btn-ghost btn-sm" onClick={onBack}>← Back</button>
          )}
          <button className="btn-ghost btn-sm" onClick={handleDownload} disabled={downloading}>
            {downloading ? <span className="btn-spinner" style={{width:'12px',height:'12px',borderColor:'var(--border-light)',borderTopColor:'var(--accent)'}}/> : '↓ PDF'}
          </button>
          <button className="btn-ghost btn-sm" onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy Report'}
          </button>
          <button className="btn-ghost btn-sm" onClick={onHistory}>History</button>
          <button className="btn-primary btn-sm" onClick={onResearch}>
            New Research
          </button>
          <button className="btn-ghost btn-sm" onClick={onSignOut}>Sign out</button>
        </div>
      </nav>

      <div className="report-content">
        <div className="report-meta">
          <span className="report-badge">Intelligence Brief</span>
          <span className="report-topic">{report.topic}</span>
          <span className="report-status">◆ Complete</span>
        </div>

        <div className="report-stats-bar">
          <div className="report-stat">
            <span className="stat-value">{wordCount}</span>
            <span className="stat-label">words</span>
          </div>
          <div className="stat-divider" />
          <div className="report-stat">
            <span className="stat-value">{readTime} min</span>
            <span className="stat-label">read time</span>
          </div>
          <div className="stat-divider" />
          <div className="report-stat">
            <span className="stat-value">{sectionCount || 4}</span>
            <span className="stat-label">sections</span>
          </div>
          <div className="stat-divider" />
          <div className="report-stat">
            <span className="stat-value">{report.generationTime || 35}s</span>
            <span className="stat-label">generated in</span>
          </div>
          <div className="stat-divider" />
          <div className="report-stat">
            <span className="stat-value">3</span>
            <span className="stat-label">parallel threads</span>
          </div>
        </div>

        {subQuestions.length > 0 && (
          <div className="subquestions-panel">
            <div className="subquestions-label">◈ RESEARCH DECOMPOSITION</div>
            <div className="subquestions-list">
              {subQuestions.map((q, i) => (
                <div key={i} className="subquestion-item">
                  <span className="subquestion-num">0{i+1}</span>
                  <span className="subquestion-text">{q}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="report-body">
          {renderReport(report.reportText)}
        </div>

        <div className="report-pipeline-note">
          <div className="pipeline-note-label">PIPELINE EXECUTION</div>
          <div className="pipeline-note-steps">
            {['API Gateway', 'Decompose', 'Research ×3', 'Synthesize', 'Persist → DynamoDB'].map((s, i, arr) => (
              <span key={s}>
                <span className="pipeline-note-step">{s}</span>
                {i < arr.length - 1 && <span className="pipeline-note-arrow"> → </span>}
              </span>
            ))}
          </div>
        </div>

        <div className="report-footer">
          <span>Generated by Sage</span>
          <span className="footer-sep">·</span>
          <span>Claude Haiku 4.5 on Amazon Bedrock</span>
          <span className="footer-sep">·</span>
          <span>Java 25 Serverless Pipeline on AWS</span>
          <span className="footer-sep">·</span>
          <span>Step Functions · Lambda · DynamoDB</span>
        </div>
      </div>
    </div>
  )
}

// ── Fatal Error Screen ────────────────────────────────────────────────────────
function FatalErrorScreen({ error, onRetry, onSignIn }) {
  return (
    <div className="auth-screen">
      <div className="auth-bg" />
      <div className="auth-card" style={{textAlign: 'center'}}>
        <div style={{fontSize: '2rem', marginBottom: '1rem'}}>⚠</div>
        <h2 className="auth-title" style={{color: 'var(--error)'}}>{error.title}</h2>
        <p className="auth-sub" style={{marginBottom: '2rem'}}>{error.message}</p>
        {error.action === 'retry' && (
          <button className="btn-primary btn-full" onClick={onRetry}>
            Try Again
          </button>
        )}
        {error.action === 'signin' && (
          <button className="btn-primary btn-full" onClick={onSignIn}>
            Sign In Again
          </button>
        )}
      </div>
    </div>
  )
}

// ── History Screen ────────────────────────────────────────────────────────────
function HistoryScreen({ history, historyLoading, onLoad, onBack, onSignOut, onViewReport, onDelete }) {
  useEffect(() => { onLoad() }, [])
  const [loading, setLoading] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // reportId to confirm delete
  const [deleting, setDeleting] = useState(null)

  const handleDeleteClick = (e, reportId) => {
    e.stopPropagation()
    setDeleteConfirm(reportId)
  }

  const handleDeleteConfirm = async () => {
    const reportId = deleteConfirm
    setDeleteConfirm(null)
    setDeleting(reportId)
    try {
      await deleteReport(reportId)
      onDelete(reportId)
    } catch (err) {
      alert('Could not delete report. Please try again.')
    } finally {
      setDeleting(null)
    }
  }

  const handleView = async (reportId) => {
    setLoading(reportId)
    await onViewReport(reportId)
    setLoading(null)
  }

  const formatDate = (iso) => {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="report-screen">
      <nav className="nav nav-app">
        <div className="nav-brand">
          <div className="nav-logo-mark">S</div>
          <div>
            <span className="nav-wordmark">SAGE</span>
            <span className="nav-wordmark-sub">AI RESEARCH</span>
          </div>
        </div>
        <div className="nav-right">
          <button className="btn-primary btn-sm" onClick={onBack}>New Research</button>
          <button className="btn-ghost btn-sm" onClick={onSignOut}>Sign out</button>
        </div>
      </nav>

      <div className="history-content">
        <div className="history-header">
          <h1 className="research-title">Report History</h1>
          <p className="research-sub">
            {history.length > 0
              ? `${history.length} report${history.length > 1 ? 's' : ''} generated — stored in DynamoDB`
              : 'No reports yet — generate your first one!'}
          </p>
        </div>

        {historyLoading ? (
          <div className="history-loading">
            <span className="btn-spinner" style={{width:'20px',height:'20px',borderColor:'var(--border-light)',borderTopColor:'var(--accent)'}}/>
            <span>Loading your reports from database...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="history-empty">
            <div className="history-empty-icon">◇</div>
            <p>Your generated reports will appear here</p>
            <p style={{fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '-0.5rem'}}>
              Reports are tracked per browser session
            </p>
            <button className="btn-primary" onClick={onBack}>Generate a Report</button>
          </div>
        ) : (
          <div className="history-list">
            {history.map((item, i) => (
              <div key={item.reportId} className="history-item" style={{animationDelay: `${i * 0.05}s`}}>
                <div className="history-item-left">
                  <div className="history-item-topic">{item.topic}</div>
                  <div className="history-item-meta">
                    <span className="history-item-date">{formatDate(item.generatedAt)}</span>
                    {item.generationTime && (
                      <>
                        <span className="footer-sep">·</span>
                        <span className="history-item-time">Generated in {item.generationTime}s</span>
                      </>
                    )}
                    <span className="footer-sep">·</span>
                    <span className="history-item-id">{item.reportId.slice(0, 8)}...</span>
                  </div>
                </div>
                <div className="history-item-actions">
                  <button
                    className="btn-ghost btn-sm history-view-btn"
                    onClick={() => handleView(item.reportId)}
                    disabled={loading === item.reportId}
                  >
                    {loading === item.reportId ? <span className="btn-spinner" /> : 'View →'}
                  </button>
                  <button
                    className="history-delete-btn"
                    onClick={(e) => handleDeleteClick(e, item.reportId)}
                    disabled={deleting === item.reportId}
                    title="Delete report"
                  >
                    {deleting === item.reportId ? <span className="btn-spinner" style={{width:'12px',height:'12px',borderColor:'var(--border-light)',borderTopColor:'var(--error)'}}/> : '🗑'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {deleteConfirm && (
          <div className="delete-overlay">
            <div className="delete-modal">
              <div className="delete-modal-icon">🗑</div>
              <h3 className="delete-modal-title">Delete this report?</h3>
              <p className="delete-modal-msg">This will permanently remove the report from your history and database. This cannot be undone.</p>
              <div className="delete-modal-actions">
                <button className="btn-ghost" onClick={() => setDeleteConfirm(null)}>No, keep it</button>
                <button className="delete-confirm-btn" onClick={handleDeleteConfirm}>Yes, delete</button>
              </div>
            </div>
          </div>
        )}

        <div className="history-note">
          <span className="pipeline-note-label">PERSISTENCE LAYER</span>
          <p>Reports are stored in <span style={{color: 'var(--accent)'}}>Amazon DynamoDB</span> (NoSQL, on-demand) and cached locally for instant access. Each report is addressable by UUID via <span style={{color: 'var(--accent)'}}>GET /reports/{'{reportId}'}</span>.</p>
        </div>
      </div>
    </div>
  )
}
