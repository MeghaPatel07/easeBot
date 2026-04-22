import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initAnalytics, startReplay } from './lib/analytics'

initAnalytics()
// Anonymous/guest replay: sampled per §7 cost-control. AuthContext will upgrade
// this when the user logs in (paying users always record).
startReplay({ isPaying: false, route: window.location.pathname })

createRoot(document.getElementById("root")!).render(<App />);
