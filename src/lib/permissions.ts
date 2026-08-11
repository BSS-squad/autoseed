export function requestSteamMain(): boolean {
  const iframe = document.createElement('iframe');
  iframe.hidden = true;
  iframe.title = 'Проверка Steam';
  document.body.appendChild(iframe);

  try {
    iframe.src = 'steam://open/main';
    window.setTimeout(() => iframe.remove(), 1500);
    return true;
  } catch {
    iframe.remove();
    return false;
  }
}
