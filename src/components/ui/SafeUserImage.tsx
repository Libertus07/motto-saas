'use client'

import { useState } from 'react'
import type React from 'react'
import type { CSSProperties } from 'react'
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
  const fallbackClassNames = [imageProps.className, fallbackClassName].filter(Boolean).join(' ')
  const fallbackStyle: CSSProperties = imageProps.fill
    ? { ...imageProps.style, position: 'absolute', inset: 0 }
    : {
        ...imageProps.style,
        width: imageProps.style?.width ?? imageProps.width,
        height: imageProps.style?.height ?? imageProps.height,
      }

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
        className={fallbackClassNames}
        data-safe-user-image-fallback
        style={fallbackStyle}
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
