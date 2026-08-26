import { renderToStaticMarkup } from 'react-dom/server'
import type { ImageProps } from 'next/image'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockImageProps = Pick<ImageProps, 'src' | 'alt' | 'unoptimized'> & {
  onError?: () => void
}

function getImageSource(src: ImageProps['src']): string {
  if (typeof src === 'string') {
    return src
  }

  return 'default' in src ? src.default.src : src.src
}

const reactState = vi.hoisted(() => ({
  setFailed: vi.fn<[failed: boolean], void>(),
  useState: vi.fn(),
}))

let capturedImageOnError: (() => void) | undefined

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')

  return {
    ...actual,
    useState: reactState.useState,
  }
})

vi.mock('next/image', () => ({
  default: ({ alt, src, unoptimized, onError }: MockImageProps) => {
    capturedImageOnError = onError

    // eslint-disable-next-line @next/next/no-img-element -- This is the narrowly mocked next/image framework boundary.
    return <img src={getImageSource(src)} alt={alt} data-unoptimized={String(unoptimized)} />
  },
}))

import { SafeUserImage } from './SafeUserImage'

describe('SafeUserImage', () => {
  beforeEach(() => {
    capturedImageOnError = undefined
    reactState.setFailed.mockReset()
    reactState.useState.mockReset()
    reactState.useState.mockReturnValue([false, reactState.setFailed])
  })

  it('always disables the optimizer for a user-controlled URL', () => {
    const markup = renderToStaticMarkup(
      <SafeUserImage
        src="https://zahdmrvhxsmqpeesrfkt.supabase.co/storage/v1/object/public/logos/org/logo.webp"
        alt="İşletme logosu"
        width={96}
        height={96}
      />,
    )

    expect(markup).toContain('data-unoptimized="true"')
    expect(markup).toContain('alt="İşletme logosu"')
  })

  it('requires non-empty accessible alternative text at runtime', () => {
    expect(() =>
      renderToStaticMarkup(<SafeUserImage src="https://example.com/logo.png" alt="" width={96} height={96} />),
    ).toThrow('Kullanıcı görseli için açıklayıcı alt metin gerekli.')
  })

  it('requires width and height when fill sizing is not used', () => {
    expect(() =>
      renderToStaticMarkup(<SafeUserImage src="https://example.com/logo.png" alt="İşletme logosu" width={96} />),
    ).toThrow('Kullanıcı görseli için genişlik ve yükseklik gerekli.')
  })

  it('requests fallback state and calls onLoadError when the image errors', () => {
    const onLoadError = vi.fn()

    renderToStaticMarkup(
      <SafeUserImage
        src="https://example.com/logo.png"
        alt="İşletme logosu"
        width={96}
        height={96}
        onLoadError={onLoadError}
      />,
    )

    expect(capturedImageOnError).toBeTypeOf('function')
    capturedImageOnError?.()

    expect(reactState.setFailed).toHaveBeenCalledTimes(1)
    expect(reactState.setFailed).toHaveBeenLastCalledWith(true)
    expect(onLoadError).toHaveBeenCalledTimes(1)
    expect(onLoadError).toHaveBeenLastCalledWith()
  })

  it('renders an accessible fallback instead of the image boundary after failure', () => {
    reactState.useState.mockReturnValue([true, reactState.setFailed])

    const markup = renderToStaticMarkup(
      <SafeUserImage
        src="https://example.com/logo.png"
        alt="İşletme logosu"
        width={96}
        height={96}
        className="user-image-layout"
        fallbackClassName="fallback-sinifi"
        style={{ width: '50vw', height: 'auto' }}
      />,
    )

    expect(markup).toContain('role="img"')
    expect(markup).toContain('aria-label="İşletme logosu yüklenemedi"')
    expect(markup).toContain('class="user-image-layout fallback-sinifi"')
    expect(markup).toContain('style="width:50vw;height:auto"')
    expect(markup).toContain('data-safe-user-image-fallback="true"')
    expect(markup).not.toContain('data-unoptimized')
    expect(markup).not.toContain('<img')
  })
})
