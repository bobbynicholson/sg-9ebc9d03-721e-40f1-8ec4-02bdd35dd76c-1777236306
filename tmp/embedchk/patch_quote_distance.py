p = 'src/pages/admin/quotes/new.tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)


# Remember whether the reopened quote actually carried a saved distance.
rep('''    if (typeof q.delivery_distance_km === "number") setDeliveryDistance(q.delivery_distance_km);''',
'''    if (typeof q.delivery_distance_km === "number") setDeliveryDistance(q.delivery_distance_km);
    // Website-lead drafts (source "embed") arrive with venue coordinates
    // but no distance yet; the first distance run must fill it in.
    savedDistanceRef.current = Number(q.delivery_distance_km) > 0 || Number(q.collection_distance_km) > 0;''')

rep('''  const havInitRef = useRef(false);
  useEffect(() => {''', '''  const havInitRef = useRef(false);
  // True when the reopened quote already had a distance saved. Only then
  // is the first computed distance held back (to avoid silent repricing).
  const savedDistanceRef = useRef(false);
  useEffect(() => {''')

rep('''        // First run after mount. For a NEW quote set the computed
        // distance; for an EDITED quote keep the saved distance so
        // reopening doesn't silently reprice (Pic 64).
        havInitRef.current = true;
        if (!fromQuoteId) {''', '''        // First run after mount. For a NEW quote set the computed
        // distance; for an EDITED quote keep the saved distance so
        // reopening doesn't silently reprice (Pic 64). A quote with no
        // saved distance (e.g. a draft from a website lead) gets the
        // computed one, otherwise its delivery fee stays empty.
        havInitRef.current = true;
        if (!fromQuoteId || !savedDistanceRef.current) {''')

# Straight-line fallback when Google can't give a road distance.
rep('''    if (kitchenOrigin && venueDestination) {
      googleMapsService.calculateDistance(kitchenOrigin, venueDestination)
        .then((result) => {
          if (cancelled) return;
          if (!result) {
            setDistanceStatus("error");
            return;
          }''', '''    // Fallback when the road-distance lookup fails or the Maps key isn't
    // set: straight-line distance between known coordinates, scaled by a
    // typical road factor (1.3) so the fee isn't systematically low.
    const fallbackToStraightLine = () => {
      if (cancelled) return;
      const kLat = Number(selectedKitchen.lat);
      const kLng = Number(selectedKitchen.lng);
      if (typeof venueLat === "number" && typeof venueLng === "number" && Number.isFinite(kLat) && Number.isFinite(kLng)) {
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(venueLat - kLat);
        const dLng = toRad(venueLng - kLng);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(kLat)) * Math.cos(toRad(venueLat)) * Math.sin(dLng / 2) ** 2;
        const straightKm = 2 * 6371 * Math.asin(Math.sqrt(h));
        applyDistance(Number((straightKm * 1.3).toFixed(2)));
      } else {
        setDistanceStatus("error");
      }
    };

    if (kitchenOrigin && venueDestination) {
      googleMapsService.calculateDistance(kitchenOrigin, venueDestination)
        .then((result) => {
          if (cancelled) return;
          if (!result) {
            fallbackToStraightLine();
            return;
          }''')

rep('''        .catch(() => {
          // Google Maps unavailable or API key not set — fall back to haversine.
          if (!cancelled) setDistanceStatus("error");
        });''', '''        .catch(() => {
          // Google Maps unavailable or API key not set: fall back to haversine.
          fallbackToStraightLine();
        });''')

open(p, 'w', encoding='utf-8').write(s)
print('ok')
