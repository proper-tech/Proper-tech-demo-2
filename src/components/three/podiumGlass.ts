import { Color, MeshStandardMaterial } from 'three';

/**
 * Glass for the podium (block A) that shows lit rooms behind it, without any extra geometry:
 * "interior mapping". For each pixel of the glass the view ray is carried on into a virtual room
 * behind the pane (box: floor and ceiling at the podium's storey levels, side walls every few
 * metres, a back wall some metres in), and the wall it hits is shaded procedurally: shops with
 * shelves, a cafe, a boutique and a lobby on the ground floor; offices with ceiling light strips and
 * blinds upstairs. The glass itself is a dark, glossy dielectric whose sky reflection is stronger
 * at grazing angles (Fresnel), so the rooms show best when looked at straight on, as with real glass.
 *
 * Works in the mesh's object space, where the podium's facades are aligned to the x and z axes.
 */

export type InteriorKind = 'shop' | 'office';

const VERT_HEAD = /* glsl */ `
varying vec3 vIPos;
varying vec3 vICam;
varying vec3 vINrm;
`;

const VERT_BODY = /* glsl */ `
vIPos = transformed;
vINrm = objectNormal;
vICam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vIPos;
varying vec3 vICam;
varying vec3 vINrm;
uniform float uShop;
uniform float uGlow;
uniform float uReflBoost;
uniform vec3 uTint;
uniform float uCut;
uniform vec3 uAboveColor;
uniform float uAboveRough;

float ih(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float ih2(vec2 p) { return fract(sin(dot(p, vec2(41.31, 289.17))) * 15731.743); }

// distance-to-edge softening, used for corner shading
float edgeAo(float a, float b, float w, float h) {
  float e = min(min(a, w - a), min(b, h - b));
  return mix(0.55, 1.0, smoothstep(0.0, 0.7, e));
}

vec3 shopProducts(float hu, float hy, float rid) {
  // shelves 0.2 – 2.3 m, a board every 0.42 m, goods in coloured blocks between them
  if (hy < 0.2 || hy > 2.3) return vec3(-1.0);
  float r = (hy - 0.2) / 0.42;
  float row = floor(r);
  float fr = fract(r);
  if (fr < 0.07) return vec3(0.82, 0.81, 0.78);
  float cell = floor(hu / 0.24);
  float k = ih2(vec2(cell, row + rid * 17.0));
  float top = 0.25 + 0.6 * ih2(vec2(row, cell * 3.1 + rid));
  if (fr > 0.07 + top || fract(hu / 0.24) < 0.08) return vec3(0.18, 0.17, 0.16);
  vec3 a = vec3(0.85, 0.25, 0.18), b = vec3(0.95, 0.75, 0.25), c = vec3(0.2, 0.45, 0.75), d = vec3(0.9, 0.9, 0.86);
  return k < 0.25 ? a : k < 0.5 ? b : k < 0.75 ? c : d;
}

vec3 interiorColor(vec3 P, vec3 d, vec3 N) {
  // storeys of the podium: ground 0 – 4.1, second 4.7 – 7.7, third 8.3 – 11.3 (slabs between)
  float y = P.y;
  float lv0, lv1, fi;
  if (y < 4.1) { lv0 = 0.0; lv1 = 4.1; fi = 0.0; }
  else if (y < 4.7) { return vec3(0.03); }
  else if (y < 7.7) { lv0 = 4.7; lv1 = 7.7; fi = 1.0; }
  else if (y < 8.3) { return vec3(0.03); }
  else { lv0 = 8.3; lv1 = 11.3; fi = 2.0; }
  float h = lv1 - lv0;
  bool shop = fi < 0.5; // the ground floor is shops whichever glass it is seen through

  bool alongX = abs(N.x) > abs(N.z);
  float s = alongX ? -sign(N.x) : -sign(N.z);
  float dw = max(s * (alongX ? d.x : d.z), 1e-4);
  float u = alongX ? P.z : P.x;
  float du = alongX ? d.z : d.x;

  float W = shop ? 6.5 : 4.2;
  float D = shop ? 9.0 : 5.5;
  float cu = floor(u / W);
  float u0 = cu * W;
  float tS = abs(du) < 1e-5 ? 1e5 : ((du > 0.0 ? u0 + W : u0) - u) / du;
  float tV = abs(d.y) < 1e-5 ? 1e5 : ((d.y > 0.0 ? lv1 : lv0) - y) / d.y;
  float tB = D / dw;
  float t = min(tB, min(tS, tV));
  vec3 H = P + d * t;
  float hu = clamp((alongX ? H.z : H.x) - u0, 0.0, W);
  float hy = clamp(H.y - lv0, 0.0, h);
  float hw = clamp(t * dw, 0.0, D);
  float rid = ih(vec3(cu, fi, s + (alongX ? 3.0 : 0.0)));

  vec3 light = shop ? vec3(1.0, 0.9, 0.76) : vec3(0.95, 0.97, 1.0);
  float lit = shop ? 1.0 : (rid < 0.22 ? 0.35 : 0.85);
  vec3 col;
  float ao;

  // room type
  float type = shop ? floor(ih(vec3(cu * 1.7, s, 4.0)) * 4.0) : 4.0;
  vec3 wall = type < 0.5 ? vec3(0.86, 0.85, 0.82)    // shop
            : type < 1.5 ? vec3(0.42, 0.26, 0.14)    // cafe, wood
            : type < 2.5 ? vec3(0.16, 0.16, 0.17)    // boutique, dark
            : type < 3.5 ? vec3(0.72, 0.67, 0.60)    // lobby, stone
            : mix(vec3(0.84), vec3(0.72, 0.74, 0.76), step(0.6, rid)); // office

  if (t == tV) {
    if (d.y > 0.0) {
      // ceiling with its lights
      col = vec3(0.78);
      if (shop) {
        vec2 g = fract(vec2(hu, hw) / 1.6) - 0.5;
        col += vec3(5.0) * smoothstep(0.11, 0.07, length(g));
      } else {
        float strip = smoothstep(0.09, 0.05, abs(fract(hw / 1.8) - 0.5)) * step(0.2, fract(hu / 1.4));
        col += vec3(3.5) * strip * step(0.22, rid);
      }
    } else {
      // floor: polished stone in shops, carpet in offices; furniture blocks as dark patches
      col = shop ? vec3(0.62, 0.58, 0.53) : vec3(0.3, 0.31, 0.33);
      if (shop) col *= 0.9 + 0.1 * step(0.5, fract(floor(hu / 0.8) * 0.5 + floor(hw / 0.8) * 0.5));
      vec2 desk = abs(fract(vec2(hu / 2.1, hw / 2.4)) - 0.5);
      if (!shop && desk.x < 0.25 && desk.y < 0.18) col = vec3(0.55, 0.5, 0.44);
    }
    ao = edgeAo(hu, hw, W, D);
  } else {
    bool back = t == tB;
    float a = back ? hu : hw;
    float aw = back ? W : D;
    col = wall;
    if (type < 0.5) {
      vec3 p = shopProducts(a, hy, rid + (back ? 0.0 : 3.0));
      if (p.x >= 0.0) col = p;
    } else if (type < 1.5) {
      if (hy < 1.05) col = vec3(0.08, 0.08, 0.09);                              // counter
      if (back && hy > 2.0 && hy < 2.8 && abs(a - aw * 0.5) < 1.4) {            // menu board
        col = vec3(0.05);
        if (fract((hy - 2.0) / 0.12) < 0.35 && fract(a * 3.0) < 0.7) col = vec3(1.4, 1.3, 1.1);
      }
    } else if (type < 2.5) {
      if (hy > 0.85 && hy < 1.95) {                                             // clothes on rails
        float c = ih2(vec2(floor(a / 0.11), rid));
        col = mix(vec3(0.75, 0.68, 0.6), vec3(0.25, 0.3, 0.42), c) * (0.7 + 0.3 * c);
        if (fract(a / 0.11) < 0.12) col *= 0.4;
      }
      float spot = exp(-pow((fract(a / 1.6) - 0.5) * 3.2, 2.0)) * smoothstep(3.5, 1.0, hy);
      col *= 0.7 + 1.6 * spot;
    } else if (type < 3.5) {
      if (back && hy > 1.7 && hy < 2.5 && abs(a - aw * 0.5) < 1.3) col = vec3(1.6, 1.25, 0.8); // lit sign
      if (hy < 0.12) col = vec3(0.1);
    } else {
      // office: a glazed partition here and there, a skirting line
      if (!back && fract(hw / 2.75) < 0.03) col = vec3(0.3);
      if (hy < 0.08) col = vec3(0.2);
    }
    ao = edgeAo(a, hy, aw, h);
  }

  col *= light * lit * ao * mix(1.0, 0.75, hw / D);
  return col;
}
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
bool iAbove = vIPos.y > uCut;
if (iAbove) diffuseColor.rgb = uAboveColor;
`;

const FRAG_ROUGH = /* glsl */ `
#include <roughnessmap_fragment>
if (iAbove) roughnessFactor = uAboveRough;
`;

const FRAG_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
if (!iAbove) {
  vec3 iRay = vIPos - vICam;
  vec3 iN = normalize(vINrm);
  if (dot(iN, iRay) > 0.0) iN = -iN;
  vec3 iCol = interiorColor(vIPos, iRay, iN);
  // blinds in the offices' windows: pulled down to a different height in each room
  if (uShop < 0.5 && vIPos.y > 4.4) {
    float top = vIPos.y < 7.7 ? 7.3 : 10.9;
    bool alongX = abs(iN.x) > abs(iN.z);
    float u = alongX ? vIPos.z : vIPos.x;
    float drop = 0.15 + 1.4 * ih(vec3(floor(u / 1.4), floor(vIPos.y / 3.6), 7.0));
    if (vIPos.y > top - drop) iCol = mix(vec3(0.5, 0.49, 0.46), vec3(0.3, 0.29, 0.27), step(0.8, fract(vIPos.y / 0.05)));
  }
  float cosT = abs(dot(normalize(-iRay), iN));
  float fres = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
  totalEmissiveRadiance += iCol * uTint * uGlow * (1.0 - fres);
}
`;

const FRAG_REFL = /* glsl */ `
if (!iAbove) reflectedLight.indirectSpecular *= uReflBoost;
#include <aomap_fragment>
`;

/** `above`: for a tower's glass, which also runs down through the podium storeys: above the
 *  podium (y > cut) it keeps the tower glass's own colour and roughness, without rooms. */
export function interiorGlass(kind: InteriorKind, above?: { cut: number; color: Color; roughness: number }) {
  const m = new MeshStandardMaterial({ color: new Color('#05080C'), roughness: 0.04, metalness: 0 });
  m.name = `Glass ${kind} (interior)`;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uShop = { value: kind === 'shop' ? 1 : 0 };
    shader.uniforms.uGlow = { value: kind === 'shop' ? 0.75 : 0.7 };
    shader.uniforms.uReflBoost = { value: 2.2 };
    shader.uniforms.uTint = { value: new Color(0.82, 0.9, 0.92) };
    shader.uniforms.uCut = { value: above?.cut ?? 1e6 };
    shader.uniforms.uAboveColor = { value: above?.color ?? new Color() };
    shader.uniforms.uAboveRough = { value: above?.roughness ?? 0.1 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', FRAG_ROUGH)
      .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE)
      .replace('#include <aomap_fragment>', FRAG_REFL);
  };
  m.customProgramCacheKey = () => `interior-glass-${kind}${above ? '-tower' : ''}`;
  return m;
}
