'use client'

import type { CSSProperties } from 'react'
import { cn, getInitials } from '@/lib/utils'

interface UserAvatarProps {
  src?: string | null
  name?: string | null
  className?: string
  imageClassName?: string
  initialsClassName?: string
  style?: CSSProperties
}

export default function UserAvatar({
  src,
  name,
  className,
  imageClassName,
  initialsClassName,
  style,
}: UserAvatarProps) {
  const fullName = (name || '').trim() || 'SureXend User'
  const initials = getInitials(fullName) || 'SX'

  return (
    <div
      className={cn(
        'overflow-hidden rounded-full border border-white/15 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.14),rgba(255,255,255,0.04))] shadow-[0_10px_30px_rgba(0,0,0,0.24)]',
        className,
      )}
      style={style}
      aria-label={fullName}
    >
      {src ? (
        <img
          src={src}
          alt={fullName}
          className={cn('h-full w-full object-cover', imageClassName)}
        />
      ) : (
        <div
          className={cn(
            'flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(212,160,23,0.28),rgba(14,165,233,0.18))] font-extrabold uppercase tracking-[0.08em] text-white',
            initialsClassName,
          )}
        >
          {initials}
        </div>
      )}
    </div>
  )
}
