/*{
  "DESCRIPTION": "Mothlight.Duo: two matching video oscillators, a mixer with bend, and a shape window, in brightness only. Trails come from Mothlight.Trails and colour from Mothlight.Colour. Mothlight No.01.",
  "CREDIT": "NXLX.Systems and contributors",
  "ISFVSN": "2",
  "CATEGORIES": ["Generator", "NXLX"],
  "INPUTS": [
    {"NAME": "a_wave",  "LABEL": "Wave",      "TYPE": "long", "VALUES": [0,1,2,3], "LABELS": ["Sine","Triangle","Saw","Square"], "DEFAULT": 0},
    {"NAME": "a_form",  "LABEL": "Pattern",      "TYPE": "long", "VALUES": [0,1,2,3], "LABELS": ["Lines","Rings","Rays","Spiral"], "DEFAULT": 0},
    {"NAME": "a_freq",  "LABEL": "Bands",     "TYPE": "float", "MIN": 0.5, "MAX": 32.0, "DEFAULT": 3.0},
    {"NAME": "a_rate",  "LABEL": "Speed",     "TYPE": "float", "MIN": -1.0, "MAX": 1.0, "DEFAULT": 0.08},
    {"NAME": "a_angle", "LABEL": "Angle",     "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.12},

    {"NAME": "b_wave",  "LABEL": "Wave",      "TYPE": "long", "VALUES": [0,1,2,3], "LABELS": ["Sine","Triangle","Saw","Square"], "DEFAULT": 0},
    {"NAME": "b_form",  "LABEL": "Pattern",      "TYPE": "long", "VALUES": [0,1,2,3], "LABELS": ["Lines","Rings","Rays","Spiral"], "DEFAULT": 1},
    {"NAME": "b_freq",  "LABEL": "Bands",     "TYPE": "float", "MIN": 0.5, "MAX": 32.0, "DEFAULT": 2.0},
    {"NAME": "b_rate",  "LABEL": "Speed",     "TYPE": "float", "MIN": -1.0, "MAX": 1.0, "DEFAULT": -0.05},
    {"NAME": "b_angle", "LABEL": "Angle",     "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.37},

    {"NAME": "mix_mode", "LABEL": "Mode",     "TYPE": "long", "VALUES": [0,1,2,3], "LABELS": ["Blend","Add","Multiply","Difference"], "DEFAULT": 0},
    {"NAME": "mix_amt",  "LABEL": "Balance",   "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5},
    {"NAME": "a_fm",     "LABEL": "Bend",     "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.25},

    {"NAME": "shape_kind", "LABEL": "Window", "TYPE": "long", "VALUES": [0,1,2,3], "LABELS": ["Off","Circle","Square","Diamond"], "DEFAULT": 0},
    {"NAME": "shape_size", "LABEL": "Window size",   "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6},
    {"NAME": "shape_soft", "LABEL": "Window softness",   "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.1}
  ]
}*/
// SPDX-FileCopyrightText: 2026 NXLX.Systems and contributors
// SPDX-License-Identifier: Apache-2.0
// An original shader written for Mothlight No.01 and nxlx.mastercontrol.

// Flash safety: oscillator speeds are capped at 1 cycle a second and the bend at 1, so a pixel of a square wave
// changes at most 3 times a second.

// Phase-continuous clocks. The NXLX runner adds each speed up every frame and sets nx_on = 1, so moving a speed
// fader never jumps the picture. Other ISF hosts leave these at 0 and fall back to TIME * speed.
uniform float nx_on;
uniform float nx_pa;
uniform float nx_pb;

const float TAU = 6.2831853;

float wave(float x, int k) {
	float f = fract(x);
	if (k == 0) return 0.5 + 0.5 * sin(x * TAU);
	if (k == 1) return 1.0 - abs(f * 2.0 - 1.0);
	if (k == 2) return f;
	return smoothstep(0.48, 0.52, f) - smoothstep(0.98, 1.0, f);
}

// where a pixel sits along an oscillator: both oscillators work the same way
float along(int form, vec2 p, float r, float th, float freq, float angle) {
	if (form == 1) return r * freq;
	if (form == 2) return th * ceil(freq);
	if (form == 3) return r * freq + th * ceil(freq * 0.5);
	return dot(p, vec2(cos(angle * TAU), sin(angle * TAU))) * freq;
}

void main() {
	vec2 uv = isf_FragNormCoord.xy;
	bool own = nx_on > 0.5;
	float pa = own ? nx_pa : TIME * a_rate;
	float pb = own ? nx_pb : TIME * b_rate;

	vec2 p = (uv - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
	float r = length(p);
	float th = atan(p.y, p.x) / TAU;

	// Rays and Spiral are turned by the angle too, so Angle does something on all but Rings
	float b = wave(along(b_form, p, r, th + b_angle, b_freq, b_angle) - pb, b_wave);
	float a = wave(along(a_form, p, r, th + a_angle, a_freq, a_angle) - pa + (b - 0.5) * a_fm, a_wave);

	float v;
	if (mix_mode == 0)      v = mix(a, b, mix_amt);
	else if (mix_mode == 1) v = min(1.0, a * (1.0 - mix_amt) * 2.0 + b * mix_amt * 2.0);
	else if (mix_mode == 2) v = sqrt(mix(a, a * b, mix_amt));
	else                    v = abs(a - b * mix_amt);

	// Window: 1 inside, and it masks the finished mix
	if (shape_kind > 0) {
		float d = shape_kind == 1 ? r : shape_kind == 2 ? max(abs(p.x), abs(p.y)) : abs(p.x) + abs(p.y);
		float edge = 0.01 + shape_soft * 0.3;
		v *= 1.0 - smoothstep(shape_size * 0.7 - edge, shape_size * 0.7 + edge, d);
	}
	gl_FragColor = vec4(vec3(v), 1.0);
}
