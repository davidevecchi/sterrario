export async function loadTrips() {
  const res = await fetch("data/.generated/trips.json");
  return (await res.json()).trips;
}

export async function loadPhotos() {
  try {
    const res = await fetch("data/.generated/photos.json");
    if (!res.ok) return [];
    const photos = (await res.json()).photos || [];
    photos.sort((a, b) => (a.t || "").localeCompare(b.t || ""));
    return photos;
  } catch (e) {
    return [];
  }
}