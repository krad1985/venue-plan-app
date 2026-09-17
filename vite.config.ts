import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/venue-plan-app/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: '場勘平面圖 - Venue Planner',
        short_name: '場勘平面圖',
        description: '活動場佈專用 - 拍照建圖、手拉牆、排桌椅、電源備註、PDF匯出',
        theme_color: '#0f172a',
        background_color: '#f1f5f9',
        display: 'standalone',
        scope: '/venue-plan-app/',
        start_url: '/venue-plan-app/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
  server: { port: 5173 }
})
