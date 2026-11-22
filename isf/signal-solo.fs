/*{
    "ISFVSN": "2",
    "DESCRIPTION": "Signal.Solo: two video oscillators, the second bending the first, in a shape window, with optional colour by brightness; every pixel changes at most 3 times a second.",
    "CREDIT": "NXLX.Systems and contributors",
    "CATEGORIES": [
        "Generator",
        "Performance"
    ],
    "COST": "low: two waves, one arc tangent, one square root and a cosine colour a pixel",
    "INPUTS": [
        {
            "NAME": "rate",
            "LABEL": "Speed",
            "TYPE": "float",
            "MIN": 0.02,
            "MAX": 3.0,
            "DEFAULT": 0.12
        },
        {
            "NAME": "bands",
            "LABEL": "Bands",
            "TYPE": "float",
            "MIN": 1.0,
            "MAX": 24.0,
            "DEFAULT": 4.0
        },
        {
            "NAME": "angle",
            "LABEL": "Angle",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 1.0,
            "DEFAULT": 0.12
        },
        {
            "NAME": "bend",
            "LABEL": "Bend",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 0.6,
            "DEFAULT": 0.3
        },
        {
            "NAME": "form",
            "LABEL": "Pattern",
            "TYPE": "long",
            "VALUES": [0, 1, 2, 3],
            "LABELS": ["Lines", "Rings", "Rays", "Spiral"],
            "DEFAULT": 1
        },
        {
            "NAME": "wave",
            "LABEL": "Wave",
            "TYPE": "long",
            "VALUES": [0, 1, 2, 3],
            "LABELS": ["Sine", "Triangle", "Saw", "Square"],
            "DEFAULT": 0
        },
        {
            "NAME": "shape",
            "LABEL": "Window",
            "TYPE": "long",
            "VALUES": [0, 1, 2, 3],
            "LABELS": ["Off", "Circle", "Square", "Diamond"],
            "DEFAULT": 0
        },
        {
            "NAME": "spread",
            "LABEL": "Colour",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 1.0,
            "DEFAULT": 0.45
        }
    ]
}*/
// SPDX-FileCopyrightText: 2026 NXLX.Systems and contributors
// SPDX-License-Identifier: Apache-2.0
// An original shader written for Mothlight No.01 and nxlx.mastercontrol.

// Flash safety: Osc A moves at 0.6 of the rate and Osc B at 0.2, and the bend is at most 0.6, so a pixel of A
// changes at most 0.6 + 0.6 * pi * 0.2 = 0.98 times the rate (B's sine moves at most pi * 0.2 * rate a second,
// and the bend scales that): under 3 a second with the rate capped at 3.
// The slow drift of the angle turns the stripes too, and a turn moves them most past the pixels far from the centre
// (up to 1.02 from it). With many bands at top speed the drift alone swept stripes past those about 3.5 times a
// second, so its size is held to half of what the rate leaves of the 3. At usual speeds it is not changed.

float wavef(float x, int k) {
    float f = fract(x);
    if (k == 0) {
        return 0.5 + 0.5 * sin(x * 6.2831853);
    }
    if (k == 1) {
        return 1.0 - abs(f * 2.0 - 1.0);
    }
    if (k == 2) {
        return f;
    }
    return smoothstep(0.47, 0.53, f) - smoothstep(0.97, 1.0, f);
}

void main() {
    vec2 uv = isf_FragNormCoord;
    float hz = min(rate, 3.0);
    float pa = fract(TIME * hz * 0.6);
    float pb = fract(TIME * hz * 0.2);
    // stripes swept past the farthest pixel for each radian of turn (A, and B through the bend when B is lines too),
    // and the drift's fastest turn at full size, 0.04 * 2 pi * 2 pi * 0.03 * hz = 0.0474 * hz radians a second
    float perRad = 1.02 * (bands + (form == 0 ? 0.6 * 3.14159265 * (bands * 0.66 + 1.0) : 0.0));
    float natural = perRad * 0.0474 * hz;
    float driftSize = 0.04 * min(1.0, 0.5 * max(0.0, 3.0 - 0.98 * hz) / max(natural, 0.0001));
    float drift = sin(fract(TIME * hz * 0.03) * 6.2831853) * driftSize;

    vec2 p = (uv - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
    float r = length(p);
    float th = atan(p.y, p.x) / 6.2831853;
    float turn = (angle + drift) * 6.2831853;

    // Osc B, the modulator: always a sine, so its bend is smooth
    float bfreq = bands * 0.66 + 1.0;
    float bx = 0.0;
    if (form == 0) {
        bx = dot(p, vec2(-sin(turn), cos(turn))) * bfreq;
    }
    if (form == 1) {
        bx = r * bfreq;
    }
    if (form == 2) {
        bx = th * floor(bfreq);
    }
    if (form == 3) {
        bx = r * bfreq + th * floor(bfreq * 0.5 + 1.0);
    }
    float b = 0.5 + 0.5 * sin((bx - pb) * 6.2831853);

    // Osc A, bent by B
    float a = wavef(dot(p, vec2(cos(turn), sin(turn))) * bands + pa + (b - 0.5) * bend, wave);

    // Shape window: 1 inside
    float d = r;
    if (shape == 2) {
        d = max(abs(p.x), abs(p.y));
    }
    if (shape == 3) {
        d = abs(p.x) + abs(p.y);
    }
    float m = 1.0;
    if (shape > 0) {
        m = 1.0 - smoothstep(0.27, 0.31, d);
    }
    float v = mix(b * 0.35, a, m);

    // Colour by brightness; black stays black, and no colour at all is plain grey for a later stage to colour
    vec3 pal = 0.5 + 0.5 * cos(6.2831853 * (v * spread + 0.62 + vec3(0.0, 0.33, 0.67)));
    pal = mix(vec3(1.0), pal, clamp(spread * 4.0, 0.0, 1.0));
    gl_FragColor = vec4(pal * pow(clamp(v, 0.0, 1.0), 0.7), 1.0);
}
