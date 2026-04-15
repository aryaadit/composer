export type CityStatus = "active" | "coming_soon";

export interface CityDef {
  id: string;
  name: string;
  tagline: string;
  status: CityStatus;
}

export const CITIES: CityDef[] = [
  { id: "nyc", name: "New York City", tagline: "The city that never sleeps.", status: "active" },
  { id: "sf", name: "San Francisco", tagline: "Hills, fog, and a great plate.", status: "coming_soon" },
  { id: "la", name: "Los Angeles", tagline: "Golden hour, every hour.", status: "coming_soon" },
  { id: "miami", name: "Miami", tagline: "Late nights, warm air.", status: "coming_soon" },
  { id: "austin", name: "Austin", tagline: "Small plates, loud rooms.", status: "coming_soon" },
  { id: "seattle", name: "Seattle", tagline: "Quiet bars, serious coffee.", status: "coming_soon" },
];

export const ACTIVE_CITY_ID = "nyc";
