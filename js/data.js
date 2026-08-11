export async function loadTrips() {
  const res = await fetch("data/.generated/trips.json");
  return await res.json();
}

export async function loadPhotos() {
  try {
    const res = await fetch("data/.generated/photos.json");
    if (!res.ok) {
      console.warn(`loadPhotos: fetch failed with status ${res.status}`);
      return [];
    }
    const photos = (await res.json()).photos || [];
    photos.sort((a, b) => (a.t || "").localeCompare(b.t || ""));
    return photos;
  } catch (e) {
    console.warn("loadPhotos: failed to load or parse photos.json", e);
    return [];
  }
}