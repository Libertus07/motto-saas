import { useEffect } from 'react';
import { driver, DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

export function useAppTour(tourId: string, steps: DriveStep[], delayMs: number = 800) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasSeen = localStorage.getItem(`tour_completed_${tourId}`);
    if (hasSeen === 'true') return;

    // Eğer bu global bir tur değilse ve global tur henüz tamamlanmadıysa, bunu başlatma.
    if (tourId !== 'global_dashboard') {
      const globalSeen = localStorage.getItem('tour_completed_global_dashboard');
      if (globalSeen !== 'true') return;
    }

    const timer = setTimeout(() => {
      // DOM üzerinde elementlerin var olup olmadığını kontrol edelim
      const validSteps = steps.filter(step => {
        if (typeof step.element === 'string') {
          return document.querySelector(step.element) !== null;
        }
        return true;
      });

      if (validSteps.length === 0) return;

      const d = driver({
        showProgress: true,
        animate: true,
        smoothScroll: true,
        allowClose: true,
        overlayColor: 'rgba(12, 10, 9, 0.85)', // bg-stone-950 hafif transparan
        popoverClass: 'motto-tour-theme', // Global CSS içinde şekillendireceğiz
        doneBtnText: 'Harika! 🚀',
        nextBtnText: 'İleri ➔',
        prevBtnText: '⬅ Geri',
        progressText: '{{current}} / {{total}}',
        steps: validSteps,
        onDestroyed: () => {
          // Tur kapatıldığında veya bittiğinde localStorage'a kaydet
          localStorage.setItem(`tour_completed_${tourId}`, 'true');
          
          // Eğer global tur bittiyse ve sayfayı yenilemeden lokal turun başlamasını istiyorsak
          // basitçe sayfayı yenileyebiliriz veya diğer turun tetiklenmesine izin verebiliriz.
          if (tourId === 'global_dashboard') {
            window.location.reload();
          }
        }
      });
      
      d.drive();
    }, delayMs);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, delayMs]);
}
