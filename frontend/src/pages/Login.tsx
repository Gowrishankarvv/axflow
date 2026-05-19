import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import api from '../lib/api'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../components/layouts/AuthLayout'

/**
 * Login flow:
 *  1. User submits email + password → POST /auth/login/.
 *  2. Backend returns {access, refresh}. If the user was created with a temp
 *     password (admin-issued), the response also includes must_set_password=true.
 *     In that case the frontend stores the tokens AND switches to the
 *     set-password step. The /auth/set-password/ call below is authenticated.
 *  3. After /auth/set-password/ succeeds, we land on the dashboard.
 *
 * The old "Sign Up" flow (which relied on /auth/check-new-user/ +
 * /auth/set-new-password/ — i.e. the `12345678`-seed backdoor) has been
 * removed. Onboarding is now: admin creates the account with a random temp
 * password → admin shares it with the user → user signs in normally.
 */
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [step, setStep] = useState<'login' | 'setPassword'>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const navigate = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (step === 'login') {
        const { data } = await api.post('/auth/login/', { email, password })
        // Store tokens unconditionally — the set-password call below is
        // authenticated and needs the access token in localStorage.
        localStorage.setItem('access', data.access)
        localStorage.setItem('refresh', data.refresh)
        if (data.must_set_password) {
          setStep('setPassword')
        } else {
          setTimeout(() => navigate('/'), 0)
        }
      } else {
        // Set-password step
        if (newPassword !== confirmPassword) {
          setError('Passwords do not match')
          return
        }
        const { data } = await api.post('/auth/set-password/', { password: newPassword })
        // Backend returns fresh tokens — replace whatever we have.
        if (data.access) localStorage.setItem('access', data.access)
        if (data.refresh) localStorage.setItem('refresh', data.refresh)
        setTimeout(() => navigate('/'), 0)
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.password?.[0] || 'Login failed'
      setError(typeof detail === 'string' ? detail : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title={step === 'setPassword' ? 'Secure Your Account' : 'Welcome Back'}
      subtitle={step === 'setPassword'
        ? 'Create a strong password to protect your account.'
        : 'Sign in to access your dashboard and insights.'}
    >
      <div className="w-full">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-extrabold text-brand-dark mb-2">
            {step === 'setPassword' ? 'Set Password' : 'Sign in to Axinortech'}
          </h2>
          {step === 'setPassword' && (
            <p className="text-sm text-gray-500 mt-2">
              Your account uses a temporary password. Choose a new one to continue.
            </p>
          )}
        </div>

        <form onSubmit={submit} className="space-y-5">
          {step === 'login' ? (
            <>
              <div className="space-y-1">
                <label className="block text-sm font-bold text-brand-dark ml-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-3 rounded-xl text-brand-dark placeholder-gray-400 focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-neutral-50/50 transition-all font-medium"
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
                    className="w-full px-4 py-3 bg-white border border-gray-3 rounded-xl text-brand-dark placeholder-gray-400 focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-neutral-50/50 transition-all font-medium"
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
          ) : (
            <>
              <div className="space-y-1">
                <label className="block text-sm font-bold text-brand-dark ml-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-3 rounded-xl text-brand-dark placeholder-gray-400 focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-neutral-50/50 transition-all font-medium"
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
                  className="w-full px-4 py-3 bg-white border border-gray-3 rounded-xl text-brand-dark placeholder-gray-400 focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-neutral-50/50 transition-all font-medium"
                  placeholder="Confirm new password"
                  required
                />
              </div>
            </>
          )}

          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm font-medium rounded-lg text-center animate-in fade-in slide-in-from-top-1">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-blue disabled:bg-neutral-300 hover:bg-neutral-900 text-white font-bold py-3.5 rounded-full shadow-lg shadow-neutral-700/20 active:scale-[0.98] transition-all duration-200 mt-6"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              step === 'setPassword' ? 'Set Password' : 'Sign In'
            )}
          </button>
        </form>
      </div>
    </AuthLayout>
  )
}
