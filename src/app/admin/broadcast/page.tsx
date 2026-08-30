'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/context/ThemeContext'
import { Send, Bell, Users, Clock, AlertCircle } from 'lucide-react'
import { adminAPI, type AdminApprovalPayload } from '@/lib/api'
import AdminStepUpModal from '@/components/admin/AdminStepUpModal'

export default function AdminBroadcastPage() {
  const { variant, colors } = useTheme()
  const accentHex = variant === 'gold' ? '#D4A017' : '#B5E23D'

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState('BROADCAST')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [userCount, setUserCount] = useState<number>(0)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [approvalLoading, setApprovalLoading] = useState(false)
  const approvalActionRef = useRef<((approval: AdminApprovalPayload) => Promise<void>) | null>(null)

  const broadcastTypes = [
    { value: 'BROADCAST', label: 'Broadcast Message', icon: Bell, color: accentHex },
    { value: 'SYSTEM_UPDATE', label: 'System Update', icon: AlertCircle, color: '#F59E0B' },
    { value: 'PROMOTIONAL', label: 'Promotional', icon: Send, color: '#10B981' },
    { value: 'MAINTENANCE', label: 'Maintenance', icon: Clock, color: '#EF4444' },
  ]

  // Fetch real active user count on mount
  useEffect(() => {
    adminAPI.getUsers({ limit: 1, page: 1 })
      .then(res => setUserCount(res.total || 0))
      .catch(() => setUserCount(0))
  }, [])

  const handleApproval = async (approval: AdminApprovalPayload) => {
    if (!approvalActionRef.current) return
    setApprovalLoading(true)
    try {
      await approvalActionRef.current(approval)
      setApprovalOpen(false)
      approvalActionRef.current = null
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to send broadcast. Please try again.')
    } finally {
      setApprovalLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      setError('Title and message are required')
      return
    }

    setError('')
    setSuccess('')

    approvalActionRef.current = async (approval) => {
      setLoading(true)
      try {
        const result = await adminAPI.broadcastMessage({ title, body, type }, approval)
        setSuccess(result.message || `Broadcast sent successfully! Sent to ${result.userCount} users.`)
        setTitle('')
        setBody('')
      } finally {
        setLoading(false)
      }
    }

    setApprovalOpen(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-white">Send Broadcast Message</h1>
        <p className="text-xs text-[#64748B] mt-1">Send a message to all active users. They will receive it as a notification if they have the PWA installed.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="liquid-glass p-6 rounded-2xl">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                  {success}
                </div>
              )}

              <div>
                <label htmlFor="title" className="block text-sm font-semibold text-white mb-2">
                  Message Title
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., System Maintenance Notice"
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white placeholder-[#64748B] focus:outline-none focus:border-white/30 transition-colors"
                  disabled={loading}
                  maxLength={100}
                />
              </div>

              <div>
                <label htmlFor="type" className="block text-sm font-semibold text-white mb-2">
                  Message Type
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {broadcastTypes.map((t) => {
                    const Icon = t.icon
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setType(t.value)}
                        className={`p-3 rounded-xl border transition-all ${type === t.value
                          ? 'border-white/40 bg-white/[0.06] text-white'
                          : 'border-white/10 bg-white/[0.02] text-[#94A3B8] hover:border-white/30 hover:text-white'
                        }`}
                      >
                        <Icon className="w-5 h-5 mx-auto mb-1" style={{ color: t.color }} />
                        <p className="text-[10px] font-medium">{t.label}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="body" className="block text-sm font-semibold text-white">
                    Message Body
                  </label>
                  <span className="text-[10px] text-[#64748B]">
                    {body.length}/500 chars
                  </span>
                </div>
                <textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Type your broadcast message here..."
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white placeholder-[#64748B] focus:outline-none focus:border-white/30 transition-colors resize-none min-h-[120px]"
                  disabled={loading}
                  maxLength={500}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !title.trim() || !body.trim()}
                className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: colors.gradientBg }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                    Sending...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Send className="w-4 h-4" />
                    Send Broadcast
                  </span>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="liquid-glass p-5 rounded-2xl">
            <h3 className="text-sm font-semibold text-white mb-4">Broadcast Details</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748B]">Message Type</span>
                <span className="text-xs text-white font-medium">{broadcastTypes.find(t => t.value === type)?.label}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748B]">Estimated Recipients</span>
                <span className="text-xs text-white font-medium flex items-center gap-1">
                  <Users className="w-3 h-3" /> {userCount} users
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748B]">PWA Required</span>
                <span className="text-xs text-emerald-400 font-medium">Yes</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748B]">Sound</span>
                <span className="text-xs text-white font-medium">Default notification</span>
              </div>
            </div>
          </div>

          <div className="liquid-glass p-5 rounded-2xl">
            <h3 className="text-sm font-semibold text-white mb-3">Preview</h3>
            <div className="p-4 rounded-xl bg-gradient-to-br from-[#121419] to-[#1a1f29] border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 flex items-center justify-center">
                  <Bell className="w-4 h-4 text-black" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">SureXend Notifications</p>
                  <p className="text-[9px] text-[#64748B]">Now</p>
                </div>
              </div>
              <div className="mt-3">
                <p className="text-sm font-semibold text-white">{title || 'Your Message Title'}</p>
                <p className="text-xs text-[#94A3B8] mt-1 line-clamp-2">
                  {body || 'Your broadcast message preview...'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AdminStepUpModal
        open={approvalOpen}
        title="Approve broadcast delivery"
        description="Broadcasts reach your active user base and should be approved with a transaction PIN or biometric confirmation before sending."
        actionLabel="Send broadcast"
        loading={loading || approvalLoading}
        onClose={() => {
          if (loading || approvalLoading) return
          approvalActionRef.current = null
          setApprovalOpen(false)
        }}
        onApprove={handleApproval}
      />
    </div>
  )
}
