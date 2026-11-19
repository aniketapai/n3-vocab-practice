import { createApp } from 'vue'
import App from './App.vue'

import '@fontsource/poppins/300.css'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '@fontsource/noto-sans-jp/700.css'
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/500.css'
import '@fontsource/noto-sans-jp/600.css'
import './style.css'
import { initSync } from './sync.js'

initSync()
createApp(App).mount('#app')
