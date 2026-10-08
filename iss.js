const axios = require("axios");

const FIXED_LATITUDE = 47.032460;
const FIXED_LONGITUDE = 21.949742;

// Earth's mean radius in kilometers.
const EARTH_RADIUS_KM = 6371;

async function getISSPosition() {
  const response = await axios.get(
    "https://api.wheretheiss.at/v1/satellites/25544",
    {
      timeout: 10000,
    }
  );

  const data = response.data;

  if (
    typeof data.latitude !== "number" ||
    typeof data.longitude !== "number" ||
    typeof data.altitude !== "number"
  ) {
    throw new Error("ISS API returned an invalid position.");
  }

  return {
    latitude: data.latitude,
    longitude: data.longitude,
    altitude: data.altitude,
    timestamp: data.timestamp,
  };
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function coordinatesToCartesian(latitude, longitude, altitude) {
  const lat = degreesToRadians(latitude);
  const lon = degreesToRadians(longitude);

  const radius = EARTH_RADIUS_KM + altitude;

  return {
    x: radius * Math.cos(lat) * Math.cos(lon),
    y: radius * Math.cos(lat) * Math.sin(lon),
    z: radius * Math.sin(lat),
  };
}

function calculate3DDistance(issPosition) {
  const fixedPoint = coordinatesToCartesian(
    FIXED_LATITUDE,
    FIXED_LONGITUDE,
    0
  );

  const issPoint = coordinatesToCartesian(
    issPosition.latitude,
    issPosition.longitude,
    issPosition.altitude
  );

  const dx = issPoint.x - fixedPoint.x;
  const dy = issPoint.y - fixedPoint.y;
  const dz = issPoint.z - fixedPoint.z;

  return Math.sqrt(
    dx * dx +
    dy * dy +
    dz * dz
  );
}

function formatDistance(distanceKm) {
  const rounded = Math.round(distanceKm);

  const digits = {
  "0": "𝟎",
  "1": "𝟏",
  "2": "𝟐",
  "3": "𝟑",
  "4": "𝟒",
  "5": "𝟓",
  "6": "𝟔",
  "7": "𝟕",
  "8": "𝟖",
  "9": "𝟗",
};

  return rounded
    .toLocaleString("en-US")
    .split("")
    .map((character) => digits[character] ?? character)
    .join("");
}

async function getISSDistance() {
  const position = await getISSPosition();
  const distanceKm = calculate3DDistance(position);

  return {
    ...position,
    distanceKm,
    formattedDistance: formatDistance(distanceKm),
  };
}

module.exports = {
  getISSPosition,
  calculate3DDistance,
  formatDistance,
  getISSDistance,
};