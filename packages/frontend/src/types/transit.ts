export enum StopType {
  Tram = "tram",
  Metro = "metro",
  Train = "train",
  Ferry = "ferry",
}

export interface TransitStop {
  id: number;
  name: string;
  lat: number;
  lon: number;
  type: StopType;
}
