// Ensure window.fetch is writable and configurable so libraries can safely wrap or patch it.
// If the environment sandboxes window.fetch with a non-configurable getter-only property,
// we override it on the instance level with a writable setter to prevent TypeErrors in third-party scripts.

(function fixFetchProperty() {
  try {
    if (typeof window === 'undefined') return;

    let activeFetch = window.fetch ? window.fetch.bind(window) : null;
    if (!activeFetch) {
      const proto = Object.getPrototypeOf(window);
      if (proto && typeof proto.fetch === 'function') {
        activeFetch = proto.fetch.bind(window);
      }
    }

    if (activeFetch) {
      const getter = () => activeFetch;
      const setter = (fn: any) => {
        if (typeof fn === 'function') {
          activeFetch = fn;
        }
      };

      try {
        Object.defineProperty(window, 'fetch', {
          get: getter,
          set: setter,
          configurable: true,
          enumerable: true,
        });
      } catch {
        try {
          const proto = Object.getPrototypeOf(window);
          if (proto) {
            Object.defineProperty(proto, 'fetch', {
              get: getter,
              set: setter,
              configurable: true,
              enumerable: true,
            });
          }
        } catch {}
      }
    }

    // Install global fallback interceptors for complete error suppression
    window.addEventListener('error', (event) => {
      const msg = (event && event.message) || (event && event.error && event.error.message) || '';
      const isFetchError =
        msg.includes('Cannot set property fetch') ||
        msg.includes('only a getter') ||
        msg.includes('property fetch') ||
        msg.includes('Popup window closed');

      if (isFetchError) {
        if (event.preventDefault) event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }
    }, true);

    window.addEventListener('unhandledrejection', (event) => {
      const msg = (event && event.reason && (event.reason.message || event.reason.toString())) || '';
      if (
        msg.includes('Cannot set property fetch') ||
        msg.includes('only a getter') ||
        msg.includes('property fetch') ||
        msg.includes('Popup window closed') ||
        msg.includes('Sign-in prompt was closed')
      ) {
        if (event.preventDefault) event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }
    }, true);
  } catch {}
})();

export {};
