#  Donut Central

A modern stats tracking platform for **DonutSMP** players.

🔗 **Live Site:** [donut-central.vercel.app](https://donutcentral.vercel.app/)

![Donut Central](https://img.shields.io/badge/Donut-Central-blue?style=for-the-badge)
![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)

## ✨ Features

- 📊 **Player Statistics** - View detailed stats for any player
- 🏆 **Leaderboards** - Money, kills, deaths, playtime, shards & more
- 🛒 **Auction House** - Browse current listings with search & sort
- 💰 **Price Guide** - Average prices for all items
- 🌐 **Server Status** - Real-time player count
- 🌙 **Dark/Light Mode** - Toggle between themes
- 🔄 **Auto-Refresh** - Live auction updates

## 🚀 Deploy Your Own

### Prerequisites
- A [Vercel](https://vercel.com) account
- A DonutSMP API key (get one in-game with `/api`)

### Setup Instructions

1. **Fork this repository**
   - Click the "Fork" button at the top right of this page

2. **Import to Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Select "Import Git Repository"
   - Choose your forked repository

3. **Add Environment Variable**
   - In Vercel, go to your project **Settings** → **Environment Variables**
   - Add a new variable:
     - **Key:** `DONUT_API_KEY`
     - **Value:** Your DonutSMP API key
   - Select **All Environments** (Production, Preview, Development)
   - Click **Save**

4. **Deploy**
   - Go to **Deployments** tab
   - Click the three dots on the latest deployment → **Redeploy**
   - Your site is now live! 🎉

## 📁 Project Structure

```
├── api/                  # Vercel serverless functions
│   ├── config.js         # API configuration & helpers
│   ├── stats.js          # Player stats endpoint
│   ├── leaderboard.js    # Leaderboards endpoint
│   ├── auction.js        # Auction house endpoint
│   ├── prices.js         # Price guide endpoint
│   └── ...
├── public/               # Static files
│   ├── index.html        # Homepage
│   ├── stats.html        # Player stats page
│   ├── leaderboards.html # Leaderboards page
│   ├── auction.html      # Auction house page
│   ├── prices.html       # Price guide page
│   └── assets/           # CSS, JS, images
└── vercel.json           # Vercel configuration
```

## 🔒 Security

- API keys are stored as environment variables, never in code
- All API requests are proxied through serverless functions
- Your DonutSMP API key is never exposed to the client

## 💬 Support

Discord: **its_joeal**

---

Made with ❤️ for DonutSMP
