import { useCallback, useEffect, useRef } from 'react'
import { driver, type DriveStep, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const tourStorageKey = (tourId: string) => `tour_status_${tourId}`
const replayEventName = 'motto:replay-tour'

type TourStatus = 'completed' | 'dismissed'

/**
 * Starts a concise, interruptible product tour. A dismissed tour never counts
 * as completed and can always be replayed from the application sidebar.
 */
export function useAppTour(tourId: string, steps: DriveStep[], delayMs = 800) {
  const tourRef = useRef<Driver | null>(null)
  const stepsRef = useRef(steps)

  useEffect(() => {
    stepsRef.current = steps
  }, [steps])

  const startTour = useCallback(() => {
    if (typeof window === 'undefined') return

    const validSteps = stepsRef.current.filter((step) =>
      typeof step.element === 'string' ? document.querySelector(step.element) !== null : true,
    )

    if (validSteps.length === 0) return

    let completed = false
    const instance = driver({
      steps: validSteps,
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      allowKeyboardControl: true,
      overlayColor: '#0c0a09',
      overlayOpacity: 0.78,
      stagePadding: 8,
      stageRadius: 14,
      popoverClass: 'motto-tour-theme',
      doneBtnText: 'Turu tamamla',
      nextBtnText: 'İleri',
      prevBtnText: 'Geri',
      progressText: '{{current}} / {{total}}',
      onDoneClick: (_, __, { driver: activeDriver }) => {
        completed = true
        activeDriver.destroy()
      },
      onNextClick: (_, __, { driver: activeDriver }) => activeDriver.moveNext(),
      onPrevClick: (_, __, { driver: activeDriver }) => activeDriver.movePrevious(),
      onCloseClick: (_, __, { driver: activeDriver }) => activeDriver.destroy(),
      onDestroyed: () => {
        const status: TourStatus = completed ? 'completed' : 'dismissed'
        localStorage.setItem(tourStorageKey(tourId), status)
        tourRef.current = null
      },
    })

    tourRef.current = instance
    instance.drive()
  }, [tourId])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const replay = (event: Event) => {
      const requestedTourId = (event as CustomEvent<string>).detail
      if (requestedTourId === tourId) startTour()
    }

    window.addEventListener(replayEventName, replay)
    return () => {
      window.removeEventListener(replayEventName, replay)
      tourRef.current?.destroy()
    }
  }, [startTour, tourId])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const status = localStorage.getItem(tourStorageKey(tourId))
    if (status === 'completed' || status === 'dismissed') return

    if (tourId !== 'global_dashboard') {
      const globalStatus = localStorage.getItem(tourStorageKey('global_dashboard'))
      if (globalStatus !== 'completed') return
    }

    const timer = window.setTimeout(startTour, delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs, startTour, tourId])

  return { startTour }
}

export function replayAppTour(tourId = 'global_dashboard') {
  if (typeof window === 'undefined') return
  localStorage.removeItem(tourStorageKey(tourId))
  window.dispatchEvent(new CustomEvent(replayEventName, { detail: tourId }))
}
