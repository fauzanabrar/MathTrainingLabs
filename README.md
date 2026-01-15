# Math Training Lab - Free Adaptive Math Practice

A **free, open-source adaptive math training platform** for addition, subtraction, multiplication, and division. The web app is a Next.js Progressive Web App (PWA) with a native-app style UI, adaptive difficulty levels, and local progress tracking.

Perfect for students, teachers, and anyone looking to improve their mental math skills with intelligent, personalized math drills.

## Features

### Adaptive Learning System
- **Smart Difficulty Scaling** - Levels automatically adjust based on accuracy and response time
- **Four Practice Modes** - Random mix, Addition, Subtraction, Multiplication, Division
- **Customizable Sessions** - Set questions per session and time per question
- **Performance Analytics** - Detailed per-skill statistics and session summaries

### User Experience
- **Offline Support** - Full PWA capabilities with service worker for offline math practice
- **Progress Tracking** - Local progress persistence with historical statistics
- **Light/Dark Theme** - Comfortable viewing in any lighting condition
- **Responsive Design** - Works seamlessly on desktop, tablet, and mobile devices

## Tech Stack
- **Next.js 16** - React framework with App Router
- **TypeScript** - Type-safe development
- **CSS Modules** - Scoped, maintainable styling
- **LocalStorage API** - Client-side persistence
- **PWA** - Progressive Web App with offline capability

## Getting Started

### Quick Start (Web/PWA)
```bash
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

### Production build
```bash
npm run build
npm run start
```

## Project Structure

```
math-training/
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout with SEO metadata
│   │   ├── page.tsx         # Main PWA interface and logic
│   │   ├── page.module.css  # Page-specific styles
│   │   ├── globals.css      # Global styles
│   │   ├── sitemap.ts       # SEO sitemap
│   │   └── robots.ts        # SEO robots configuration
│   ├── components/
│   │   ├── PopUnderAd.tsx   # Ad integration component
│   │   └── ServiceWorkerRegister.tsx
│   └── lib/
│       └── math.ts          # Adaptive math logic and question generation
├── public/
│   ├── manifest.json        # PWA manifest
│   ├── sw.js               # Service worker
│   ├── robots.txt          # SEO robots file
│   └── icons/              # App icons
├── native/                  # Optional Expo React Native app
└── package.json            # Dependencies
```

### Core Files Explained
- **page.tsx** - Main interactive UI with drill interface, statistics dashboard, and settings
- **math.ts** - Adaptive algorithm that generates problems and adjusts difficulty
- **manifest.json & sw.js** - PWA configuration for offline functionality
- **sitemap.ts & robots.ts** - SEO optimization for search engine indexing

## Deployment

### Deploy to Vercel (Recommended)
The easiest way to deploy a Next.js app:

1. **Using Vercel UI:**
   - Connect your GitHub repository
   - Vercel automatically detects Next.js and deploys
   - Your site is live at `https://<project>.vercel.app`

2. **Using Vercel CLI:**
   ```bash
   npm i -g vercel
   vercel
   ```

### Environment Variables
For production deployment, set:
```env
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

## SEO Features

This project includes comprehensive SEO optimization:
- **Semantic HTML** with proper heading hierarchy
- **Meta tags** - Title, description, keywords, OpenGraph, Twitter Card
- **Structured Data** - JSON-LD schema for search engine understanding
- **Sitemap** - XML sitemap for search engine crawling
- **Robots.txt** - Search engine crawling instructions
- **Mobile Optimization** - Mobile-first responsive design
- **Performance** - Image optimization, compression, and caching

## Ads
The PWA can embed ad slots (e.g., Adsterra banner/native) once you have a public URL. Placeholders are included for testing.

## Optional: Expo Native App
The `native/` folder contains an Expo app that mirrors the PWA UX.
```bash
cd native
npm install
npx expo start
```

> Note: The Next.js build excludes `native/` to avoid TypeScript errors from Expo-only dependencies.
