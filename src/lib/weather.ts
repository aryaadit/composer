import { WeatherInfo } from "@/types";

const NYC_LAT = 40.7128;
const NYC_LON = -74.006;

export async function fetchWeather(): Promise<WeatherInfo | null> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) {
    console.warn("[weather] OPENWEATHERMAP_API_KEY not set — weather gate disabled");
    return null;
  }

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${NYC_LAT}&lon=${NYC_LON}&appid=${apiKey}&units=imperial`,
      { next: { revalidate: 1800 } } // cache 30 min
    );

    if (!res.ok) {
      // Common cause: freshly-issued OWM keys take up to 2h to activate (401),
      // or the free tier hit a rate limit (429). Falling back to null is fine,
      // but the failure must be visible in server logs so it doesn't silently
      // disable the weather gate forever.
      console.warn(
        `[weather] OpenWeatherMap returned HTTP ${res.status} — weather gate disabled for this request`
      );
      return null;
    }

    const data = await res.json();
    const mainWeather = data.weather?.[0]?.main?.toLowerCase() ?? "";
    const description = data.weather?.[0]?.description ?? "unknown";
    const temp_f = Math.round(data.main?.temp ?? 0);

    let condition: WeatherInfo["condition"] = "clear";
    if (mainWeather.includes("rain") || mainWeather.includes("drizzle") || mainWeather.includes("thunderstorm")) {
      condition = "rain";
    } else if (mainWeather.includes("snow")) {
      condition = "snow";
    } else if (mainWeather.includes("cloud") || mainWeather.includes("mist") || mainWeather.includes("fog")) {
      condition = "cloudy";
    }

    const is_bad_weather = condition === "rain" || condition === "snow";

    return { temp_f, condition, description, is_bad_weather };
  } catch (error) {
    console.warn("[weather] OpenWeatherMap fetch failed — weather gate disabled for this request:", error);
    return null;
  }
}
