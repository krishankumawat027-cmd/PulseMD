function normalizeCoordinates({ latitude, longitude, accuracy = null } = {}) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const acc = accuracy === undefined || accuracy === null ? null : Number(accuracy);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: 'Valid latitude and longitude are required.' };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: 'Location coordinates are out of range.' };
  }

  return {
    location: {
      latitude: lat,
      longitude: lng,
      accuracy: Number.isFinite(acc) ? acc : null,
      mapsUrl: makeGoogleMapsLink(lat, lng)
    }
  };
}

function makeGoogleMapsLink(latitude, longitude) {
  return `https://maps.google.com/?q=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}`;
}

module.exports = { makeGoogleMapsLink, normalizeCoordinates };
