'use client'

import React, { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from '@/context/ThemeContext'
import { LayoutDashboard, Users, FileText, ShieldCheck, ArrowLeft, Tags } from 'lucide-react'
import { userAPI } from '@/lib/api'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { variant } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [checking, setChecking] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    setMounted(true)
    const token = typeof window !== 'undefined' ? localStorage.getItem('surexend_access_token') : null
    if (!token) {
      router.replace('/auth/login')
      return
    }
    userAPI.getProfile()
      .then((p: any) => {
        if (p?.role !== 'ADMIN') {
          setDenied(true)
          router.replace('/app/dashboard')
        }
      })
      .catch(() => router.replace('/auth/login'))
      .finally(() => setChecking(false))
  }, [router])

  if (!mounted || checking) {
    return (
      <div className="h-dvh-force w-full bg-[#060A15] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
      </div>
    )
  }

  if (denied) return null

  const navItems = [
    { label: 'Overview', icon: LayoutDashboard, href: '/admin' },
    { label: 'Users', icon: Users, href: '/admin/users' },
    { label: 'Transactions', icon: FileText, href: '/admin/transactions' },
    { label: 'Pricing', icon: Tags, href: '/admin/pricing' },
    { label: 'KYC Review', icon: ShieldCheck, href: '/admin/kyc' },
  ]

  return (
    <>
      <div className="h-dvh-force w-full max-w-full bg-[#060A15] text-white flex flex-col">
        <div className="flex flex-1 min-h-0 w-full max-w-full">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-60 flex-shrink-0 border-r border-white/5 bg-[#0F1629] p-4 min-h-0 overflow-y-auto">
          <Link href="/app/dashboard" className="flex items-center gap-2 text-[#64748B] hover:text-white text-xs mb-6">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to app
          </Link>
          <div className="flex items-center gap-2.5 mb-8 px-2">
            <img src={variant === 'gold' ? '/logo-mark-gold.png' : '/logo-mark-plain.png'} alt="SureXend" className="w-7 h-7 object-contain" />
            <div>
              <p className="font-extrabold text-sm leading-none tracking-wider">SURE<span className={variant === 'gold' ? 'text-[#D4A017]' : 'text-[#B5E23D]'}>X</span>END</p>
              <p className="text-[10px] text-[#64748B] mt-1">Admin Console</p>
            </div>
          </div>
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-sm ${
                    isActive ? 'bg-white/[0.06] text-white font-semibold' : 'text-[#64748B] hover:text-white hover:bg-white/[0.03]'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="mt-auto p-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] text-[10px] text-amber-400/90 leading-relaxed">
            Sensitive operations. All admin actions are attributed to your account.
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-none p-4 sm:p-6 md:p-8 pb-24 sm:pb-10 md:pb-10 max-w-[1400px]">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 w-full bg-[#0D1322]/95 backdrop-blur-md border-t border-white/5 flex justify-around py-2 z-50">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link key={item.href} href={item.href} className={`flex flex-col items-center text-[10px] ${isActive ? 'text-white' : 'text-[#64748B]'}`}>
              <item.icon className="w-5 h-5 mb-0.5" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      </div>
    </>
  )
}