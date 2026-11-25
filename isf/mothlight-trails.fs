/*{
    "ISFVSN": "2",
    "DESCRIPTION": "Mothlight.Trails, a feedback processor: the last picture is zoomed, turned and slid, then keyed under the playing one as trails.",
    "CREDIT": "NXLX.Systems and contributors",
    "CATEGORIES": [
        "Filter",
        "Feedback"
    ],
    "COST": "medium: six texture reads and one hue turn a pixel in the first pass, one read in the second, plus one read of a past frame for Frames or three history reads for Smear",
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "NAME": "feed",
            "LABEL": "Length",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 1.0,
            "DEFAULT": 0.93
        },
        {
            "NAME": "key",
            "LABEL": "Key",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 1.0,
            "DEFAULT": 0.3
        },
        {
            "NAME": "keyinto",
            "LABEL": "Key into",
            "TYPE": "long",
            "VALUES": [0, 1],
            "LABELS": ["Darks", "Lights"],
            "DEFAULT": 0
        },
        {
            "NAME": "zoom",
            "LABEL": "Zoom",
            "TYPE": "float",
            "MIN": -0.06,
            "MAX": 0.06,
            "DEFAULT": 0.008
        },
        {
            "NAME": "turn",
            "LABEL": "Turn",
            "TYPE": "float",
            "MIN": -0.02,
            "MAX": 0.02,
            "DEFAULT": 0.001
        },
        {
            "NAME": "shiftx",
            "LABEL": "Slide across",
            "TYPE": "float",
            "MIN": -0.02,
            "MAX": 0.02,
            "DEFAULT": 0.0
        },
        {
            "NAME": "shifty",
            "LABEL": "Slide up",
            "TYPE": "float",
            "MIN": -0.02,
            "MAX": 0.02,
            "DEFAULT": 0.0
        },
        {
            "NAME": "delaystyle",
            "LABEL": "Delay",
            "TYPE": "long",
            "VALUES": [0, 1],
            "LABELS": ["Frames", "Smear"],
            "DEFAULT": 0
        },
        {
            "NAME": "frames",
            "LABEL": "Frames",
            "TYPE": "float",
            "MIN": 2.0,
            "MAX": 60.0,
            "DEFAULT": 8.0,
            "WHOLE": true
        },
        {
            "NAME": "echotime",
            "LABEL": "Time",
            "TYPE": "float",
            "MIN": 0.05,
            "MAX": 1.5,
            "DEFAULT": 0.5
        },
        {
            "NAME": "echo",
            "LABEL": "Amount",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 1.0,
            "DEFAULT": 0.0
        },
        {
            "NAME": "edges",
            "LABEL": "Edges",
            "TYPE": "long",
            "VALUES": [0, 1, 2],
            "LABELS": ["Hold", "Wrap", "Reflect"],
            "DEFAULT": 2
        },
        {
            "NAME": "mirror",
            "LABEL": "Mirror",
            "TYPE": "long",
            "VALUES": [0, 1, 2, 3],
            "LABELS": ["Off", "Left/right", "Up/down", "Both"],
            "DEFAULT": 0
        },
        {
            "NAME": "hueturn",
            "LABEL": "Hue drift",
            "TYPE": "float",
            "MIN": -0.02,
            "MAX": 0.02,
            "DEFAULT": 0.0
        },
        {
            "NAME": "sharpen",
            "LABEL": "Sharpen",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 1.0,
            "DEFAULT": 0.0
        }
    ],
    "PASSES": [
        {
            "TARGET": "drift",
            "PERSISTENT": true
        },
        {}
    ]
}*/
// SPDX-FileCopyrightText: 2026 NXLX.Systems and contributors
// SPDX-License-Identifier: Apache-2.0
// An original shader written for Mothlight No.01 and nxlx.mastercontrol.

// The first pass draws the drift buffer: the last picture, moved, with the playing picture keyed over it. The second
// pass shows it. The NXLX web runner adds two things of its own. NXLX_FRAMES: "delayed", the drift buffer as it was
// Frames frames ago, at full size (the runner picks the frame; Frames itself is not read here). NXLX_HISTORY (WebGL 2):
// pastA to pastC, soft pictures from up to a few seconds ago, for Smear. Other ISF hosts (Mastercontrol's node
// included) skip that code, and Amount does nothing there.
// Nothing here inverts brightness or hue: in a loop that would flip every frame.

vec2 edge(vec2 q) {
    if (edges == 1) {
        return fract(q);
    }
    if (edges == 2) {
        return 1.0 - abs(1.0 - mod(q, 2.0));
    }
    return clamp(q, 0.0, 1.0);
}

vec3 hueDrift(vec3 c) {
    // turn the hue around the grey axis
    float a = hueturn * 6.2831853;
    vec3 k = vec3(0.57735);
    float cs = cos(a);
    return clamp(c * cs + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cs), 0.0, 1.0);
}

void main() {
    vec2 uv = isf_FragNormCoord;
    if (PASSINDEX == 1) {
        gl_FragColor = vec4(IMG_NORM_PIXEL(drift, uv).rgb, 1.0);
        return;
    }
    // folding here, in the first pass, mirrors the playing picture and the trails together, and the loop stays symmetric
    if (mirror == 1 || mirror == 3) {
        uv.x = 0.5 - abs(uv.x - 0.5);
    }
    if (mirror == 2 || mirror == 3) {
        uv.y = 0.5 - abs(uv.y - 0.5);
    }
    float aspect = RENDERSIZE.x / RENDERSIZE.y;
    vec2 q = (uv - 0.5) * vec2(aspect, 1.0) * (1.0 - zoom);
    float a = turn * 6.2831853;
    q = vec2(cos(a) * q.x - sin(a) * q.y, sin(a) * q.x + cos(a) * q.y);
    q = q / vec2(aspect, 1.0) + 0.5 - vec2(shiftx, shifty);
    q = edge(q);

    vec3 back = IMG_NORM_PIXEL(drift, q).rgb;
#ifdef NXLX_FRAMES
    if (delaystyle == 0 && echo > 0.0) {
        // Frames: the trails feed back from the last frame and from one Frames ago, blended by Amount, so the delayed
        // picture comes through without the stutter of feeding back from it alone (that is Amount at the top)
        back = mix(back, IMG_NORM_PIXEL(delayed, q).rgb, echo);
    }
#endif
#ifdef NXLX_HISTORY
    if (delaystyle == 1 && echo > 0.0) {
        // Smear: frames from a third of Time, two thirds and all of Time ago, blended into the trails like a long exposure
        vec3 old = (IMG_NORM_PIXEL(pastA, q).rgb + IMG_NORM_PIXEL(pastB, q).rgb + IMG_NORM_PIXEL(pastC, q).rgb) / 3.0;
        back = mix(back, max(back, old), echo);
    }
#endif
    vec2 px = 1.0 / RENDERSIZE;
    vec3 around = IMG_NORM_PIXEL(drift, edge(q + vec2(px.x, 0.0))).rgb + IMG_NORM_PIXEL(drift, edge(q - vec2(px.x, 0.0))).rgb
                + IMG_NORM_PIXEL(drift, edge(q + vec2(0.0, px.y))).rgb + IMG_NORM_PIXEL(drift, edge(q - vec2(0.0, px.y))).rgb;
    back = clamp(back + (back * 4.0 - around) * sharpen * 0.5, 0.0, 1.0);
    // at full Trails the picture holds; below that the last step takes faint 8-bit ghosts all the way to black
    back = hueDrift(back) * feed;
    if (feed < 0.999) {
        back = max(back - 0.004, 0.0);
    }

    vec3 now = IMG_NORM_PIXEL(inputImage, uv).rgb;
    float luma = dot(now, vec3(0.299, 0.587, 0.114));
    float shows = smoothstep(key - 0.06, key + 0.06, luma);
    if (keyinto == 1) {
        shows = 1.0 - smoothstep(1.0 - key - 0.06, 1.0 - key + 0.06, luma);
    }
    gl_FragColor = vec4(mix(back, now, shows), 1.0);
}
