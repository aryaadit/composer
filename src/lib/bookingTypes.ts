// Normalized booking availability shape shared by the Resy and OpenTable
// server clients and consumed by the BookingSlots UI component.

export interface BookingSlot {
  time: string; // HH:MM
  configId: string;
  token: string;
  bookingUrl: string;
}

export interface BookingSlotGroup {
  serviceType: string;
  slots: BookingSlot[];
}

export interface BookingAvailability {
  platform: "resy" | "opentable";
  venueId: string;
  venueName: string;
  date: string;
  partySize: number;
  groups: BookingSlotGroup[];
  fallbackUrl: string;
  fetchedAt: string;
}
