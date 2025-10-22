# 🌈 Pulseboard

> A real-time, anonymous social platform where users connect through synchronized color pulses

## 🎯 Concept

Pulseboard strips social interaction down to its essence: **timing and presence**. No words, no images, no profiles—just anonymous users identified by number and color, sending pulses into a shared timeline.

### Core Features

- **Anonymous Identity**: Every user is `UserN` where N is their join order (User1, User2, etc.)
- **Color as Expression**: Your only customization—choose a color that represents you
- **Pulse Synchronization**: Tap to send a color pulse; sync with others to build global streaks
- **Real-time Connection**: See other users' pulses in real-time on a shared canvas
- **Collective Goals**: Work together to hit sync windows and build community streaks

### How It Works

1. **Join** → Pick your color
2. **Pulse** → Tap to send your color into the timeline  
3. **Sync** → Time your pulses with others to hit sync windows
4. **Streak** → Build collective streaks when enough users sync together

When multiple users (8+) pulse within a 600ms window, the streak increases. Break the window, reset to zero. Simple, addictive, beautiful.

## 🏗️ Architecture

```
pulseboard/
├── apps/
│   ├── client/          # Vite + React + Tailwind frontend
│   └── server/          # Node + Fastify + Socket.IO backend
├── package.json         # Monorepo root
└── tsconfig.json        # Shared TypeScript config
```

### Tech Stack

**Frontend:**
- ⚡ Vite - Lightning-fast dev server
- ⚛️ React 18 - UI framework
- 🎨 Tailwind CSS - Utility-first styling
- 🎯 Canvas API - Pulse visualization
- 🔌 Socket.IO Client - Real-time communication

**Backend:**
- 🚀 Fastify - Fast, low-overhead server
- 🔌 Socket.IO - WebSocket management
- 🛡️ Rate Limiter Flexible - Anti-abuse
- 💾 In-memory state - Fast, ephemeral data

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/RamiNoodle733/Pulseboard.git
cd Pulseboard

# Install all dependencies
npm install

# Start development servers (both client and server)
npm run dev
```

The client will run on `http://localhost:5173` and the server on `http://localhost:3000`.

### Development

```bash
# Run client only
npm run dev:client

# Run server only
npm run dev:server

# Build for production
npm run build

# Start production server
npm run start
```

## 🎮 How to Use

1. **Choose Your Color**: Pick any color from the color wheel
2. **You're Now UserN**: Your anonymous identity is assigned
3. **Start Pulsing**: Click/tap the pulse button to send your color
4. **Watch the Board**: See pulses from all users in real-time
5. **Sync Up**: Time your pulses with others to hit sync windows
6. **Build Streaks**: Help the community build the highest streak

### Sync Mechanics

- **Sync Window**: 600ms window where pulses must land
- **Required Users**: 8 distinct users must pulse in the window
- **Success**: Streak increases, visual celebration
- **Failure**: Miss the window, streak resets to 0

### Rate Limits

- **Pulse Cooldown**: 1 pulse every 3 seconds per user
- **Burst Allowance**: 5 pulses in quick succession, then throttle
- **Color Change**: 5-minute cooldown between color changes

## 🎨 Design Philosophy

### What Pulseboard IS

- Pure interaction through timing
- Anonymous and judgment-free
- Collaborative, not competitive
- Meditative and playful
- About presence, not performance

### What Pulseboard IS NOT

- A place for words or images
- Profile-based or identity-driven
- Gamified with leaderboards
- Ad-supported or data-harvesting
- Complicated or overwhelming

## 🛡️ Anti-Abuse

- Token bucket rate limiting per user
- Server-side timestamp validation
- Cooldowns on all actions
- No user-generated content to moderate
- Simple, effective spam prevention

## 🗺️ Roadmap

### v1.0 - MVP ✅
- [x] Core pulse mechanics
- [x] Real-time synchronization
- [x] Streak system
- [x] Color picker
- [x] Canvas visualization
- [x] Rate limiting

### v1.1 - Enhancements
- [ ] Audio tones per color
- [ ] Visual sync window indicator
- [ ] Heat map visualization
- [ ] Better mobile experience
- [ ] Pulse intensity levels

### v2.0 - Social Features
- [ ] Color duet mode (paired users)
- [ ] Timed events (hourly rallies)
- [ ] Private sync links
- [ ] Historical streak charts
- [ ] Community milestones

## 📊 Data Model

```typescript
// User
{
  id: string           // UUID
  ordinal: number      // User1, User2, etc.
  color: string        // Hex color
  createdAt: number    // Timestamp
}

// Pulse
{
  userId: string
  t: number            // Timestamp
  intensity: 1 | 2 | 3 // Optional
}

// Streak State
{
  windowStart: number
  windowEnd: number
  contributors: Set<string>
  currentStreak: number
  bestStreak: number
}
```

## 🤝 Contributing

This is a personal/experimental project, but ideas and feedback are welcome! Open an issue to discuss potential changes.

## 📄 License

MIT License - Feel free to use this concept and code for your own projects.

## 🎭 Philosophy

> "What if social media was about being together, not broadcasting?"

Pulseboard explores what happens when you remove almost everything we associate with social platforms—words, images, profiles, followers, likes—and keep only one thing: **the ability to be present with others in time**.

It's not about what you say. It's about when you show up.

---

**Built with ❤️ by anonymous developers, for anonymous users**
