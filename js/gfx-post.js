'use strict';
/* =========================================================
   HD-2D post-processing (own lightweight pipeline, three r128)
   scene -> HDR target (half float, MSAA 2x high / 4x ultra) + resolved depth texture
     -> atmosphere pass (half res, high/ultra, only when the map uses it):
          R = SSAO (depth-only Alchemy-style, spiral taps, view normals from derivatives)
          G = volumetric sun/moon light: ray-march through a low air slab over the ground,
              lit where the cached static shadow map (gfx-world, SHADOW) sees the sun
     -> bloom: soft-threshold prefilter + mip chain down/up (tent)
     -> tilt-shift DOF: half & quarter-res gaussian, blended by a
        screen band centred on the player (sharp) that blurs toward
        the top (far) and bottom (near) of the screen
     -> composite: heat shimmer (throne: lava pixels by depth), AO, volumetric light,
        drifting ground mist + height fog (world position from depth, height above the
        terrain from a heightmap texture; lit by the bloom = glows near fires),
        exposure, ACES filmic, sRGB, per-map grade (lift/gamma/gain, saturation,
        contrast, split tone), vignette, subtle film grain -> canvas.
   Everything atmospheric is low-frequency, so pixel sprites stay crisp.
   The 2D overlay canvas (#cv) is separate and stays sharp on top.
   Dynamic resolution (perf round 3): the scene and every post target render at GFX.scale (0.5..1, driven by the
   adaptive quality controller in gfx-world.js); the composite writes the full-resolution canvas and reads the scene
   through a Catmull-Rom (sharp bicubic) filter when scaled, so pixel sprites stay crisp. At scale 1 nothing changes.
   gfxPresent() draws a frame; renderer.render(scene, camera) is
   wrapped so existing callers go through it automatically.
   ========================================================= */
const POST = (() => {
  const gl2 = renderer.capabilities.isWebGL2, ext = renderer.extensions;
  const has = n => { try { return ext.has(n); } catch (e) { return false; } };
  const hdr = gl2 ? has('EXT_color_buffer_float') : (has('OES_texture_half_float') && has('OES_texture_half_float_linear') && has('EXT_color_buffer_half_float'));
  const depthOK = gl2 || has('WEBGL_depth_texture');
  const derivOK = gl2 || has('OES_standard_derivatives');
  const TYPE = THREE.HalfFloatType;
  const S = { dbg: null, on: false, scale: 1, w: 0, h: 0, scene: null, mips: [], dA: null, dA2: null, dB: null, dB2: null, atmo: null, focus: 0.5, hdr, gl2, depthOK, stats: { passes: 0 } };

  const VS = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mat = (fs, uniforms, o = {}) => new THREE.ShaderMaterial(Object.assign({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, fog: false, lights: false }, o));
  const tex = () => ({ value: null }), v2 = () => ({ value: new THREE.Vector2() });
  const LUMA = 'float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }';
  // 4 bilinear taps = 16-texel box; the prefilter adds a soft-knee threshold + Karis average (no fireflies)
  const mPre = mat(`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uExp, uThr, uKnee; varying vec2 vUv; ${LUMA}
    vec3 thr(vec3 c){ c = min(c * uExp, vec3(60.0)); float br = max(c.r, max(c.g, c.b)); float soft = clamp(br - uThr + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4);
      return c * max(soft, br - uThr) / max(br, 1e-4); }
    void main(){ vec2 o = uTexel;
      vec3 a = thr(texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb), b = thr(texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb), c = thr(texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb), d = thr(texture2D(tSrc, vUv + o).rgb);
      float wa = 1.0 / (1.0 + luma(a)), wb = 1.0 / (1.0 + luma(b)), wc = 1.0 / (1.0 + luma(c)), wd = 1.0 / (1.0 + luma(d));
      gl_FragColor = vec4((a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd), 1.0); }`,
  { tSrc: tex(), uTexel: v2(), uExp: { value: 1 }, uThr: { value: 1 }, uKnee: { value: 0.5 } });
  const mDown = mat(`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
    void main(){ vec2 o = uTexel; gl_FragColor = vec4((texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + o).rgb) * 0.25, 1.0); }`,
  { tSrc: tex(), uTexel: v2() });
  // 3x3 tent upsample, added onto the next larger mip
  const mUp = mat(`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uGain; varying vec2 vUv;
    void main(){ vec2 o = uTexel; vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
      s += (texture2D(tSrc, vUv + vec2(-o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, -o.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y)).rgb) * 2.0;
      s += texture2D(tSrc, vUv - o).rgb + texture2D(tSrc, vUv + o).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb;
      gl_FragColor = vec4(s * (uGain / 16.0), 1.0); }`,
  { tSrc: tex(), uTexel: v2(), uGain: { value: 1 } }, { blending: THREE.AdditiveBlending, transparent: true });
  // separable gaussian (9 taps via 5 bilinear fetches)
  const mBlur = mat(`uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main(){ vec3 s = texture2D(tSrc, vUv).rgb * 0.2270270270;
      s += (texture2D(tSrc, vUv + uDir * 1.3846153846).rgb + texture2D(tSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
      s += (texture2D(tSrc, vUv + uDir * 3.2307692308).rgb + texture2D(tSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
      gl_FragColor = vec4(s, 1.0); }`,
  { tSrc: tex(), uDir: v2() });

  /* ---------- shared noise (R,G: tileable fbm, B: white noise), heightmap fallback ---------- */
  const NOISE = (() => {
    const N = 128, D = new Uint8Array(N * N * 4), fa = mkfbm(8, 4, 911), fb = mkfbm(8, 4, 377);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const o = (y * N + x) * 4, u = x / N * 8, v = y / N * 8; D[o] = clamp((fa(u, v) - 0.5) * 1.7 + 0.5, 0, 1) * 255; D[o + 1] = clamp((fb(u, v) - 0.5) * 1.7 + 0.5, 0, 1) * 255; D[o + 2] = hash2(x, y, 5) * 255; D[o + 3] = 255; }
    const t = new THREE.DataTexture(D, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
  })();
  const WHITE = (() => { const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); t.needsUpdate = true; return t; })();
  const BLACK = (() => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); t.needsUpdate = true; return t; })();
  const WPOS = `uniform mat4 uInvProj, uCamW;
    vec3 viewAt(vec2 uv, float d){ vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
    float groundAt(vec2 xz){ return uHgt.z + uHgt.w * texture2D(tHgt, (xz + 0.5) * uHgt.xy).r; }
    float airAt(vec2 xz){ return uHgt.w > 0.0 ? texture2D(tHgt, (xz + 0.5) * uHgt.xy).g : 1.0; }`;

  /* ---------- atmosphere pass: SSAO (R) + volumetric light (G), half res ---------- */
  const AU = {
    tDepth: tex(), tShadow: { value: WHITE }, tNoise: { value: NOISE }, tHgt: { value: BLACK },
    uInvProj: { value: new THREE.Matrix4() }, uCamW: { value: new THREE.Matrix4() }, uShadowM: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
    uAO: { value: new THREE.Vector4(0.6, 1, 1, 1) }, uVol: { value: new THREE.Vector4(0, 4, 0, 0) }, uVolN: { value: new THREE.Vector4(0.06, 0.02, 0.01, 0.6) }, uHgt: { value: new THREE.Vector4(0, 0, 0, 0) }, uTime: { value: 0 },
  };
  const FS_ATMO = `uniform sampler2D tDepth, tShadow, tNoise, tHgt; uniform mat4 uShadowM; uniform vec3 uCamPos; uniform vec4 uAO, uVol, uVolN, uHgt; uniform float uTime; varying vec2 vUv;
    ${WPOS}
    float unpackD(const in vec4 v){ return dot(v, (255.0 / 256.0) / vec4(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0)); }
    float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main(){
      float d = texture2D(tDepth, vUv).x, jit = ign(gl_FragCoord.xy);
      vec3 vp = viewAt(vUv, d);
      float ao = 1.0, vol = 0.0, tau = 0.0;
      #if AO_N > 0
      if (d < 0.99999) {
        vec3 n = normalize(cross(dFdx(vp), dFdy(vp)));
        float rad = uAO.x * uAO.z / -vp.z, r2 = uAO.x * uAO.x, s = 0.0;
        for (int i = 0; i < AO_N; i++) {
          float fi = (float(i) + jit) / float(AO_N), a = fi * 18.85 + jit * 6.2832;
          vec2 uv = vUv + vec2(cos(a) * uAO.w, sin(a)) * rad * (0.15 + 0.85 * fi);
          vec3 v = viewAt(uv, texture2D(tDepth, uv).x) - vp; float vv = dot(v, v);
          s += max(0.0, dot(v, n) - 0.004 * -vp.z) / (vv + 0.03) * (1.0 - smoothstep(r2, r2 * 3.0, vv));
        }
        ao = pow(clamp(1.0 - uAO.y * s / float(AO_N), 0.0, 1.0), 1.4);
      }
      #endif
      #if VOL_N > 0
      {
        vec3 wp = (uCamW * vec4(vp, 1.0)).xyz, rd = wp - uCamPos;
        float base = uVol.z, top = uVol.z + uVol.y;
        float ta = (top - uCamPos.y) / rd.y, tb = (base - uCamPos.y) / rd.y;
        float t0 = clamp(min(ta, tb), 0.0, 1.0), t1 = clamp(max(ta, tb), 0.0, 1.0);
        if (t1 > t0) {
          float dt = (t1 - t0) / float(VOL_N), acc = 0.0, all = 0.0;
          for (int i = 0; i < VOL_N; i++) {
            vec3 p = uCamPos + rd * (t0 + dt * (float(i) + jit));
            vec4 sc = uShadowM * vec4(p, 1.0);
            float lit = 1.0;
            if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) lit = step(sc.z, unpackD(texture2D(tShadow, sc.xy)) + uVol.w);
            float h = clamp((p.y - groundAt(p.xz)) / uVol.y, 0.0, 1.0);
            vec2 q = p.xz * uVolN.x + vec2(uTime * uVolN.y, uTime * uVolN.z) + p.y * 0.021;
            float n = texture2D(tNoise, q).r * 0.7 + texture2D(tNoise, q * 2.3 - uTime * uVolN.y).g * 0.3;
            float w = mix(1.0, smoothstep(0.2, 0.85, n) * 1.8, uVolN.w) * (1.0 - h) * (1.0 - h) * airAt(p.xz);
            acc += lit * w; all += w;
          }
          vol = acc * dt * length(rd) * uVol.x; tau = all * dt * length(rd) * uVol.x;
        }
      }
      #endif
      gl_FragColor = vec4(ao, vol, tau, 1.0);
    }`;
  const ATMO = {};
  function atmoMat(aoN, volN) {
    const k = aoN + ':' + volN; if (ATMO[k]) return ATMO[k];
    return (ATMO[k] = mat(FS_ATMO, AU, { defines: { AO_N: aoN, VOL_N: volN }, extensions: { derivatives: true } }));
  }

  // debug view (POST.dbg = 'ao' | 'vol' | 'tau' | 'depth'): shows one atmosphere channel instead of the frame
  const mDbg = mat(`uniform sampler2D tSrc; uniform vec4 uCh; uniform float uK; varying vec2 vUv; void main(){ float v = dot(texture2D(tSrc, vUv), uCh) * uK; gl_FragColor = vec4(vec3(v), 1.0); }`, { tSrc: tex(), uCh: { value: new THREE.Vector4(1, 0, 0, 0) }, uK: { value: 1 } });
  /* ---------- composite ---------- */
  const U = {
    tScene: tex(), tBloom: tex(), tDofA: tex(), tDofB: tex(), tDepth: { value: WHITE }, tAtmo: { value: WHITE }, tNoise: { value: NOISE }, tHgt: { value: BLACK },
    uExp: { value: 1 }, uBloom: { value: 0.6 }, uFocus: { value: 0.5 }, uBand: { value: 0.1 }, uRamp: { value: 0.34 }, uTop: { value: 1 }, uBot: { value: 0.7 },
    uVig: { value: 0.3 }, uGrain: { value: 0.02 }, uTime: { value: 0 },
    uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
    uShT: { value: new THREE.Vector3() }, uHiT: { value: new THREE.Vector3() }, uSat: { value: 1 }, uCon: { value: 1 },
    uInvProj: AU.uInvProj, uCamW: AU.uCamW, uHgt: AU.uHgt, uAtTexel: v2(),
    uMistC: { value: new THREE.Color() }, uMist: { value: new THREE.Vector4() }, uMistN: { value: new THREE.Vector4() },
    uFogC: { value: new THREE.Color() }, uMistL: { value: new THREE.Vector2(1, 0) }, uFogH: { value: new THREE.Vector3() }, uVolC: { value: new THREE.Color() }, uAOk: { value: 1 }, uVolE: { value: 0 },
    uHeat: { value: new THREE.Vector4() }, uScnSize: v2(),
  };
  const FS_COMP = `uniform sampler2D tScene, tBloom, tDofA, tDofB, tDepth, tAtmo, tNoise, tHgt; uniform vec2 uScnSize;
    uniform float uExp, uBloom, uFocus, uBand, uRamp, uTop, uBot, uVig, uGrain, uTime, uSat, uCon, uAOk, uVolE;
    uniform vec3 uLift, uGamma, uGain, uShT, uHiT, uMistC, uFogC, uFogH, uVolC; uniform vec4 uMist, uMistN, uHeat, uHgt; uniform vec2 uMistL; uniform vec2 uAtTexel; varying vec2 vUv;
    ${WPOS}
    vec3 aces(vec3 c){
      const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c = I * (c / 0.6); vec3 a = c * (c + 0.0245786) - 0.000090537; vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081; return clamp(O * (a / b), 0.0, 1.0); }
    vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    #if UPS
    // scaled scene -> full-res canvas: Catmull-Rom bicubic in 5 bilinear taps (sharper than bilinear, no ringing below 0)
    vec3 scn(vec2 uv){
      vec2 sp = uv * uScnSize, t1 = floor(sp - 0.5) + 0.5, f = sp - t1, f2 = f * f, f3 = f2 * f;
      vec2 w0 = f2 - 0.5 * (f3 + f), w1 = 1.5 * f3 - 2.5 * f2 + 1.0, w3 = 0.5 * (f3 - f2), w2 = 1.0 - w0 - w1 - w3, w12 = w1 + w2;
      vec2 t0 = (t1 - 1.0) / uScnSize, t3 = (t1 + 2.0) / uScnSize, t12 = (t1 + w2 / w12) / uScnSize;
      vec3 c = texture2D(tScene, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y) + texture2D(tScene, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y)
        + texture2D(tScene, t12).rgb * (w12.x * w12.y) + texture2D(tScene, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y) + texture2D(tScene, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
      return max(c / (w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y), 0.0);
    }
    #else
    vec3 scn(vec2 uv){ return texture2D(tScene, uv).rgb; }
    #endif
    void main(){
      vec2 uv = vUv;
      #if DEPTH
        float d = texture2D(tDepth, vUv).x; float land = step(d, 0.99995); vec3 wp = (uCamW * vec4(viewAt(vUv, d), 1.0)).xyz;
      #endif
      #if HEAT
      {   // heat shimmer: lava pixels (below the platform) + the hot glow around them
        float hm = land * smoothstep(uHeat.y + 0.3, uHeat.y - 0.05, wp.y) + min(1.0, dot(texture2D(tBloom, vUv).rgb, vec3(0.25, 0.3, 0.05))) * 0.4;
        vec2 q = vUv * vec2(uHeat.z, 1.0);
        vec2 nz = texture2D(tNoise, q * 3.1 + vec2(0.0, -uTime * 0.13)).rg + texture2D(tNoise, q * 7.3 + vec2(uTime * 0.04, -uTime * 0.31)).rg * 0.5;
        uv += (nz - 0.75) * uHeat.x * hm * vec2(1.0, 1.6);
      }
      #endif
      vec3 c = scn(uv);
      #if DOF > 0
        float dd = uv.y - uFocus; float k = (dd > 0.0 ? uTop : uBot) * smoothstep(uBand, uBand + uRamp, abs(dd));
        vec3 a = texture2D(tDofA, uv).rgb;
        #if DOF > 1
          vec3 b = texture2D(tDofB, uv).rgb;
          c = k < 0.5 ? mix(c, a, k * 2.0) : mix(a, b, k * 2.0 - 1.0);
        #else
          c = mix(c, a, k);
        #endif
      #endif
      vec3 bl = texture2D(tBloom, vUv).rgb;
      #if ATMO
      {   // 4 bilinear taps = soft upsample of the half-res AO / volumetric buffer (hides the dither)
        vec2 o = uAtTexel;
        vec3 at = (texture2D(tAtmo, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tAtmo, vUv + vec2(o.x, -o.y)).rgb + texture2D(tAtmo, vUv + vec2(-o.x, o.y)).rgb + texture2D(tAtmo, vUv + o).rgb) * 0.25;
        c *= mix(1.0, at.x, uAOk);
        // lit dust in the air: extinction along the whole path, in-scattering only where the sun reaches
        c = c * exp(-at.z * uVolE) + uVolC * at.y;
      }
      #endif
      #if MIST
      {   // height fog (smooth) + drifting ground mist (world-space noise), thickest at the terrain
        float hp = max(wp.y - groundAt(wp.xz), 0.0);
        vec2 q = wp.xz * uMistN.x + uTime * uMistN.yz;
        float n = texture2D(tNoise, q).r * 0.62 + texture2D(tNoise, q * 2.7 + vec2(0.31, 0.67) - uTime * uMistN.yz * 0.7).g * 0.38;
        float m = min(uMist.x * smoothstep(0.28, 0.78, n) * exp(-hp / uMist.y), uMist.z) * land * airAt(wp.xz);
        float f = min(uFogH.x * exp(-hp / uFogH.y), uFogH.z) * land;
        // the mist is lit by its surroundings: local (blurred) scene brightness + the bloom around fires
        #if DOF > 1
          float la = dot(texture2D(tDofB, vUv).rgb, vec3(0.2126, 0.7152, 0.0722));
        #elif DOF > 0
          float la = dot(texture2D(tDofA, vUv).rgb, vec3(0.2126, 0.7152, 0.0722));
        #else
          float la = dot(c, vec3(0.2126, 0.7152, 0.0722));
        #endif
        float lit = uMistL.x + uMistL.y * la;
        c = mix(c, uFogC * lit + bl * uMist.w, f);
        c = mix(c, uMistC * lit + bl * uMist.w, m);
      }
      #endif
      c = c * uExp + bl * uBloom;
      c = srgb(aces(c));
      c = clamp(c * uGain + uLift * (1.0 - c), 0.0, 1.0);
      c = pow(c, 1.0 / uGamma);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uCon + 0.5;
      c += uShT * (1.0 - smoothstep(0.0, 0.55, l)) + uHiT * smoothstep(0.45, 1.0, l);
      float v = smoothstep(0.28, 0.82, length(vUv - 0.5));
      c *= 1.0 - uVig * v;
      c += (hash(gl_FragCoord.xy + fract(uTime * 7.31) * vec2(113.1, 71.7)) - 0.5) * uGrain * (1.0 - l * 0.5);
      gl_FragColor = vec4(c, 1.0);
    }`;
  const COMP = {}; let mComp = null;
  function compMat(f) {
    const k = [f.DOF, f.DEPTH, f.ATMO, f.MIST, f.HEAT, f.UPS].join(''); if (COMP[k]) return COMP[k];
    return (COMP[k] = mat(FS_COMP, U, { defines: Object.assign({}, f) }));
  }
  const fsGeo = new THREE.BufferGeometry(); fsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const fsMesh = new THREE.Mesh(fsGeo, mDown); fsMesh.frustumCulled = false;
  const fsScene = new THREE.Scene(); fsScene.add(fsMesh);
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const raw = renderer.render.bind(renderer);
  function pass(m, target) { fsMesh.material = m; renderer.setRenderTarget(target); raw(fsScene, fsCam); S.stats.passes++; }
  const mk = (w, h, o = {}) => {
    const C = o.msaa && gl2 ? THREE.WebGLMultisampleRenderTarget : THREE.WebGLRenderTarget;
    const t = new C(Math.max(1, w), Math.max(1, h), { type: TYPE, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: !!o.depth, stencilBuffer: false, generateMipmaps: false });
    if (o.msaa && gl2) t.samples = o.msaa; t.texture.generateMipmaps = false;
    if (o.depthTex) { t.depthTexture = new THREE.DepthTexture(t.width, t.height, THREE.UnsignedIntType); t.depthTexture.format = THREE.DepthFormat; }
    return t;
  };
  function free() {
    for (const t of [S.scene, S.dA, S.dA2, S.dB, S.dB2, S.atmo, ...S.mips]) if (t) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); }
    S.scene = S.dA = S.dA2 = S.dB = S.dB2 = S.atmo = null; S.mips = []; S.w = S.h = 0;
  }
  const useDepth = () => depthOK && !!(GFX.preset.mist || GFX.preset.ao || GFX.preset.vol || GFX.preset.heat);
  function alloc(w, h) {
    free(); const Q = GFX.preset; S.w = w; S.h = h;
    S.scene = mk(w, h, { depth: true, msaa: Q.msaa, depthTex: useDepth() });
    let mw = w >> 1, mh = h >> 1; for (let i = 0; i < Q.bloomMips && mw >= 4 && mh >= 4; i++) { S.mips.push(mk(mw, mh)); mw >>= 1; mh >>= 1; }
    if (Q.dof > 0) { S.dA = mk(w >> 1, h >> 1); S.dA2 = mk(w >> 1, h >> 1); }
    if (Q.dof > 1) { S.dB = mk(w >> 2, h >> 2); S.dB2 = mk(w >> 2, h >> 2); }
    if (useDepth() && (Q.ao || Q.vol) && derivOK) S.atmo = mk(w >> 1, h >> 1);
  }
  function configure() {
    S.on = !!(GFX.preset.post && hdr); S.scale = S.on ? clamp(GFX.preset.scale || 1, 0.5, 1) : 1;
    free();
  }
  const _sz = new THREE.Vector2(), _p = new THREE.Vector3();
  function blur2(src, tmp, spread) {
    mBlur.uniforms.tSrc.value = src.texture; mBlur.uniforms.uDir.value.set(spread / src.width, 0); pass(mBlur, tmp);
    mBlur.uniforms.tSrc.value = tmp.texture; mBlur.uniforms.uDir.value.set(0, spread / src.height); pass(mBlur, src);
  }
  const lin = (hex, k, out) => out.set(hex).convertSRGBToLinear().multiplyScalar(k);
  // (the live look from gfx-world's WX carries the time-of-day / weather colour already linear in .lin)
  const linL = (o, hex, k, out) => o && o.lin && o.lin.isColor ? out.copy(o.lin).multiplyScalar(k) : lin(hex, k, out);
  function render() {
    S.stats.passes = 0;
    renderer.getDrawingBufferSize(_sz); const sc = S.scale, w = Math.max(1, Math.round(_sz.x * sc)), h = Math.max(1, Math.round(_sz.y * sc));
    if (w !== S.w || h !== S.h || !S.scene) alloc(w, h);
    const R = (GFX.look && GFX.wx && GFX.wx.on ? GFX.look : RL) || RLOOK.emberhold, Q = GFX.preset, B = R.bloom, G = R.grade, D = R.dof, t = typeof time === 'number' ? time : 0;
    // 1. scene -> HDR (+ resolved depth)
    renderer.setRenderTarget(S.scene); raw(scene, camera);
    const src = S.scene.texture, ac = renderer.autoClear, dtex = S.scene.depthTexture || null;
    const world = GFX.world || {}, hg = world.hgt;
    if (dtex) {
      AU.uInvProj.value.copy(camera.projectionMatrixInverse); AU.uCamW.value.copy(camera.matrixWorld); AU.uTime.value = t;
      if (hg) { AU.tHgt.value = hg.tex; AU.uHgt.value.set(1 / hg.w1, 1 / hg.h1, hg.min, hg.range); } else { AU.tHgt.value = BLACK; AU.uHgt.value.set(0, 0, cam.th || 0, 0); }
      AU.tDepth.value = dtex; U.tDepth.value = dtex; U.tHgt.value = AU.tHgt.value;
    }
    // 2. atmosphere: SSAO + volumetric light (half res)
    const vol = R.vol && Q.vol && world.shadow && world.shadow.tex ? R.vol : null, aoOn = !!(Q.ao && R.ao !== 0);
    const atmo = S.atmo && dtex && (aoOn || vol);
    if (atmo) {
      const P11 = camera.projectionMatrix.elements[5];
      AU.uAO.value.set(Q.aoRadius || 0.85, (R.ao === undefined ? 1 : R.ao) * 0.85, 0.5 * P11, 1 / camera.aspect);
      if (vol) {
        AU.tShadow.value = world.shadow.tex; AU.uShadowM.value.copy(world.shadow.mat); AU.uCamPos.value.copy(camera.position);
        AU.uVol.value.set(vol.dens, vol.top || 4, (cam.th || 0) - 0.6, vol.bias || 0.0015); AU.uVolN.value.set(vol.scale || 0.06, (vol.wind || [0.02, 0.01])[0], (vol.wind || [0.02, 0.01])[1], vol.noise === undefined ? 0.6 : vol.noise);
      }
      pass(atmoMat(aoOn ? (Q.aoN || 8) : 0, vol ? (Q.volN || 10) : 0), S.atmo);
      U.tAtmo.value = S.atmo.texture; U.uAtTexel.value.set(0.75 / S.atmo.width, 0.75 / S.atmo.height);
      U.uAOk.value = aoOn ? 1 : 0; if (vol) linL(vol, vol.col, vol.k || 1, U.uVolC.value); else U.uVolC.value.setRGB(0, 0, 0); U.uVolE.value = vol ? (vol.ext === undefined ? 1 : vol.ext) : 0;
    }
    // 3. bloom mip chain
    if (S.mips.length) {
      mPre.uniforms.tSrc.value = src; mPre.uniforms.uTexel.value.set(1 / S.w, 1 / S.h); mPre.uniforms.uExp.value = R.exposure; mPre.uniforms.uThr.value = B.threshold; mPre.uniforms.uKnee.value = B.knee;
      pass(mPre, S.mips[0]);
      for (let i = 1; i < S.mips.length; i++) { const s = S.mips[i - 1]; mDown.uniforms.tSrc.value = s.texture; mDown.uniforms.uTexel.value.set(1 / s.width, 1 / s.height); pass(mDown, S.mips[i]); }
      renderer.autoClear = false;
      for (let i = S.mips.length - 1; i > 0; i--) { const s = S.mips[i]; mUp.uniforms.tSrc.value = s.texture; mUp.uniforms.uTexel.value.set(1 / s.width, 1 / s.height); mUp.uniforms.uGain.value = 1; pass(mUp, S.mips[i - 1]); }
      renderer.autoClear = ac;
    }
    // 4. tilt-shift DOF sources
    if (S.dA) {
      mDown.uniforms.tSrc.value = src; mDown.uniforms.uTexel.value.set(1 / S.w, 1 / S.h); pass(mDown, S.dA);
      blur2(S.dA, S.dA2, (Q.dof > 2 ? 1.25 : 1.0) * sc);   // spread in texels x scale: same blur radius on screen at any scale
      if (S.dB) { mDown.uniforms.tSrc.value = S.dA.texture; mDown.uniforms.uTexel.value.set(1 / S.dA.width, 1 / S.dA.height); pass(mDown, S.dB); blur2(S.dB, S.dB2, sc); if (Q.dof > 2) blur2(S.dB, S.dB2, 1.6 * sc); }
    }
    // focus: the player's body on screen (sharp band), eased
    let fy = 0.5;
    const C = typeof ctrlHero === 'function' ? ctrlHero() : P;   // squad mode: the controlled hero (leadHero)
    if (C && started) { _p.set(C.x, groundH(C.x, C.y) + 0.9, C.y).project(camera); fy = clamp(_p.y * 0.5 + 0.5, 0.2, 0.8); }
    S.focus += (fy - S.focus) * 0.25;
    // 5. composite
    const mist = Q.mist && dtex && (R.mist || R.hfog) ? true : false, heat = Q.heat && dtex && R.heat ? true : false;
    const dof = Math.min(2, Q.dof);
    mComp = compMat({ DOF: dof, DEPTH: mist || heat ? 1 : 0, ATMO: atmo ? 1 : 0, MIST: mist ? 1 : 0, HEAT: heat ? 1 : 0, UPS: sc < 1 ? 1 : 0 });
    U.uScnSize.value.set(S.w, S.h);
    U.tScene.value = src; U.tBloom.value = S.mips.length ? S.mips[0].texture : null; U.tDofA.value = S.dA ? S.dA.texture : null; U.tDofB.value = S.dB ? S.dB.texture : null;
    U.uExp.value = R.exposure; U.uBloom.value = S.mips.length ? B.strength : 0;
    const zk = clamp(40 / cam.dist, 1, 2);   // zoomed in: keep the same world area around the player sharp
    U.uFocus.value = S.focus; U.uBand.value = D.band * zk; U.uRamp.value = D.ramp * Math.sqrt(zk); U.uTop.value = D.top; U.uBot.value = D.bottom;
    U.uVig.value = R.vignette; U.uGrain.value = R.grain; U.uTime.value = t;
    U.uLift.value.fromArray(G.lift); U.uGamma.value.fromArray(G.gamma); U.uGain.value.fromArray(G.gain); U.uShT.value.fromArray(G.shadowTint); U.uHiT.value.fromArray(G.highTint);
    U.uSat.value = G.sat; U.uCon.value = G.contrast;
    if (mist) {
      const M = R.mist || { amt: 0 }, F = R.hfog || { amt: 0 };
      linL(M, M.col || R.haze, M.k || 1, U.uMistC.value); U.uMistL.value.set(M.amb === undefined ? 1 : M.amb, M.lit || 0); U.uMist.value.set(M.amt || 0, M.h || 0.8, M.max || 0.5, M.scatter || 0);
      U.uMistN.value.set(M.scale || 0.05, (M.wind || [0.03, 0.01])[0], (M.wind || [0.03, 0.01])[1], 0);
      linL(F, F.col || R.haze, F.k || 1, U.uFogC.value); U.uFogH.value.set(F.amt || 0, F.h || 2, F.max || 0.6);
    }
    if (heat) U.uHeat.value.set(R.heat.amp || 0.004, R.heat.y === undefined ? -0.3 : R.heat.y, camera.aspect, 0);
    if (S.dbg) {
      const ch = { ao: [1, 0, 0, 0, 1], vol: [0, 1, 0, 0, 4], tau: [0, 0, 1, 0, 4], depth: [1, 0, 0, 0, 1] }[S.dbg] || [1, 0, 0, 0, 1];
      mDbg.uniforms.tSrc.value = S.dbg === 'depth' ? dtex : S.atmo ? S.atmo.texture : BLACK; mDbg.uniforms.uCh.value.set(ch[0], ch[1], ch[2], ch[3]); mDbg.uniforms.uK.value = ch[4];
      pass(mDbg, null); return;
    }
    if (!U.tBloom.value) U.tBloom.value = BLACK, U.uBloom.value = 0;
    if (!U.tDofA.value) U.tDofA.value = src; if (!U.tDofB.value) U.tDofB.value = src;
    pass(mComp, null);
  }
  // Compile this map's post programs ahead of its first frame (map entry, see mapEntryLoad in gfx-world.js): the fixed
  // passes once, the composite / atmosphere variants the current look uses, plus the variants the adaptive controller
  // steps into first (scaled scene, SSAO off). Other variants compile on first use.
  function precompile() {
    if (!S.on) return;
    const R = RL || RLOOK.emberhold, Q = GFX.preset, world = GFX.world || {}, dep = useDepth();
    const vol = !!(R.vol && Q.vol && world.shadow && SHADOW.split), aoOn = !!(Q.ao && R.ao !== 0), atmoOk = dep && derivOK && (Q.ao || Q.vol);
    const mist = !!(Q.mist && dep && (R.mist || R.hfog)), heat = !!(Q.heat && dep && R.heat), f = { DOF: Math.min(2, Q.dof), DEPTH: mist || heat ? 1 : 0, MIST: mist ? 1 : 0, HEAT: heat ? 1 : 0 };
    const atmo = atmoOk && (aoOn || vol) ? 1 : 0, list = [mPre, mDown, mUp, mBlur];
    list.push(compMat(Object.assign({ ATMO: atmo, UPS: S.scale < 1 ? 1 : 0 }, f)), compMat(Object.assign({ ATMO: atmo, UPS: 1 }, f)));
    if (atmo) {
      list.push(atmoMat(aoOn ? (Q.aoN || 8) : 0, vol ? (Q.volN || 10) : 0));
      if (aoOn && vol) list.push(atmoMat(0, Q.volN || 10));
      list.push(compMat(Object.assign({ ATMO: aoOn && vol ? 1 : 0, UPS: 1 }, f)));
    }
    const m0 = fsMesh.material;
    try { for (const m of list) { fsMesh.material = m; renderer.compile(fsScene, fsCam); } } finally { fsMesh.material = m0; }
  }
  // GPU bytes of the post targets at the current size (for GFX.memory())
  function memory() {
    let b = 0;
    for (const t of [S.scene, S.dA, S.dA2, S.dB, S.dB2, S.atmo, ...S.mips]) {
      if (!t) continue; const px = t.width * t.height, n = t.samples || 0;
      b += px * 8 * (n > 1 ? n + 1 : 1) + (t.depthBuffer ? px * 4 * Math.max(1, n) : 0) + (t.depthTexture ? px * 4 : 0);
    }
    return b;
  }
  S.raw = raw; S.render = render; S.configure = configure; S.pass = pass; S.noise = NOISE; S.precompile = precompile; S.memory = memory;
  return S;
})();
// Without half-float render targets the pipeline would band badly: fall back to direct ACES rendering.
if (!POST.hdr) for (const k in GFX_PRESETS) GFX_PRESETS[k].post = false;
GFX.composer = POST;
GFX.hooks.push(() => POST.configure());
applyQuality(); POST.configure();

// Effective 3D pixel ratio (point-sprite sizes etc.): the canvas pixel ratio times the post render scale.
(() => { const gpr = renderer.getPixelRatio.bind(renderer); renderer.getPixelRatio = () => gpr() * (POST.on ? POST.scale : 1); })();
// Draw one frame of the 3D world (with post-processing when the quality preset enables it).
// gloadReady(): false while a freshly entered map is still loading behind the fade (see mapEntryLoad in gfx-world.js);
// autoFrame(): the adaptive quality controller's frame-time sample.
function gfxPresent() {
  autoFrame();
  if (!gloadReady()) return;
  if (POST.on) POST.render();
  else { renderer.setRenderTarget(null); POST.raw(scene, camera); }
}
// Route the existing renderer.render(scene, camera) call in gfx-render.js through gfxPresent.
renderer.render = function (s, c) { if (s === scene && c === camera) return gfxPresent(); return POST.raw(s, c); };
