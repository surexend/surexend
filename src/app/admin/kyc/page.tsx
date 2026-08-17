'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminAPI } from '@/lib/api'
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

const STATUSES = ['PENDING', 'VERIFIED', 'REJECTED', 'UNVERIFIED']

export default function AdminKycPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('PENDING')

  const load = useCallback(() => {
    setLoading(true)
    adminAPI.getKyc({ status: status || undefined }).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [status])

  useEffect(() => { load() }, [load])

  const decide = (id: string, approve: boolean) => {
    const reason = approve ? undefined : (window.prompt('Rejection reason (shown to the user):', 'Document could not be verified') || undefined)
    adminAPI.decideKyc(id, { approve, reason }).then(() => {
      toast.success(approve ? 'Approved' : 'Rejected')
      load()
    }).catch(() => toast.error('Action failed'))
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">KYC Review</h1>
        <p className="text-xs text-[#64748B] mt-0.5">{data ? `${data.total} document${data.total === 1 ? '' : 's'}` : 'Loading…'}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              status === s ? 'bg-white/10 text-white border border-white/15' : 'bg-white/[0.03] text-[#64748B] border border-white/5 hover:text-white'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" /></div>
      ) : !data ? (
        <p className="text-[#94A3B8] text-sm py-20 text-center">Failed to load KYC queue.</p>
      ) : data.documents.length === 0 ? (
        <p className="text-[#94A3B8] text-sm py-20 text-center">No {status.toLowerCase()} documents.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data.documents.map((d: any) => (
            <div key={d.id} className="liquid-glass p-5 relative overflow-hidden space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-white font-bold">{d.user?.firstName} {d.user?.lastName}</p>
                  <p className="text-[11px] text-[#64748B]">{d.user?.email} · @{d.user?.surexTag || '—'}</p>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                  d.status === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400' :
                  d.status === 'REJECTED' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                }`}>{d.status}</span>
              </div>

              <div className="text-xs space-y-1">
                <p className="text-[#94A3B8]">{d.type} · <span className="text-white">Tier {d.tier}</span> request</p>
                <p className="text-[#64748B]">Submitted {formatDate(d.createdAt)}</p>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                {d.documentUrl && (
                  <a href={d.documentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#94A3B8] hover:text-white">
                    <ExternalLink className="w-3 h-3" /> Document
                  </a>
                )}
                {d.selfieUrl && (
                  <a href={d.selfieUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#94A3B8] hover:text-white">
                    <ExternalLink className="w-3 h-3" /> Selfie
                  </a>
                )}
              </div>

              {d.status === 'PENDING' && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => decide(d.id, true)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => decide(d.id, false)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/15 text-red-400 text-xs font-bold hover:bg-red-500/25"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}