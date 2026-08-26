/**
 * materials.js — the shared material palette of Magic City 1929.
 *
 * Every district builds from these named materials so lighting, tone mapping,
 * and palette stay coherent across the city. All are MeshStandardMaterial
 * (or MeshBasicMaterial for pure glow) tuned for warm 1929 limestone daylight
 * and emissive night life.
 *
 * Export: `materials` object with the named entries required by the contract:
 * limestone, brick, terracotta, bronze, steelDark, glassDay, glassNight,
 * marquee, furnaceGlow, asphalt, sidewalk, rail, foliage.
 */
import * as THREE from 'three';

const std = (opts) => new THREE.MeshStandardMaterial(opts);
const basic = (color) => new THREE.MeshBasicMaterial({ color });

export const materials = {
  /** Warm cream limestone — principal facade stone of the era. */
  limestone: std({ color: 0xd9c9a8, roughness: 0.85, metalness: 0.0 }),

  /** Deep red pressed brick for warehouse and secondary masses. */
  brick: std({ color: 0x8a4a32, roughness: 0.92, metalness: 0.02 }),

  /** Glazed polychrome terracotta ornament — deco greens, creams, golds. */
  terracotta: std({ color: 0xc8b48c, roughness: 0.55, metalness: 0.05 }),

  /** Patinated bronze — doors, trim, spandrels, elevator grilles. */
  bronze: std({ color: 0x6e5426, roughness: 0.35, metalness: 0.85 }),

  /** Near-black structural steel / ironwork. */
  steelDark: std({ color: 0x2a2d33, roughness: 0.5, metalness: 0.75 }),

  /** Daytime glass — reflective blue-grey, non-emissive. */
  glassDay: std({ color: 0x5b7080, roughness: 0.12, metalness: 0.65 }),

  /** Night glass — genuinely emissive warm glazing glow that carries the night
   * view; reads as lit offices and hotel rooms even against lifted midnight sky. */
  glassNight: std({ color: 0x1a1f26, roughness: 0.2, metalness: 0.4,
                    emissive: 0xffb45e, emissiveIntensity: 2.6 }),

  /** Marquee / sign face glow (basic [redacted] ignores lights, always lit). */
  marquee: basic(0xffe6b0),

  /** Furnace district bloom — molten orange glow on southern horizon. */
  furnaceGlow: basic(0xff5a1e),

  /** Street asphalt ribbon. */
  asphalt: std({ color: 0x2e3033, roughness: 0.95, metalness: 0.0 }),

  /** Sidewalk paving — lighter poured concrete with expansion joints feel. */
  sidewalk: std({ color: 0xa89f8c, roughness: 0.9, metalness: 0.0 }),

  /** Streetcar rail — polished steel catching the sun. */
  rail: std({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.9 }),

  /** Park foliage — muted 1929 park green. */
  foliage: std({ color: 0x3f5c34, roughness: 0.9, metalness: 0.0 }),
};
