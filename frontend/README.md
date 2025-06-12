
# Macroeconomic Indicator Dashboard - Frontend

This is a modern React frontend for the Macroeconomic Indicator Dashboard that provides a clean, mobile-friendly interface for monitoring economic indicators.

## Features

- **Responsive Design**: Works great on desktop and mobile devices
- **Interactive Heatmap**: Visual representation of indicator trends with color coding
- **Real-time Charts**: Interactive charts using Recharts library
- **Easy Management**: Add/remove indicators and adjust settings
- **Composite Index**: Create weighted combinations of indicators

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

The app will open in your browser at `http://localhost:3000`.

### Backend Communication

The React app communicates with the Python backend via API endpoints. Make sure the backend is running on port 8050 before starting the frontend.

## Available Scripts

- `npm start` - Starts the development server
- `npm run build` - Builds the app for production
- `npm test` - Runs the test suite
- `npm run eject` - Ejects from Create React App (not recommended)

## Project Structure

```
frontend/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── Dashboard.js
│   │   ├── HeatmapGrid.js
│   │   ├── Chart.js
│   │   ├── AddSeriesForm.js
│   │   ├── CompositeIndex.js
│   │   └── Navigation.js
│   ├── App.js
│   ├── index.js
│   └── index.css
└── package.json
```

## Components

- **Dashboard**: Main dashboard with heatmap and controls
- **HeatmapGrid**: Visual grid showing indicator trends over time
- **Chart**: Interactive line charts for detailed indicator views
- **AddSeriesForm**: Form to add new economic indicators
- **CompositeIndex**: Weighted composite indicator management
- **Navigation**: Top navigation between dashboard and composite views

## API Integration

The frontend communicates with these backend endpoints:

- `GET /api/indicators` - Fetch all indicators and their data
- `POST /api/add-series` - Add a new indicator
- `POST /api/refresh-all` - Refresh all indicator data
- `POST /api/update-months-back` - Update time range setting
- `POST /api/update-direction` - Update indicator direction
- `GET /api/composite` - Get composite index data
- `POST /api/save-weights` - Save composite weights
- `POST /api/reset-weights` - Reset weights to equal values

## Customization

The app uses a clean, modern design that can be easily customized by modifying the CSS in `index.css` or the inline styles in individual components.
