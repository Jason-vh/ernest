import maplibregl from "maplibre-gl";
import { OFFICES } from "@/geo/constants";

function createOfficeDot(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.pointerEvents = "none";
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#222" stroke="#fff" stroke-width="1"/></svg>`;
  return el;
}

export function createLabel(name: string, color: string, opacity: number): HTMLDivElement {
  const el = document.createElement("div");
  el.style.pointerEvents = "none";
  el.style.opacity = String(opacity);
  const span = document.createElement("span");
  span.style.cssText =
    "font-family:'Architects Daughter',cursive;font-size:13px;white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 6px #fff";
  span.style.color = color;
  span.textContent = name;
  el.appendChild(span);
  return el;
}

export function useOfficeMarkers(map: maplibregl.Map) {
  const officeLabels: maplibregl.Marker[] = [];

  for (const office of Object.values(OFFICES)) {
    new maplibregl.Marker({ element: createOfficeDot() })
      .setLngLat([office.lon, office.lat])
      .addTo(map);

    const label = new maplibregl.Marker({
      element: createLabel(office.name, "#222", 1),
      anchor: "top",
      offset: [0, 4],
    })
      .setLngLat([office.lon, office.lat])
      .addTo(map);

    officeLabels.push(label);
  }

  return { officeLabels };
}
