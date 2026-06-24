/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

export interface RouteOptimizationRequest {
  origin: string;
  destination: string;
  waypoints?: string[];
}

export interface RouteOptimizationResult {
  optimizedRoute: string[];
  totalDistance: number;
  totalDuration: number;
  legs: Array<{
    distance: number;
    duration: number;
    startAddress: string;
    endAddress: string;
  }>;
}

export interface AddressAutocompleteResult {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export const googleMapsService = {
  async initializeGoogleMaps(): Promise<void> {
    if (typeof window === "undefined") return;

    if ((window as any).google) {
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("Google Maps API key not configured");
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    
    return new Promise((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });
  },

  async optimizeRoute(request: RouteOptimizationRequest): Promise<RouteOptimizationResult> {
    try {
      await this.initializeGoogleMaps();

      if (!(window as any).google) {
        throw new Error("Google Maps not initialized");
      }

      const directionsService = new (window as any).google.maps.DirectionsService();

      const waypoints = (request.waypoints || []).map(location => ({
        location,
        stopover: true
      }));

      const result = await new Promise<any>((resolve, reject) => {
        directionsService.route(
          {
            origin: request.origin,
            destination: request.destination,
            waypoints,
            optimizeWaypoints: true,
            travelMode: (window as any).google.maps.TravelMode.DRIVING
          },
          (result: any, status: any) => {
            if (status === "OK") {
              resolve(result);
            } else {
              reject(new Error(`Route optimization failed: ${status}`));
            }
          }
        );
      });

      const route = result.routes[0];
      const waypointOrder = result.routes[0].waypoint_order;

      const optimizedRoute = [
        request.origin,
        ...waypointOrder.map((index: number) => request.waypoints![index]),
        request.destination
      ];

      let totalDistance = 0;
      let totalDuration = 0;

      const legs = route.legs.map((leg: any) => {
        totalDistance += leg.distance.value;
        totalDuration += leg.duration.value;

        return {
          distance: leg.distance.value,
          duration: leg.duration.value,
          startAddress: leg.start_address,
          endAddress: leg.end_address
        };
      });

      return {
        optimizedRoute,
        totalDistance,
        totalDuration,
        legs
      };
    } catch (error) {
      console.error("Error optimizing route:", error);
      throw error;
    }
  },

  async searchAddresses(input: string): Promise<AddressAutocompleteResult[]> {
    try {
      await this.initializeGoogleMaps();

      if (!(window as any).google) {
        throw new Error("Google Maps not initialized");
      }

      const autocompleteService = new (window as any).google.maps.places.AutocompleteService();

      const results = await new Promise<any[]>((resolve, reject) => {
        autocompleteService.getPlacePredictions(
          {
            input,
            componentRestrictions: { country: "za" }
          },
          (predictions: any, status: any) => {
            if (status === "OK" && predictions) {
              resolve(predictions);
            } else if (status === "ZERO_RESULTS") {
              resolve([]);
            } else {
              reject(new Error(`Address search failed: ${status}`));
            }
          }
        );
      });

      return results.map(prediction => ({
        placeId: prediction.place_id,
        description: prediction.description,
        mainText: prediction.structured_formatting.main_text,
        secondaryText: prediction.structured_formatting.secondary_text
      }));
    } catch (error) {
      console.error("Error searching addresses:", error);
      return [];
    }
  },

  async getPlaceDetails(placeId: string): Promise<{
    address: string;
    coordinates: { lat: number; lng: number };
    addressComponents: any[];
  } | null> {
    try {
      await this.initializeGoogleMaps();

      if (!(window as any).google) {
        throw new Error("Google Maps not initialized");
      }

      const placesService = new (window as any).google.maps.places.PlacesService(
        document.createElement("div")
      );

      const result = await new Promise<any>((resolve, reject) => {
        placesService.getDetails(
          { placeId },
          (place: any, status: any) => {
            if (status === "OK" && place) {
              resolve(place);
            } else {
              reject(new Error(`Place details failed: ${status}`));
            }
          }
        );
      });

      return {
        address: result.formatted_address,
        coordinates: {
          lat: result.geometry.location.lat(),
          lng: result.geometry.location.lng()
        },
        addressComponents: result.address_components || []
      };
    } catch (error) {
      console.error("Error getting place details:", error);
      return null;
    }
  },

  /**
   * Geocode a free-text address into lat/lng. Used when an address was
   * typed by hand (or loaded from a saved client/lead that never stored
   * coordinates) so the quote builder can still auto-fill the delivery +
   * collection distance. Returns null when the Maps key isn't configured
   * or the address can't be resolved - the caller keeps the field empty
   * and the operator types the distance manually.
   */
  async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
      await this.initializeGoogleMaps();
      if (!(window as any).google) return null;

      const geocoder = new (window as any).google.maps.Geocoder();
      const result = await new Promise<any>((resolve, reject) => {
        geocoder.geocode(
          { address, componentRestrictions: { country: "za" } },
          (results: any, status: any) => {
            if (status === "OK" && results && results[0]) resolve(results[0]);
            else reject(new Error(`Geocode failed: ${status}`));
          }
        );
      });

      return {
        lat: result.geometry.location.lat(),
        lng: result.geometry.location.lng(),
      };
    } catch (error) {
      console.warn("Error geocoding address:", error);
      return null;
    }
  },

  async calculateDistance(origin: string, destination: string): Promise<{
    distance: number;
    duration: number;
  }> {
    try {
      await this.initializeGoogleMaps();

      if (!(window as any).google) {
        throw new Error("Google Maps not initialized");
      }

      const distanceMatrixService = new (window as any).google.maps.DistanceMatrixService();

      const result = await new Promise<any>((resolve, reject) => {
        distanceMatrixService.getDistanceMatrix(
          {
            origins: [origin],
            destinations: [destination],
            travelMode: (window as any).google.maps.TravelMode.DRIVING
          },
          (result: any, status: any) => {
            if (status === "OK") {
              resolve(result);
            } else {
              reject(new Error(`Distance calculation failed: ${status}`));
            }
          }
        );
      });

      const element = result.rows[0].elements[0];

      if (element.status !== "OK") {
        throw new Error("Unable to calculate distance");
      }

      return {
        distance: element.distance.value,
        duration: element.duration.value
      };
    } catch (error) {
      console.error("Error calculating distance:", error);
      throw error;
    }
  },

  async calculateDeliveryFee(
    kitchenAddress: string,
    venueAddress: string,
    ratePerKm: number
  ): Promise<number> {
    try {
      const { distance } = await this.calculateDistance(kitchenAddress, venueAddress);
      const kilometers = distance / 1000;
      const deliveryFee = kilometers * ratePerKm;
      
      return Math.round(deliveryFee * 100) / 100;
    } catch (error) {
      console.error("Error calculating delivery fee:", error);
      return 0;
    }
  }
};