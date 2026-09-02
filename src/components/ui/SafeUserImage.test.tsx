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
  current: undefined as unknown,
  setState: vi.fn<[value: unknown], void>(),
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
    reactState.current = undefined
    reactState.setState.mockReset()
    reactState.setState.mockImplementation((value) => {
      reactState.current = value
    })
    reactState.useState.mockReset()
    reactState.useState.mockImplementation((initialValue) => {
      if (reactState.current === undefined) {
        reactState.current = initialValue
      }

      return [reactState.current, reactState.setState]
    })
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

  it('accepts fill sizing with non-empty responsive sizes', () => {
    const markup = renderToStaticMarkup(
      <SafeUserImage
        src="https://example.com/logo.png"
        alt="İşletme logosu"
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
      />,
    )

    expect(markup).toContain('<img')
    expect(markup).toContain('src="https://example.com/logo.png"')
  })

  it('rejects fill sizing when sizes is missing', () => {
    expect(() =>
      renderToStaticMarkup(<SafeUserImage src="https://example.com/logo.png" alt="İşletme logosu" fill />),
    ).toThrow('Kullanıcı görseli için genişlik ve yükseklik gerekli.')
  })

  it('rejects fill sizing when sizes is blank', () => {
    expect(() =>
      renderToStaticMarkup(<SafeUserImage src="https://example.com/logo.png" alt="İşletme logosu" fill sizes="   " />),
    ).toThrow('Kullanıcı görseli için genişlik ve yükseklik gerekli.')
  })

  it('requests fallback state and calls onLoadError when the image errors', () => {
    const onLoadError = vi.fn()
    const source = 'https://example.com/logo.png'

    renderToStaticMarkup(
      <SafeUserImage src={source} alt="İşletme logosu" width={96} height={96} onLoadError={onLoadError} />,
    )

    expect(capturedImageOnError).toBeTypeOf('function')
    capturedImageOnError?.()

    const markup = renderToStaticMarkup(
      <SafeUserImage src={source} alt="İşletme logosu" width={96} height={96} onLoadError={onLoadError} />,
    )

    expect(markup).toContain('data-safe-user-image-fallback="true"')
    expect(onLoadError).toHaveBeenCalledTimes(1)
    expect(onLoadError).toHaveBeenLastCalledWith()
  })

  it('renders a changed source after the previous source fails', () => {
    const firstSource = 'https://example.com/first-logo.png'
    const nextSource = 'https://example.com/next-logo.png'

    renderToStaticMarkup(<SafeUserImage src={firstSource} alt="İşletme logosu" width={96} height={96} />)
    capturedImageOnError?.()

    const markup = renderToStaticMarkup(
      <SafeUserImage src={nextSource} alt="Yeni işletme logosu" width={96} height={96} />,
    )

    expect(markup).toContain('<img')
    expect(markup).toContain(`src="${nextSource}"`)
    expect(markup).not.toContain('data-safe-user-image-fallback')
  })

  it('renders an accessible fallback instead of the image boundary after failure', () => {
    reactState.current = 'https://example.com/logo.png'

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

  it('preserves fill layout when rendering the failure fallback', () => {
    const source = 'https://example.com/fill-logo.png'

    renderToStaticMarkup(
      <SafeUserImage
        src={source}
        alt="İşletme logosu"
        fill
        sizes="100vw"
        className="fill-layout"
        fallbackClassName="fallback-sinifi"
        style={{ objectFit: 'cover' }}
      />,
    )
    capturedImageOnError?.()

    const markup = renderToStaticMarkup(
      <SafeUserImage
        src={source}
        alt="İşletme logosu"
        fill
        sizes="100vw"
        className="fill-layout"
        fallbackClassName="fallback-sinifi"
        style={{ objectFit: 'cover' }}
      />,
    )

    expect(markup).toContain('class="fill-layout fallback-sinifi"')
    expect(markup).toContain('style="object-fit:cover;position:absolute;inset:0"')
    expect(markup).toContain('data-safe-user-image-fallback="true"')
    expect(markup).not.toContain('<img')
  })
})
