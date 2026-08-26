'use client'

import { useState } from 'react'
import type React from 'react'
import Image, { type ImageProps } from 'next/image'

export type SafeUserImageProps = Omit<ImageProps, 'unoptimized' | 'onError'> & {
  fallbackClassName?: string
  onLoadError?: () => void
}

export function SafeUserImage({
  alt,
  fallbackClassName = '',
  onLoadError,
  ...imageProps
}: SafeUserImageProps): React.ReactNode {
  const [failed, setFailed] = useState(false)
  const hasDimensions = imageProps.width !== undefined && imageProps.height !== undefined
  const hasFillSizing =
    imageProps.fill === true && typeof imageProps.sizes === 'string' && imageProps.sizes.trim().length > 0

  if (!alt.trim()) {
    throw new Error('Kullanıcı görseli için açıklayıcı alt metin gerekli.')
  }

  if (!hasDimensions && !hasFillSizing) {
    throw new Error('Kullanıcı görseli için genişlik ve yükseklik gerekli.')
  }

  if (failed) {
    return (
      <div
        role="img"
        aria-label={`${alt} yüklenemedi`}
        className={fallbackClassName}
        data-safe-user-image-fallback
        style={
          imageProps.fill
            ? { ...imageProps.style, position: 'absolute', inset: 0 }
            : { ...imageProps.style, width: imageProps.width, height: imageProps.height }
        }
      >
        <span aria-hidden="true">🖼️</span>
      </div>
    )
  }

  return (
    <Image
      {...imageProps}
      alt={alt}
      unoptimized
      onError={() => {
        setFailed(true)
        onLoadError?.()
      }}
    />
  )
}
