import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { loadRuntimeConfig } from './lib/runtime-config';

import './styles.css';

async function bootstrap() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found.');
  }

  try {
    const config = await loadRuntimeConfig();
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App config={config} />
      </React.StrictMode>
    );
  } catch (error) {
    console.error(error);
    rootElement.replaceChildren();

    const main = document.createElement('main');
    main.style.padding = '24px';
    main.style.fontFamily = 'ui-sans-serif,system-ui,sans-serif';

    const title = document.createElement('h1');
    title.textContent = 'Не удалось запустить Автосид';

    const text = document.createElement('p');
    text.textContent = 'Обновите страницу. Если ошибка повторится, сообщите администратору.';

    main.append(title, text);
    rootElement.append(main);
  }
}

bootstrap();
