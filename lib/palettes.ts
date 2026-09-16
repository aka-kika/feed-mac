export const PALETTES = [
  {
    "id": "original",
    "name": "Original",
    "colors": [
      "#f6f8fa",
      "#ffffff",
      "#6d80a6"
    ]
  },
  {
    "id": "quiet-paper",
    "name": "Quiet Paper",
    "colors": [
      "#E4E8EB",
      "#262A2E",
      "#8C86C8"
    ]
  },
  {
    "id": "blue-gray",
    "name": "Blue Gray",
    "colors": [
      "#DCE3E8",
      "#2A3640",
      "#6F8798"
    ]
  },
  {
    "id": "sage-rust",
    "name": "Sage & Rust",
    "colors": [
      "#F0F3F4",
      "#27333B",
      "#D97D54"
    ]
  },
  {
    "id": "graphite-orange",
    "name": "Graphite Orange",
    "colors": [
      "#ECEEEF",
      "#2C2F35",
      "#FF6600"
    ]
  },
  {
    "id": "noir-yellow",
    "name": "Noir Yellow",
    "colors": [
      "#F7F6F2",
      "#27282D",
      "#F5C528"
    ]
  },
  {
    "id": "pale-lime",
    "name": "Pale Lime",
    "colors": [
      "#F4F6F3",
      "#2D2D36",
      "#BEEA4C"
    ]
  },
  {
    "id": "coral-navy",
    "name": "Coral & Navy",
    "colors": [
      "#EBEFF5",
      "#24284B",
      "#FF335F"
    ]
  }
] as const;
export type Palette = typeof PALETTES[number]["id"];
export const validPalette = (value: string | null): value is Palette => PALETTES.some(p => p.id === value);
