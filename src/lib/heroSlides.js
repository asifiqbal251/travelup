// Landing hero slideshow slides. Image URLs are copied from the live
// Destination image_url field (and the existing HERO_IMAGE_URL) so the landing
// page never queries Destination entities at runtime. All four URLs were
// verified HTTP 200 (image/png) on 2026-08-26.
//
// Reused destination image records:
//   - Amsterdam (Netherlands)            — European city
//   - Beijing (China)                     — East Asian culture & city
//   - Canadian Rockies (Canada)           — lake / mountain / nature
import { HERO_IMAGE_URL } from "@/lib/heroImage";

export const HERO_SLIDES = [
  { id: "coastline", label: "Coastline at golden hour", url: HERO_IMAGE_URL },
  {
    id: "amsterdam",
    label: "Canals of Amsterdam",
    url: "https://media.base44.com/images/public/6a7ce8f29cef18f569162dc7/dd0e2797e_generated_image.png"
  },
  {
    id: "beijing",
    label: "Beijing's historic rooftops",
    url: "https://media.base44.com/images/public/6a7ce8f29cef18f569162dc7/dae53d345_generated_image.png"
  },
  {
    id: "rockies",
    label: "Canadian Rockies lake and peaks",
    url: "https://media.base44.com/images/public/6a7ce8f29cef18f569162dc7/444ac61c4_generated_image.png"
  }
];