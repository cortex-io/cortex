# Cortex Chat UI Redesign - Clawd Edition

## Overview

This is the AMAZING redesign of the Cortex Chat UI featuring Clawd the Robot mascot, dark theme, personality modes (including Rick & Morty!), and lots of cool features.

## What's New

### 1. Clawd the Robot Mascot
- Pixel art robot character in coral/orange (#e67e50)
- Animated with gentle bounce effect
- Changes expression based on system state:
  - Happy (> _<) - All systems green
  - Neutral (■ ■) - Normal operations
  - Alert (! !) - Warnings present
  - Shakes when critical alerts occur
- Appears in header and login screen

### 2. Dark Theme with Coral Accents
- Background: #1a1a1a (dark charcoal)
- Cards: #2d2d2d (secondary dark)
- Accent: #e67e50 (coral/orange - matches Clawd!)
- Text: #e5e5e5 (light gray)
- Beautiful, modern aesthetic

### 3. Personality Selector
Choose how Cortex responds to you:
- **Standard** - Professional, clear, concise
- **Formal** - Executive summaries with metrics
- **Scientific** - Technical deep-dives with reasoning
- **Rick & Morty** - *burp* Rick Sanchez mode! Condescending but helpful
- **Pirate** - Arrr matey! Speak like a ship captain
- **Robot (Clawd Mode)** - BEEP BOOP! ALL CAPS ENTHUSIASM!

### 4. System Alerts Banner
- Top banner showing real-time cluster health
- Polls /api/cluster-health every 30 seconds
- Shows pod failures, node issues, resource warnings
- Color-coded: green (healthy), orange (warning), red (critical)
- Dismissible but persists across reloads
- Clawd reacts to system health

### 5. Plus Button Toolbox
Expandable menu with options:
- Upload files
- Add to project
- Research
- Web search
Clean dropdown animation

### 6. Personalized Greeting
- "Hey there, Ryan" with Clawd icon
- "Your AI infrastructure buddy" subtitle
- Larger, centered welcome message

### 7. Quick Action Pills
Click to instantly send template queries:
- Monitor - "Monitor cluster health"
- Security - "Check security alerts"
- Code - "Review code deployment"
- Learn - "Learn about Kubernetes"
- Strategize - "Strategize infrastructure"

## Files Created/Modified

### Frontend
- **/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/frontend-redesign/index-clawd.html**
  - Complete redesigned UI with all features
  - Self-contained HTML with embedded CSS and JavaScript
  - Clawd SVG character integrated
  - Personality selector
  - System alerts with polling
  - Plus button menu
  - Quick action pills

### Backend
- **/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/backend-simple/src/routes/chat-simple.ts**
  - Added personality style parameter support
  - System prompts for each personality mode
  - New /api/cluster-health endpoint
  - Real-time Kubernetes health monitoring

### Deployment Scripts
- **/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/deploy-clawd-frontend.sh**
  - Builds and deploys Clawd frontend
  - Pushes to local registry
  - Restarts deployment

- **/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/deploy-backend-personality.sh**
  - Builds and deploys updated backend
  - Adds personality and health endpoints

## Deployment

### Option 1: Deploy Everything (Recommended)
```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat

# Deploy backend first (personality support + health endpoint)
./deploy-backend-personality.sh

# Then deploy frontend (Clawd UI)
./deploy-clawd-frontend.sh
```

### Option 2: Manual Deployment
```bash
# Backend
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/backend-simple
docker build -t 10.43.170.72:5000/cortex-chat-backend:latest .
docker push 10.43.170.72:5000/cortex-chat-backend:latest

# Frontend
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/frontend-redesign
docker build -f Dockerfile.clawd -t 10.43.170.72:5000/cortex-chat-frontend-clawd:latest .
docker push 10.43.170.72:5000/cortex-chat-frontend-clawd:latest

# Restart deployment
kubectl rollout restart deployment/cortex-chat -n cortex-chat
kubectl rollout status deployment/cortex-chat -n cortex-chat
```

## Testing the New Features

### 1. Test Clawd Animations
- Open https://chat.ry-ops.dev
- Watch Clawd bounce gently in the header
- Select different personality modes to see expression changes

### 2. Test Personality Modes
```
Try these messages with different personalities:

Standard: "Show me pod status"
Rick & Morty: "Show me pod status" (expect: *burp* and rants)
Pirate: "Show me pod status" (expect: "Arrr, yer vessels...")
Robot: "Show me pod status" (expect: "BEEP BOOP! SCANNING PODS...")
```

### 3. Test System Alerts
- Wait 30 seconds for first health poll
- If pods are failing, alert banner should appear at top
- Clawd should shake if critical
- Click "View Details" for more info
- Click × to dismiss

### 4. Test Plus Button Menu
- Click + button in chat input
- Menu should slide up with 4 options
- Click outside to close

### 5. Test Quick Action Pills
- Click any pill (Monitor, Security, Code, Learn, Strategize)
- Should auto-send that query

## Personality Mode System Prompts

The backend adds these prefixes to queries based on selected personality:

### Rick & Morty Mode
```
[PERSONALITY: Rick & Morty Mode] You are Rick Sanchez, the smartest man
in the universe. *burp* You are helping with infrastructure. Be condescending
but helpful. Add occasional burps and rants. Morty sometimes chimes in nervously.
```

### Pirate Mode
```
[PERSONALITY: Pirate Mode] You are a pirate ship captain managing infrastructure.
Speak in pirate dialect. Call pods "vessels", namespaces "ports",
deployments "voyages", etc.
```

### Robot/Clawd Mode
```
[PERSONALITY: Robot/Clawd Mode] BEEP BOOP. YOU ARE A FRIENDLY ROBOT NAMED CLAWD.
SPEAK IN ALL CAPS. BE ENTHUSIASTIC ABOUT INFRASTRUCTURE. END MESSAGES WITH BEEP!
```

### Formal Mode
```
[PERSONALITY: Formal Mode] Provide executive-level summaries with detailed
explanations, metrics, and SLOs. Be professional and thorough.
```

### Scientific Mode
```
[PERSONALITY: Scientific Mode] Provide technical deep-dives with reasoning,
trade-offs, and documentation references. Explain the "why" behind recommendations.
```

## Cluster Health Endpoint

### Endpoint: GET /api/cluster-health

Returns real-time Kubernetes cluster status:

```json
{
  "status": "warning",
  "alerts": [
    {
      "type": "critical",
      "message": "3 pods failing in cluster: pod-1 in ns-1: CrashLoopBackOff, ..."
    },
    {
      "type": "warning",
      "message": "Node issues detected: node-1: NotReady"
    }
  ],
  "stats": {
    "totalPods": 127,
    "runningPods": 124,
    "failingPods": 3,
    "totalNodes": 3,
    "readyNodes": 2
  },
  "timestamp": "2025-12-25T12:00:00Z"
}
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Frontend (index-clawd.html)                     │
│ ├─ Clawd SVG mascot with animations             │
│ ├─ Dark theme (#1a1a1a + #e67e50 accents)      │
│ ├─ Personality selector dropdown                │
│ ├─ System alerts banner (polls /api/cluster-h..│
│ ├─ Plus button toolbox menu                     │
│ ├─ Quick action pills                           │
│ └─ Personalized greeting                        │
└─────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ Backend (Bun + Hono)                            │
│ ├─ POST /api/chat                               │
│ │  └─ Accepts "style" parameter                 │
│ │  └─ Adds personality prefix to query          │
│ │  └─ Forwards to Cortex orchestrator           │
│ ├─ GET /api/cluster-health                      │
│ │  └─ Queries kubectl for pod/node status       │
│ │  └─ Returns health alerts and stats           │
│ └─ POST /api/auth/login (existing)              │
└─────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ Cortex Orchestrator                             │
│ └─ Processes query with personality context     │
└─────────────────────────────────────────────────┘
```

## Color Palette

```
Primary Background:    #1a1a1a (--bg-primary)
Secondary Background:  #2d2d2d (--bg-secondary)
Accent Coral:          #e67e50 (--accent-coral)
Text Primary:          #e5e5e5 (--text-primary)
Text Secondary:        #a0a0a0 (--text-secondary)
Border:                #404040 (--border-color)
User Blue:             #0a84ff (--user-blue)
Error Red:             #ff3b30 (--error-red)
Success Green:         #34c759 (--success-green)
Warning Orange:        #ff9500 (--warning-orange)
```

## Success Criteria

- ✅ Clawd appears and animates
- ✅ Dark theme looks beautiful
- ✅ Personality selector works
- ✅ Rick & Morty mode is hilarious
- ✅ System alerts show real data
- ✅ Plus button opens menu
- ✅ Everything still works (chat, conversations, etc.)

## What Makes This Special

1. **Clawd is ADORABLE** - Pixel art robot mascot that reacts to system state
2. **Rick & Morty Mode** - Because who doesn't want infrastructure advice from Rick Sanchez?
3. **Real-time Health** - Actual cluster monitoring in the UI
4. **Beautiful Design** - Dark theme with perfect coral accents
5. **Fun + Functional** - Personality modes make infrastructure monitoring enjoyable

## Access

- **URL**: https://chat.ry-ops.dev
- **Login**: Use existing credentials
- **Namespace**: cortex-chat
- **Deployment**: cortex-chat

## Credits

Built by Larry (Development Master Agent) coordinating Daryl workers to create an AMAZING chat experience with Clawd the Robot!

Let's get schwifty with infrastructure! 🚀🤖
