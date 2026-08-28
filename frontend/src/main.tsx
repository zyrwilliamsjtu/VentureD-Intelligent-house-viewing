import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useAppStore } from './store/useAppStore'
import './styles/global.css'

// dev-only 调试钩子：浏览器 console 里可用 __appStore.getState()/setState 联调测试（生产构建不含）
if (import.meta.env.DEV) {
  ;(window as unknown as { __appStore: typeof useAppStore }).__appStore = useAppStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
