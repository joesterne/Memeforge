# MemeForge

MemeForge is a comprehensive, collaborative meme creation platform featuring real-time editing, image and GIF search, trending topics, and AI-powered meme drafting. 

## Features

- **Advanced Meme Editor**: A full-featured canvas editor powered by `react-konva` for text, image, and shape manipulation, complete with drag-and-drop support.
- **AI-Powered Meme Generation**: Utilize the power of Gemini AI to generate custom meme text and draft concepts instantly.
- **Search Integrations**: Native integrations for pulling images, GIFs, and meme templates from Google Search and Tenor.
- **Trending Topics**: Stay up to date with the latest trends using integrated Google Trends API to inspire your creations.
- **Real-Time Collaboration**: Co-create memes with friends or colleagues using Socket.IO for real-time synchronization.
- **Firebase Integration**: User authentication, cloud storage, and database features powered by Firebase to keep your history and drafts secure.
- **Progressive Web App (PWA)**: Built as a PWA, MemeForge can be installed on your device for a native-like experience.
- **Pro Tier / Monetization**: Stripe integration built-in to handle checkout sessions for premium features.

## Tech Stack

### Frontend
- **Framework**: React 19 + TypeScript
- **Styling**: Tailwind CSS v4
- **Canvas / Graphics**: React Konva (`react-konva`, `konva`)
- **Animations**: Framer Motion (`motion`)
- **Icons**: Lucide React
- **Routing**: React Router v7

### Backend
- **Server**: Node.js & Express
- **Real-Time**: Socket.IO
- **Database & Auth**: Firebase Firestore & Firebase Auth
- **AI**: Google Gen AI SDK (`@google/genai`) for Gemini model integrations
- **Payments**: Stripe

### Build Tools
- **Bundler**: Vite & esbuild
- **PWA**: `vite-plugin-pwa` & `workbox-window`

## Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/joesterne/Memeforge.git
   cd Memeforge
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Copy the `.env.example` file to `.env` and fill in the required variables.
   ```bash
   cp .env.example .env
   ```
   **Key Variables:**
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
   - `STRIPE_SECRET_KEY` & `VITE_STRIPE_PUBLIC_KEY`: Stripe API keys for payments.
   - Firebase configurations (e.g., `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`).

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

### Building for Production

To build the application for production, run:
```bash
npm run build
```
This command builds the frontend with Vite and the backend server with esbuild.

You can then start the production server with:
```bash
npm start
```

## Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add some amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

## License

This project is open-source and available under standard open-source conventions. Feel free to modify and distribute as per your project requirements.
