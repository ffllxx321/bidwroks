import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercept fetch to encode non ISO-8859-1 headers (such as Chinese characters in roles or usernames)
const originalFetch = window.fetch;
const customFetch = function (this: any, input: RequestInfo | URL, init?: RequestInit) {
  if (init && init.headers) {
    let headers = init.headers;
    if (headers instanceof Headers) {
      if (headers.has("x-username")) {
        const val = headers.get("x-username");
        if (val) headers.set("x-username", encodeURIComponent(val));
      }
      if (headers.has("x-user-role")) {
        const val = headers.get("x-user-role");
        if (val) headers.set("x-user-role", encodeURIComponent(val));
      }
      if (headers.has("x-user-id")) {
        const val = headers.get("x-user-id");
        if (val) headers.set("x-user-id", encodeURIComponent(val));
      }
    } else if (Array.isArray(headers)) {
      const mappedHeaders: [string, string][] = (headers as [string, string][]).map(pair => {
        const key = pair[0].toLowerCase();
        if (key === "x-username") return [pair[0], encodeURIComponent(pair[1])];
        if (key === "x-user-role") return [pair[0], encodeURIComponent(pair[1])];
        if (key === "x-user-id") return [pair[0], encodeURIComponent(pair[1])];
        return [pair[0], pair[1]];
      });
      init.headers = mappedHeaders;
    } else if (typeof headers === "object") {
      const typedHeaders = { ...headers } as Record<string, string>;
      for (const key of Object.keys(typedHeaders)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === "x-username" || lowerKey === "x-user-role" || lowerKey === "x-user-id") {
          typedHeaders[key] = encodeURIComponent(typedHeaders[key]);
        }
      }
      init.headers = typedHeaders;
    }
  }
  return originalFetch.call(this, input, init);
};

try {
  Object.defineProperty(window, 'fetch', {
    value: customFetch,
    configurable: true,
    writable: true
  });
} catch (e) {
  // Fallback to direct assignment
  try {
    window.fetch = customFetch;
  } catch (err) {
    console.warn("Could not patch window.fetch:", err);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
