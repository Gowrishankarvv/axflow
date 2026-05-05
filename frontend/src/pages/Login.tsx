import React, { useState } from 'react'
import { Eye, EyeOff, CheckSquare, Square } from 'lucide-react'
import api, { checkNewUser } from '../lib/api'
import { setNewPassword } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../components/layouts/AuthLayout'

export default function Login() {
  const [isNewUser, setIsNewUser] = useState(false)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPasswordState] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [step, setStep] = useState<'login' | 'setPassword'>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Terms state for "Sign Up" visual compliance
  const [agreeTerms, setAgreeTerms] = useState(true)

  const navigate = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (step === 'login') {
      if (isNewUser) {
        // New User Flow (Mapped to "Create Account" UI)
        if (!agreeTerms) {
          setError('You must agree to the Terms & Conditions')
          setLoading(false)
          return
        }
        try {
          const response = await checkNewUser(username)
          if (response.data.valid) {
            setStep('setPassword') // Move to password creation
          } else {
            setError('Username not found or password already set')
          }
        } catch (err: any) {
          setError(err?.response?.data?.detail || 'Invalid username')
        }
      } else {
        // Regular Login Flow
        try {
          const { data } = await api.post('/auth/login/', { email, password })
          if (data.must_set_password) {
            setStep('setPassword')
          } else {
            localStorage.setItem('access', data.access)
            localStorage.setItem('refresh', data.refresh)
            setTimeout(() => navigate('/'), 0)
          }
        } catch (err: any) {
          const detail = err?.response?.data?.detail || 'Login failed'
          if (detail && detail.toLowerCase().includes('must_set_password')) setStep('setPassword')
          else if (err?.response?.status === 403) setStep('setPassword')
          else setError(detail)
        }
      }
    } else {
      // Set Password Flow
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match')
        setLoading(false)
        return
      }
      try {
        if (isNewUser) {
          const response = await setNewPassword(username, newPassword, confirmPassword)
          localStorage.setItem('access', response.data.access)
          localStorage.setItem('refresh', response.data.refresh)
          setTimeout(() => navigate('/login'), 0)
        } else {
          const response = await api.post('/auth/set-password/', { password: newPassword })
          localStorage.setItem('access', response.data.access)
          localStorage.setItem('refresh', response.data.refresh)
          setTimeout(() => navigate('/login'), 0)
        }
      } catch (err: any) {
        setError(err?.response?.data?.detail || err?.response?.data || 'Password set failed')
      }
    }

    setLoading(false)
  }

  // Toggle between Login and "Create Account" (New User)
  const toggleMode = (mode: 'signin' | 'signup') => {
    setIsNewUser(mode === 'signup')
    setError('')
    setStep('login')
  }

  return (
    <AuthLayout
      title={step === 'setPassword' ? "Secure Your Account" : (isNewUser ? "Join the Future" : "Welcome Back")}
      subtitle={step === 'setPassword' ? "Create a strong password to protect your data." : (isNewUser ? "Create your account and start your journey with Axinortech." : "Sign in to access your dashboard and insights.")}
    >
      <div className="w-full">
        {/* Header Section */}
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-extrabold text-brand-dark mb-2">
            {step === 'setPassword' ? 'Set Password' : (isNewUser ? 'Create your account' : 'Sign in to Axinortech')}
          </h2>
          {step === 'login' && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                type="button"
                onClick={() => toggleMode('signup')}
                className={`px-6 py-2 rounded-full text-sm font-bold transition-all duration-300 border-2 ${isNewUser
                  ? 'bg-brand-blue border-brand-blue text-white shadow-lg shadow-blue-500/30'
                  : 'bg-transparent border-transparent text-gray-500 hover:text-brand-blue'}`}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => toggleMode('signin')}
                className={`px-6 py-2 rounded-full text-sm font-bold transition-all duration-300 border-2 ${!isNewUser
                  ? 'bg-brand-blue border-brand-blue text-white shadow-lg shadow-blue-500/30'
                  : 'bg-transparent border-transparent text-gray-500 hover:text-brand-blue'}`}
              >
                Sign In
              </button>
            </div>
          )}
        </div>

        <form onSubmit={submit} className="space-y-5">

          {/* INPUT FIELDS */}
          {step === 'login' ? (
            <>
              {isNewUser ? (
                <div className="space-y-1">
                  <label className="block text-sm font-bold text-brand-dark ml-1">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-gray-3 rounded-xl text-brand-dark placeholder-gray-400 focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-blue-50/50 transition-all font-medium"
                    placeholder="Enter your username"
                    required
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="block text-sm font-bold text-brand-dark ml-1">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-3 rounded-xl text-brand-dark placeholder-gray-400 focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-blue-50/50 transition-all font-medium"
                      placeholder="name@company.com"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-sm font-bold text-brand-dark ml-1">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-3 rounded-xl text-brand-dark placeholder-gray-400 focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-blue-50/50 transition-all font-medium"
                        placeholder="Enter your password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-blue transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            /* SET PASSWORD FIELDS */
            <>
              <div className="space-y-1">
                <label className="block text-sm font-bold text-brand-dark ml-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPasswordState(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-3 rounded-xl text-brand-dark placeholder-gray-400 focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-blue-50/50 transition-all font-medium"
                  placeholder="Create new password"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-bold text-brand-dark ml-1">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-3 rounded-xl text-brand-dark placeholder-gray-400 focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-blue-50/50 transition-all font-medium"
                  placeholder="Confirm new password"
                  required
                />
              </div>
            </>
          )}

          {/* ERROR MESSAGE */}
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm font-medium rounded-lg text-center animate-in fade-in slide-in-from-top-1">
              {error}
            </div>
          )}

          {/* EXTRAS: TERMS (Only for New User / Create Account) */}
          {step === 'login' && isNewUser && (
            <div className="flex items-start gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAgreeTerms(!agreeTerms)}
                className={`flex-shrink-0 mt-0.5 ${agreeTerms ? 'text-brand-blue' : 'text-gray-300'}`}
              >
                {agreeTerms ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
              </button>
              <p className="text-xs text-gray-500 leading-normal">
                By signing up, I agree to the <a href="#" className="font-bold text-brand-blue hover:underline">Terms & Conditions</a> and <a href="#" className="font-bold text-brand-blue hover:underline">Privacy Policy</a>.
              </p>
            </div>
          )}

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-blue disabled:bg-blue-300 hover:bg-blue-700 text-white font-bold py-3.5 rounded-full shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all duration-200 mt-6"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              step === 'setPassword' ? 'Set Password' : (isNewUser ? 'Sign Up' : 'Sign In')
            )}
          </button>

          {/* FORGOT PASSWORD (Only for Login) */}
          {step === 'login' && !isNewUser && (
            <div className="text-center pt-2">
              <a href="#" className="text-sm font-semibold text-gray-400 hover:text-brand-dark transition-colors">
                Forgot your password?
              </a>
            </div>
          )}

        </form>
      </div>
    </AuthLayout>
  )
}