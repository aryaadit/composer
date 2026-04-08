import { WeatherInfo } from "@/types";

const NYC_LAT = 40.7128;
const NYC_LON = -74.006;

export async function fetchWeather(): Promise<WeatherInfo | null> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${NYC_LAT}&lon=${NYC_LON}&appid=${apiKey}&units=imperial`,
      { next: { revalidate: 1800 } } // cache 30 min
    );

    if (!res.ok) return null;

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
  } catch {
    return null;
  }
}
