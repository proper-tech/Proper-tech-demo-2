import { Color, MeshStandardMaterial, Vector2 } from 'three';

/**
 * Glass that shows lit rooms behind it, without any extra geometry:
 * "interior mapping". For each pixel of the glass the view ray is carried on into a virtual room
 * behind the pane (box: floor and ceiling at the podium's storey levels, side walls every few
 * metres, a back wall some metres in), and the wall it hits is shaded procedurally: shops with
 * shelves, a cafe, a boutique and a lobby on the ground floor; offices with ceiling light strips and
 * blinds upstairs; in the towers (blocks B and C) homes: living rooms with a sofa and a picture,
 * bedrooms, kitchens, parquet floors, ceiling lights, and curtains drawn to a different width in
 * each room. The glass itself is a dark, glossy dielectric whose sky reflection is stronger
 * at grazing angles (Fresnel), so the rooms show best when looked at straight on, as with real glass.
 *
 * Works in the mesh's object space, where the facades are aligned to the x and z axes (the towers'
 * rounded corners take the nearer axis).
 */

export type InteriorKind = 'shop' | 'office' | 'home';

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
uniform float uHome;
uniform float uNight;
uniform float uTime;
uniform vec2 uFocus;
uniform vec3 uFarColor;
uniform vec3 uFar;

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


// ---- homes in the towers: storeys of 3.0 m from the podium roof (11.7), ceiling 2.75 m up ----
// Lit by a ceiling lamp (and a floor lamp in living rooms) with a pool of light and darker
// corners, each room in its own colour of light; a TV flickers in some living rooms at night.
vec3 homeColor(vec3 P, vec3 d, vec3 N, out float rid, out float cuOut, out float wOut, out vec3 glow) {
  float fi = floor((P.y - 11.7) / 3.0);
  float lv0 = 11.7 + fi * 3.0;
  float h = 2.75;
  float lv1 = lv0 + h;
  bool alongX = abs(N.x) > abs(N.z);
  float s = alongX ? -sign(N.x) : -sign(N.z);
  float u = alongX ? P.z : P.x;
  float W = 3.9;
  float cu = floor(u / W);
  rid = ih(vec3(cu, fi, s + (alongX ? 3.0 : 0.0)));
  cuOut = cu; wOut = W;

  // room: 0 living, 1 bedroom, 2 kitchen; palette, light
  float type = floor(ih(vec3(cu * 2.3, fi * 1.7, s)) * 3.0);
  float r2 = ih(vec3(rid * 9.1, 2.0, 5.0));
  float r3 = ih(vec3(rid * 4.3, 7.0, 1.0));
  vec3 lightCol = r3 < 0.45 ? vec3(1.0, 0.72, 0.45) : r3 < 0.8 ? vec3(1.0, 0.82, 0.6) : vec3(1.0, 0.93, 0.84);
  // how bright: some rooms dark, a few only dimly lit (lamp or TV), most with the lights on
  float on = rid < mix(0.24, 0.36, uNight) ? 0.0 : rid < 0.42 ? 0.35 : 1.0;
  bool focus = P.y > uFocus.x && P.y < uFocus.y;   // the floor the view is flying into: all lit, curtains open
  if (focus) on = 1.0;
  float lit = mix(mix(0.2, 0.03, uNight), 1.0, on);
  glow = lightCol * lit;
  if (P.y > lv1) return vec3(0.03);

  float dw = max(s * (alongX ? d.x : d.z), 1e-4);
  float du = alongX ? d.z : d.x;
  float D = 4.8;
  float u0 = cu * W;
  float tS = abs(du) < 1e-5 ? 1e5 : ((du > 0.0 ? u0 + W : u0) - u) / du;
  float tV = abs(d.y) < 1e-5 ? 1e5 : ((d.y > 0.0 ? lv1 : lv0) - P.y) / d.y;
  float tB = D / dw;
  float t = min(tB, min(tS, tV));
  vec3 H = P + d * t;
  float hu = clamp((alongX ? H.z : H.x) - u0, 0.0, W);
  float hy = clamp(H.y - lv0, 0.0, h);
  float hw = clamp(t * dw, 0.0, D);
  vec3 Q = vec3(hu, hy, hw);

  vec3 wall = r2 < 0.35 ? vec3(0.86, 0.83, 0.77) : r2 < 0.6 ? vec3(0.74, 0.7, 0.64) : r2 < 0.8 ? vec3(0.78, 0.79, 0.8) : vec3(0.58, 0.62, 0.55);
  vec3 wood = r2 < 0.5 ? vec3(0.56, 0.4, 0.25) : r2 < 0.8 ? vec3(0.72, 0.6, 0.45) : vec3(0.34, 0.24, 0.16);
  vec3 col; float ao;
  vec3 extra = vec3(0.0);   // light of its own (lamps, TV), not lit by the room


  if (t == tV) {
    if (d.y > 0.0) {
      col = vec3(0.82);
      float lamp = length(vec2(hu - W * 0.5, hw - D * 0.45));
      extra += lightCol * 1.6 * smoothstep(0.3, 0.12, lamp) * on;
    } else {
      col = wood * (0.92 + 0.08 * step(0.5, fract(hu / 0.19)));
      if (type < 0.5) { vec2 rg = abs(vec2(hu - W * 0.5, hw - D * 0.55)); if (rg.x < 1.1 && rg.y < 0.8) col = mix(vec3(0.75, 0.72, 0.68), vec3(0.45, 0.47, 0.52), r2); }
      if (type > 0.5 && type < 1.5 && abs(hu - W * 0.5) < 0.85 && hw > D - 2.1) col = vec3(0.9, 0.9, 0.88); // bed
    }
    ao = edgeAo(hu, hw, W, D);
  } else {
    bool back = t == tB;
    float a = back ? hu : hw;
    float aw = back ? W : D;
    float mid = abs(a - aw * 0.5);
    col = wall;
    if (back && type < 0.5) {
      if (hy < 0.85 && mid < 1.25) col = hy > 0.62 ? vec3(0.42, 0.42, 0.44) * (0.8 + 0.4 * r2) : mix(vec3(0.62, 0.6, 0.56), vec3(0.28, 0.36, 0.4), r2); // sofa
      if (hy > 1.3 && hy < 1.95 && mid < 0.5) col = mix(vec3(0.85, 0.5, 0.3), vec3(0.25, 0.45, 0.6), ih2(vec2(floor(a * 3.0), floor(hy * 4.0) + rid))); // picture
      if (hy > 1.26 && hy < 1.99 && mid < 0.54 && (mid > 0.5 || hy < 1.3 || hy > 1.95)) col = vec3(0.12);
      // floor lamp by the sofa
      if (abs(a - 0.45) < 0.02 && hy < 1.5) col = vec3(0.1);
      if (abs(a - 0.45) < 0.17 && hy > 1.42 && hy < 1.72) extra += lightCol * 1.4 * on;
    } else if (back && type < 1.5) {
      if (hy < 1.1 && mid < 0.95) col = hy < 0.55 ? vec3(0.92, 0.92, 0.9) : vec3(0.36, 0.3, 0.26); // bed, headboard
      if (hy > 1.6 && hy < 1.85 && mid > 1.1 && mid < 1.35) extra += lightCol * 1.8 * max(on, 0.35 * step(0.3, rid)); // bedside lamps
    } else if (type > 1.5) {
      // kitchen units along the back and one side, lit under the wall units
      if (hy < 0.9) col = r2 < 0.5 ? vec3(0.9, 0.89, 0.86) : wood;
      if (hy > 0.88 && hy < 0.93) col = vec3(0.2);
      if (hy > 1.45 && hy < 2.25) col = r2 < 0.5 ? vec3(0.88, 0.87, 0.84) : vec3(0.3, 0.3, 0.32);
      if (hy > 0.93 && hy < 1.45) { col = vec3(0.8, 0.78, 0.74); extra += lightCol * 0.5 * smoothstep(1.2, 1.44, hy) * on; }
    } else if (!back && hy < 2.05 && abs(a - 3.6) < 0.45) {
      col = vec3(0.45, 0.33, 0.24); // door
    }
    // TV on the left wall of some living rooms: blue flicker in the evening
    if (!back && type < 0.5 && hu < 0.5 && hw > 1.7 && hw < 2.9 && hy > 0.8 && hy < 1.45) {
      col = vec3(0.02);
      float fl = 0.65 + 0.35 * sin(uTime * 2.7 + rid * 31.0) * sin(uTime * 7.9 + rid * 7.0);
      extra += vec3(0.35, 0.5, 0.95) * fl * 1.3 * uNight * step(0.5, r3) * step(0.24, rid);
    }
    if (hy < 0.07) col = vec3(0.85);
    ao = edgeAo(a, hy, aw, h);
  }
  // the room's light: a pool under the ceiling lamp, a second by the floor lamp, a little fill
  float l1 = 1.25 / (1.0 + 0.3 * dot(Q - vec3(W * 0.5, h - 0.4, D * 0.45), Q - vec3(W * 0.5, h - 0.4, D * 0.45)));
  float l2 = type < 0.5 ? 0.8 / (1.0 + 0.9 * dot(Q - vec3(0.45, 1.55, D - 0.3), Q - vec3(0.45, 1.55, D - 0.3))) : 0.0;
  float lightAmt = 0.38 + (l1 + l2) * on;
  return col * lightCol * lit * lightAmt * ao + extra;
}

// curtains on the inside of the pane: sheers and drapes drawn in from both sides of each room;
// a lit room shines through its sheers
vec3 curtains(vec3 room, vec3 glow, float u, float y, float rid, float cu, float W) {
  float fi = floor((y - 11.7) / 3.0);
  float hy = y - (11.7 + fi * 3.0);
  float a = u - cu * W;
  float open = 0.1 + 0.8 * ih(vec3(rid * 3.7, cu, 1.0));
  if (y > uFocus.x && y < uFocus.y) return room;
  float side = min(a, W - a) / (W * 0.5);       // 0 at the room's edges, 1 in the middle
  float fold = 0.85 + 0.15 * sin(a * 40.0);
  float k = ih(vec3(rid, 4.0, 2.0));
  vec3 drape = k < 0.4 ? vec3(0.78, 0.74, 0.66) : k < 0.7 ? vec3(0.55, 0.55, 0.56) : vec3(0.42, 0.36, 0.3);
  vec3 c = room;
  if (k > 0.25 && side < 1.0 - open) c = mix(room, vec3(0.9, 0.89, 0.86) * mix(0.75, 1.0, 1.0 - uNight) + glow * 0.5 * uNight, 0.55) * fold; // sheer
  if (side < 0.22 * (1.0 - open) + 0.08) c = drape * fold * (0.75 * (1.0 - uNight) + uNight * 0.6 * glow);   // drape
  if (hy > 2.62) c = vec3(0.18) * (1.0 - 0.8 * uNight);                                                       // pelmet
  return c;
}

// ---- furniture for the shops and offices: cards facing the glass, some way in ----
vec3 furniture(float type, float a, float y, float W, float rid) {
  float c = W * (0.5 + 0.25 * (fract(rid * 9.7) - 0.5));
  float x = a - c;
  if (type < 0.5) {                                   // gondola shelving
    if (abs(x) > 1.3 || y > 1.6) return vec3(-1.0);
    if (abs(x) > 1.24 || y > 1.54) return vec3(0.88, 0.88, 0.86);
    if (y < 0.18) return vec3(0.25);
    vec3 p = shopProducts(x + 8.0, y + 0.05, rid + 11.0);
    return p.x >= 0.0 ? p : vec3(0.82, 0.81, 0.78);
  } else if (type < 1.5) {                            // cafe tables and chairs
    float tx = abs(x) - 1.1;                          // two tables, either side of the middle
    if (abs(tx) < 0.45 && y > 0.72 && y < 0.77) return vec3(0.32, 0.21, 0.13);
    if (abs(tx) < 0.035 && y < 0.72) return vec3(0.12);
    float cx = abs(abs(tx) - 0.62);
    if (cx < 0.2 && y > 0.44 && y < 0.48) return vec3(0.18, 0.16, 0.15);
    if (abs(tx) > 0.6 && cx < 0.2 && cx > 0.16 && y < 0.92) return vec3(0.18, 0.16, 0.15);
    if (abs(tx) > 0.6 && cx < 0.2 && y > 0.62 && y < 0.92) return vec3(0.22, 0.19, 0.17);
    return vec3(-1.0);
  } else if (type < 2.5) {                            // clothes rail
    if (abs(x) > 1.22 || y > 1.56) return vec3(-1.0);
    if (y > 1.5) return vec3(0.65);
    if (abs(x) > 1.18) return vec3(0.6);
    float i = floor(x / 0.085);
    float hem = 0.62 + 0.3 * ih2(vec2(i, rid));
    if (y < hem) return y < 0.05 ? vec3(0.6) : vec3(-1.0);
    float k = ih2(vec2(i * 1.7, rid + 2.0));
    vec3 cl = k < 0.3 ? vec3(0.85, 0.82, 0.76) : k < 0.55 ? vec3(0.18, 0.2, 0.26) : k < 0.75 ? vec3(0.62, 0.48, 0.36) : vec3(0.48, 0.18, 0.2);
    return cl * (fract(x / 0.085) < 0.12 ? 0.55 : 1.0);
  } else if (type < 3.5) {                            // reception desk and a plant
    if (abs(x) < 1.3 && y < 1.08) return y > 1.0 ? vec3(0.86, 0.84, 0.8) : vec3(0.45, 0.3, 0.18);
    float px = x - 2.1;
    if (abs(px) < 0.24 && y < 0.5) return vec3(0.3, 0.29, 0.28);
    if (length(vec2(px, (y - 1.0) * 0.8)) < 0.48) return vec3(0.18, 0.36, 0.16) * (0.85 + 0.15 * sin(px * 23.0) * sin(y * 19.0) - 0.25 * smoothstep(0.2, 0.48, length(vec2(px, (y - 1.0) * 0.8))));
    return vec3(-1.0);
  } else {                                            // office desks with screens
    if (abs(x) > 1.7) return vec3(-1.0);
    if (y > 0.72 && y < 0.76) return vec3(0.82, 0.8, 0.76);
    if (abs(x) > 1.64 && y < 0.72) return vec3(0.3);
    float m = abs(abs(x) - 0.75);
    if (m < 0.28 && y > 0.88 && y < 1.22) return (m > 0.26 || y < 0.9 || y > 1.2) ? vec3(0.04) : mix(vec3(0.3, 0.42, 0.6), vec3(0.5, 0.6, 0.75), ih2(vec2(floor(x * 3.0), rid)));
    if (m < 0.03 && y > 0.76 && y < 0.88) return vec3(0.1);
    if (m < 0.24 && y > 0.48 && y < 0.72 && abs(x) < 1.6) return vec3(0.12, 0.12, 0.14);    // chair backs below the desk line
    return vec3(-1.0);
  }
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
  float rid = ih(vec3(cu, fi, s + (alongX ? 3.0 : 0.0)));
  vec3 light = shop ? vec3(1.0, 0.9, 0.76) : vec3(0.95, 0.97, 1.0);
  float lit = shop ? 1.0 : (rid < mix(0.22, 0.55, uNight) ? mix(0.35, 0.04, uNight) : 0.85);
  // the walls between units have a thickness: their ends show behind the glass
  float pt = shop ? 0.16 : 0.1;
  float fu = u - u0;
  if (fu < pt || fu > W - pt) return vec3(0.78, 0.77, 0.74) * light * lit * 0.5;
  float tS = abs(du) < 1e-5 ? 1e5 : ((du > 0.0 ? u0 + W - pt : u0 + pt) - u) / du;
  float tV = abs(d.y) < 1e-5 ? 1e5 : ((d.y > 0.0 ? lv1 : lv0) - y) / d.y;
  float tB = D / dw;
  float t = min(tB, min(tS, tV));
  vec3 H = P + d * t;
  float hu = clamp((alongX ? H.z : H.x) - u0, 0.0, W);
  float hy = clamp(H.y - lv0, 0.0, h);
  float hw = clamp(t * dw, 0.0, D);
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
      if (shop) {
        col *= 0.9 + 0.1 * step(0.5, fract(floor(hu / 0.8) * 0.5 + floor(hw / 0.8) * 0.5));
        // the polished floor mirrors the downlights, blurred
        vec2 g = fract(vec2(hu, hw) / 1.6) - 0.5;
        col += vec3(0.55) * smoothstep(0.3, 0.0, length(g));
      }
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

  // furniture: one piece per unit, a few metres in
  float tBest = t;
  float dl = shop ? 2.6 + 2.4 * fract(rid * 5.3) : 2.3;
  float tl = dl / dw;
  if (tl < tBest) {
    vec3 c = furniture(type, u + du * tl - u0, y + d.y * tl - lv0, W, rid);
    if (c.x >= 0.0) { col = c * light * lit * mix(1.0, 0.8, dl / D); tBest = tl; }
  }
  return col;
}
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
// seen from afar the glass reads as the towers' blue; up close the rooms behind it show
// at night the lit windows stay lit however far away
float iFar = uFar.z * (1.0 - uNight) * smoothstep(uFar.x, uFar.y, length(vIPos - vICam));
diffuseColor.rgb = mix(diffuseColor.rgb, uFarColor, iFar);
`;

const FRAG_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 iRay = vIPos - vICam;
  vec3 iN = normalize(vINrm);
  if (dot(iN, iRay) > 0.0) iN = -iN;
  vec3 iCol;
  if (uHome > 0.5) {
    float rid, cu, W;
    vec3 glow;
    iCol = homeColor(vIPos, iRay, iN, rid, cu, W, glow);
    iCol = curtains(iCol, glow, abs(iN.x) > abs(iN.z) ? vIPos.z : vIPos.x, vIPos.y, rid, cu, W);
  } else {
    iCol = interiorColor(vIPos, iRay, iN);
  }
  // blinds in the offices' windows: pulled down to a different height in each room
  if (uHome < 0.5 && uShop < 0.5 && vIPos.y > 4.4) {
    float top = vIPos.y < 7.7 ? 7.3 : 10.9;
    bool alongX = abs(iN.x) > abs(iN.z);
    float u = alongX ? vIPos.z : vIPos.x;
    float drop = 0.15 + 1.4 * ih(vec3(floor(u / 1.4), floor(vIPos.y / 3.6), 7.0));
    if (vIPos.y > top - drop) iCol = mix(vec3(0.5, 0.49, 0.46), vec3(0.3, 0.29, 0.27), step(0.8, fract(vIPos.y / 0.05)));
  }
  float cosT = abs(dot(normalize(-iRay), iN));
  float fres = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
  // evening and night: the rooms' lights carry against the dark, through a less coloured glass
  vec3 iTint = mix(uTint, vec3(0.92, 0.95, 1.0), 0.6 * uNight);
  // the floor being flown into: seen up close, through clear glass
  if (vIPos.y > uFocus.x && vIPos.y < uFocus.y) iTint = mix(iTint, vec3(1.0), 0.75);
  totalEmissiveRadiance += iCol * iTint * uGlow * mix(1.0, 2.6, uNight) * (1.0 - fres) * (1.0 - 0.85 * iFar);
}
`;

const FRAG_REFL = /* glsl */ `
reflectedLight.indirectSpecular *= uReflBoost * mix(1.0, 0.35, uNight); // the HDRI is a day sky
#include <aomap_fragment>
`;

type Look = { base: Color; roughness: number; glow: number; tint: Color; refl: number; far?: { color: Color; from: number; to: number; max: number } };

const LOOKS: Record<InteriorKind, Look> = {
  shop: { base: new Color('#05080C'), roughness: 0.04, glow: 0.75, tint: new Color(0.82, 0.9, 0.92), refl: 2.2 },
  office: { base: new Color('#05080C'), roughness: 0.04, glow: 0.7, tint: new Color(0.82, 0.9, 0.92), refl: 2.2 },
  // the towers keep their blue glass: a darker blue base, the rooms seen through a blue tint
  home: { base: new Color('#0B2347'), roughness: 0.06, glow: 0.72, tint: new Color(0.55, 0.7, 0.95), refl: 1.6, far: { color: new Color(0.07, 0.19, 0.43), from: 60, to: 320, max: 0.6 } },
};

/** 0 by day, 1 at night: set from the sun (Sun.tsx), shared by every interior glass material. */
export const interiorNight = { value: 0 };
/** Seconds, for the flickering TVs in the homes (set in nightLights.tsx). */
export const interiorTime = { value: 0 };
/** Heights [from, to] of the floor the building view is zooming into: its homes are lit with the
 *  curtains open, so the rooms show as the camera reaches the glass (BuildingScene's ZoomIn). */
export const interiorFocus = { value: new Vector2(-1, -1) };

/** How far into the evening it is for a sun this high (degrees): lights come on as it gets low, full by dusk. */
export function nightFactor(elevation: number) {
  const t = Math.min(1, Math.max(0, (10 - elevation) / 13));
  return t * t * (3 - 2 * t);
}

export function interiorGlass(kind: InteriorKind) {
  const look = LOOKS[kind];
  const m = new MeshStandardMaterial({ color: look.base.clone(), roughness: look.roughness, metalness: 0 });
  m.name = `Glass ${kind} (interior)`;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uShop = { value: kind === 'shop' ? 1 : 0 };
    shader.uniforms.uHome = { value: kind === 'home' ? 1 : 0 };
    shader.uniforms.uGlow = { value: look.glow };
    shader.uniforms.uNight = interiorNight;
    shader.uniforms.uTime = interiorTime;
    shader.uniforms.uFocus = interiorFocus;
    shader.uniforms.uReflBoost = { value: look.refl };
    shader.uniforms.uTint = { value: look.tint };
    shader.uniforms.uFarColor = { value: look.far?.color ?? look.base };
    shader.uniforms.uFar = { value: [look.far?.from ?? 1e5, look.far?.to ?? 2e5, look.far?.max ?? 0] };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE)
      .replace('#include <aomap_fragment>', FRAG_REFL);
  };
  m.customProgramCacheKey = () => `interior-glass-${kind}`;
  return m;
}
