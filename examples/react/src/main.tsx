import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const host = document.getElementById('root');
if (!host) throw new Error('#root is missing from index.html');

// StrictMode is on deliberately: it double-invokes effects in development, which
// is exactly the condition that catches a wrapper mishandling mount/unmount.
createRoot(host).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
