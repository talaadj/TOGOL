import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for live weather data
  app.get("/api/weather", async (req, res) => {
    const { lat, lon } = req.query;
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "OPENWEATHER_API_KEY is not configured" });
    }

    // Default to Bishkek if no coordinates
    const latitude = lat || "42.8746";
    const longitude = lon || "74.5698";

    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric&lang=ru`
      );
      
      if (response.status === 401) {
        return res.status(401).json({ 
          error: "API ключ OpenWeather не авторизован. Убедитесь, что вы добавили валидный OPENWEATHER_API_KEY в настройках и он активирован (активация нового ключа может занять до 2 часов)." 
        });
      }

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.statusText}`);
      }

      const data = await response.json();
      res.json({
        temp: data.main.temp,
        humidity: data.main.humidity,
        pressure: data.main.pressure,
        city: data.name,
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        windSpeed: data.wind?.speed,
        conditionId: data.weather[0].id
      });
    } catch (error) {
      console.error("Error fetching weather:", error);
      res.status(500).json({ error: "Failed to fetch live weather data" });
    }
  });

  // API Route for weather forecast
  app.get("/api/weather/forecast", async (req, res) => {
    const { lat, lon } = req.query;
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "OPENWEATHER_API_KEY is not configured" });
    }

    const latitude = lat || "42.8746";
    const longitude = lon || "74.5698";

    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric&lang=ru`
      );
      
      if (!response.ok) {
        throw new Error(`Weather Forecast API error: ${response.statusText}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Error fetching forecast:", error);
      res.status(500).json({ error: "Failed to fetch weather forecast data" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
