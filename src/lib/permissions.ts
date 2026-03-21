import type { BrowserPermissions } from '../types';

function canUseWindowOpen(): boolean {
  try {
    const popup = window.open('', '_blank', 'width=360,height=180');
    if (!popup) return false;
    popup.document.write(
      '<!doctype html><title>AutoConnect Check</title><body style="font-family:sans-serif;padding:16px">Проверка браузерных разрешений…<script>window.close()</script></body>'
    );
    popup.document.close();
    popup.close();
    return true;
  } catch {
    return false;
  }
}

async function probeSteamProtocol(): Promise<boolean> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    let finished = false;
    let timeout = 0;

    const finalize = (value: boolean) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      window.removeEventListener('blur', handleSuccess);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      iframe.remove();
      resolve(value);
    };

    const handleSuccess = () => finalize(true);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        finalize(true);
      }
    };

    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    window.addEventListener('blur', handleSuccess, { once: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    timeout = window.setTimeout(() => finalize(false), 1500);

    try {
      iframe.onload = () => {
        finalize(false);
      };
      iframe.src = 'steam://run/393380';
    } catch {
      finalize(false);
    }
  });
}

export async function runPermissionCheck(): Promise<BrowserPermissions> {
  const popupAllowed = canUseWindowOpen();
  const steamProtocolReady = popupAllowed ? await probeSteamProtocol() : false;

  return {
    popupAllowed,
    steamProtocolReady,
    checkedAt: Date.now()
  };
}
