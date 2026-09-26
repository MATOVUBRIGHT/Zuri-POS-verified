# Zuri POS Desktop App - Technical Architecture

## 🚀 Overview
Zuri POS Desktop App is a standalone, offline-first desktop application built with React, Electron, and SQLite. It provides a secure, high-performance point-of-sale experience with no dependency on cloud services.

## 🏗️ Architecture
- **Main Process**: Handles window management, SQLite database operations, and hardware (USB printer) communication.
- **Preload Script**: A secure bridge using `contextBridge` to expose only safe APIs to the renderer process.
- **Renderer Process**: The React frontend, refactored to communicate with the local backend via IPC (Inter-Process Communication).
- **Database**: Local SQLite database (`better-sqlite3`) for persistent offline storage of products, sales, and inventory.
- **Printing**: Direct USB printing support for labels and barcodes using raw commands (ZPL/ESC/POS).

## 🔐 Security Features
- **Zero Cloud Secrets**: No Supabase or Firebase keys are bundled in the frontend.
- **Context Isolation**: Renderer process is isolated from Node.js APIs.
- **IPC Validation**: All database and hardware calls are validated in the main process.
- **Data Privacy**: All business data remains strictly on the local machine.

## 📦 Build & Distribution
- **Build System**: `electron-vite` for optimized bundling.
- **Packaging**: `electron-builder` generates Windows `.exe` installers and portable versions.
- **Bundle**: `npm run bundle` creates a final ZIP package for end-users containing:
  - Windows Installer (`.exe`)
  - Portable App
  - Installation Instructions (`README.txt`)

## 🛠️ Setup Instructions
1. Navigate to the `Zuri POS Desktop App` folder.
2. Install dependencies: `npm install`
3. Run in development: `npm run dev`
4. Build for production: `npm run package`
5. Generate end-user bundle: `npm run bundle`
