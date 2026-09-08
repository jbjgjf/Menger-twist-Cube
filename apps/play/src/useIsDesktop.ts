import { useEffect, useState } from 'react';

/**
 * True only on a desktop-class device: a precise pointer (mouse/trackpad) on a
 * viewport wide enough for the control panel and the 3D scene side by side.
 *
 * This gates the two surfaces that a phone cannot carry — Level 4's 160,000
 * instanced cubies in the Play app, and the Level 3 solve replay in the Lab —
 * so it is deliberately conservative: a tablet in portrait reads as non-desktop.
 *
 * It stays reactive because a desktop window can be resized below the
 * threshold, and because an iPad with a trackpad attached flips `pointer: fine`
 * mid-session.
 */
export const desktopMediaQuery = '(pointer: fine) and (min-width: 1024px)';

export const useIsDesktop = (): boolean => {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(desktopMediaQuery).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(desktopMediaQuery);
    const update = () => setIsDesktop(query.matches);
    update();
    // `change` alone is not enough. Some environments flip what the query
    // matches without ever dispatching it — an embedded webview whose viewport
    // is overridden by the host is the case that caught this — so `resize` is
    // read as a second, coarser signal. Both funnel into the same idempotent
    // `update`, so a doubled notification costs one extra state comparison.
    query.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      query.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return isDesktop;
};
