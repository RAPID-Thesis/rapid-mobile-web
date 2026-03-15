# RAPID - Hybrid AI System for Earthquake Resilience

Pre-earthquake vulnerability prediction and post-earthquake damage classification through image and structural data integration with automated action planning.

## Project Structure

```
rapid/
├── mobile/     # React Native (Expo) - Field inspector mobile app
├── web/        # React.js (Vite) - Engineer/DRRMO web portal
└── README.md
```

## Getting Started

### Mobile App (Field Inspectors)

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go, or press `a` for Android emulator / `i` for iOS simulator.

### Web Portal (Engineers / DRRMO)

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native (Expo), Expo Router, Expo Camera, AsyncStorage |
| Web | React.js (Vite), Tailwind CSS, Leaflet.js, React Router |
| Types | Shared TypeScript interfaces mirroring the PRD data model |

## Mock Data

Both apps ship with identical mock data (10 building assessments across Philippine municipalities) so all screens are functional without a backend. The mock data covers SAFE, RESTRICTED, and UNSAFE classifications across both pre-earthquake and post-earthquake phases.
