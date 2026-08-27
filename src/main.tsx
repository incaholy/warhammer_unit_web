import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import { ToastProvider } from './toast/ToastProvider'
import { emitToast } from './toast/toastBus'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { messageWithReference } from './lib/errors'
import './styles/theme.css'
import './styles/global.css'
import App from './App.tsx'

// Surface every mutation outcome as a toast, centrally: failures show the API
// error message, with the request id appended on a server fault so the user has
// something to quote; successes show the mutation's `meta.successMessage`.
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      emitToast(messageWithReference(error), 'error')
    },
    onSuccess: (_data, _vars, _ctx, mutation) => {
      const message = mutation.meta?.successMessage
      if (typeof message === 'string') emitToast(message)
    },
  }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
