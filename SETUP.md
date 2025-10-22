# 🚀 Getting Started with Pulseboard

## Installation

Since this is a monorepo, you need to install dependencies from the root:

```bash
# Install all dependencies for both client and server
npm install
```

This will install dependencies for:
- Root workspace
- `apps/server`
- `apps/client`

## Development

### Start Both Client and Server

```bash
# Run both in parallel
npm run dev
```

This will start:
- 🎨 Client at `http://localhost:5173`
- 🚀 Server at `http://localhost:3000`

### Start Individually

```bash
# Server only
npm run dev:server

# Client only
npm run dev:client
```

## Environment Variables

### Server (Optional)

Create `apps/server/.env` (see `.env.example`):

```env
PORT=3000
HOST=0.0.0.0
CLIENT_URL=http://localhost:5173

# Rate Limiting
PULSE_RATE_POINTS=5
PULSE_RATE_DURATION=3
COLOR_CHANGE_COOLDOWN=300

# Sync Settings
SYNC_WINDOW_MS=600
SYNC_REQUIRED_USERS=8
```

### Client (Optional)

Create `apps/client/.env.local`:

```env
VITE_SERVER_URL=http://localhost:3000
```

## Testing Locally

1. **Open Multiple Tabs**: Open `http://localhost:5173` in multiple browser tabs
2. **Pick Different Colors**: Each tab should pick a different color
3. **Start Pulsing**: Try to coordinate pulses across tabs
4. **Watch Streaks Build**: When 8+ tabs pulse within 600ms, the streak increases!

## Production Build

```bash
# Build both apps
npm run build

# Start production server
npm run start
```

## Deployment

### Server Deployment (Railway, Render, Fly.io, etc.)

1. Set environment variables in your hosting platform
2. Run `npm install` in the root
3. Run `npm run build --workspace=apps/server`
4. Start with `npm run start`

### Client Deployment (Vercel, Netlify, etc.)

1. Set build command: `npm run build --workspace=apps/client`
2. Set output directory: `apps/client/dist`
3. Set environment variable: `VITE_SERVER_URL=https://your-server.com`

## Architecture

```
Root
├── apps/client          # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx      # Main app component
│   │   ├── Canvas.tsx   # Pulse visualization
│   │   ├── ColorPicker.tsx
│   │   ├── socket.ts    # WebSocket client
│   │   └── store.ts     # Zustand state management
│   └── package.json
│
└── apps/server          # Node + Fastify backend
    ├── src/
    │   ├── index.ts     # Server entry
    │   ├── ws.ts        # WebSocket logic
    │   ├── streak.ts    # Streak calculation
    │   ├── rateLimit.ts # Rate limiting
    │   └── types.ts     # TypeScript types
    └── package.json
```

## How It Works

### Client Flow
1. User picks a color
2. Client connects via WebSocket and emits `ws:join`
3. Server assigns `UserN` identity
4. User can pulse (rate limited)
5. Pulses appear on canvas with animation
6. Streak updates happen in real-time

### Server Flow
1. Accepts WebSocket connections
2. Assigns sequential user numbers
3. Validates all inputs
4. Rate limits pulse requests
5. Calculates sync windows (600ms)
6. Checks if 8+ distinct users pulsed
7. Broadcasts streak updates to all clients

### Sync Mechanic
- **Window Size**: 600ms
- **Required Users**: 8 distinct users
- **Success**: All users see burst animation, streak +1
- **Failure**: Streak resets to 0

## Troubleshooting

### Port Already in Use

```bash
# Find process on port 3000 (server)
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Find process on port 5173 (client)
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### WebSocket Connection Failed

- Check server is running
- Check `VITE_SERVER_URL` in client
- Check `CLIENT_URL` in server
- Check CORS settings

### Dependencies Not Installing

```bash
# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

## Technologies Used

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **Socket.IO Client** - WebSocket client
- **Canvas API** - Pulse visualization

### Backend
- **Node.js** - Runtime
- **Fastify** - Web framework
- **Socket.IO** - WebSocket server
- **TypeScript** - Type safety
- **Rate Limiter Flexible** - Rate limiting
- **nanoid** - ID generation

## Next Steps

- [ ] Add audio tones for pulses
- [ ] Implement color change feature
- [ ] Add sync window visual indicator
- [ ] Improve mobile experience
- [ ] Add pulse intensity levels
- [ ] Create historical stats page

## Contributing

This is an experimental project! Feel free to fork and make it your own.

## License

MIT
