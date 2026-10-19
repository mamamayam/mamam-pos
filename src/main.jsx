import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App.jsx'
import { backStack } from './lib/backStack'
import { AuthProvider } from './auth/AuthContext.jsx'
import ExitToast from './components/ui/ExitToast.jsx'
import Toaster from './components/ui/Toaster.jsx'
import { registerServiceWorker } from './lib/registerServiceWorker'
import { isHppPath, shouldReloadOnReturn } from './lib/appMode'
import './index.css'

// Mode ditentukan SEKALI di sini: /hpp dan /hpp/* = HPP (owner, laptop), selain itu = POS.
// Jangan dicek ulang di dalam komponen. Satu domain, satu build (lihat vercel.json).
const isHpp = isHppPath(window.location.pathname)

// HPP dimuat lazy supaya jadi chunk terpisah dan tidak terunduh saat POS dibuka.
// Jangan mengimpor src/hpp/* secara statis dari jalur POS.
const HppApp = lazy(() => import('./hpp/HppApp.jsx'))

if (isHpp) {
  // HPP: tanpa backStack, tanpa AuthProvider/ExitToast POS, tanpa service worker.
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Suspense fallback={null}>
        <HppApp />
      </Suspense>
    </React.StrictMode>,
  )
} else {
  // Sambungkan tombol Back sedini mungkin (sebelum React render) supaya kasus refresh
  // di entri riwayat dalam bisa dibersihkan di awal.
  backStack.init();

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
        <ExitToast />
        <Toaster />
      </AuthProvider>
    </React.StrictMode>,
  )

  // Kembali dari /hpp lewat Back: kalau browser memulihkan halaman POS lama dari cache, muat ulang
  // supaya state-nya cocok dengan posisi riwayat (lihat appMode.js).
  window.addEventListener('pageshow', (e) => {
    if (shouldReloadOnReturn(e.persisted)) window.location.reload();
  });

  // PWA: hanya aktif di build produksi (lihat src/lib/registerServiceWorker.js).
  registerServiceWorker();
}
