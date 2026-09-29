'use strict';
/* =========================================================
   HD-2D post-processing (own lightweight pipeline, three r128)
   scene -> HDR target (half float, MSAA)
     -> bloom: soft-threshold prefilter + mip chain down/up (tent)
     -> tilt-shift DOF: half & quarter-res gaussian, blended by a
        screen band centred on the player (sharp) that blurs toward
        the top (far) and bottom (near) of the screen
     -> composite: exposure, ACES filmic, sRGB, per-map grade
        (lift/gamma/gain, saturation, contrast, split tone),
        vignette, subtle film grain -> canvas.
   The 2D overlay canvas (#cv) is separate and stays sharp on top.
   gfxPresent() draws a frame; renderer.render(scene, camera) is
   wrapped so existing callers go through it automatically.
   ========================================================= */
const POST = (() => {
  const gl2 = renderer.capabilities.isWebGL2, ext = renderer.extensions;
  const has = n => { try { return ext.has(n); } catch (e) { return false; } };
  const hdr = gl2 ? has('EXT_color_buffer_float') : (has('OES_texture_half_float') && has('OES_texture_half_float_linear') && has('EXT_color_buffer_half_float'));
  const TYPE = THREE.HalfFloatType;
  const S = { on: false, w: 0, h: 0, scene: null, mips: [], dA: null, dA2: null, dB: null, dB2: null, focus: 0.5, hdr, gl2 };

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
  const U = {
    tScene: tex(), tBloom: tex(), tDofA: tex(), tDofB: tex(),
    uExp: { value: 1 }, uBloom: { value: 0.6 }, uFocus: { value: 0.5 }, uBand: { value: 0.1 }, uRamp: { value: 0.34 }, uTop: { value: 1 }, uBot: { value: 0.7 },
    uVig: { value: 0.3 }, uGrain: { value: 0.02 }, uTime: { value: 0 },
    uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
    uShT: { value: new THREE.Vector3() }, uHiT: { value: new THREE.Vector3() }, uSat: { value: 1 }, uCon: { value: 1 },
  };
  const FS_COMP = `uniform sampler2D tScene, tBloom, tDofA, tDofB;
    uniform float uExp, uBloom, uFocus, uBand, uRamp, uTop, uBot, uVig, uGrain, uTime, uSat, uCon;
    uniform vec3 uLift, uGamma, uGain, uShT, uHiT; varying vec2 vUv;
    vec3 aces(vec3 c){
      const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c = I * (c / 0.6); vec3 a = c * (c + 0.0245786) - 0.000090537; vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081; return clamp(O * (a / b), 0.0, 1.0); }
    vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tScene, vUv).rgb;
      #if DOF > 0
        float d = vUv.y - uFocus; float k = (d > 0.0 ? uTop : uBot) * smoothstep(uBand, uBand + uRamp, abs(d));
        vec3 a = texture2D(tDofA, vUv).rgb;
        #if DOF > 1
          vec3 b = texture2D(tDofB, vUv).rgb;
          c = k < 0.5 ? mix(c, a, k * 2.0) : mix(a, b, k * 2.0 - 1.0);
        #else
          c = mix(c, a, k);
        #endif
      #endif
      c = c * uExp + texture2D(tBloom, vUv).rgb * uBloom;
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
  let mComp = null, compDof = -1;
  const fsGeo = new THREE.BufferGeometry(); fsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const fsMesh = new THREE.Mesh(fsGeo, mDown); fsMesh.frustumCulled = false;
  const fsScene = new THREE.Scene(); fsScene.add(fsMesh);
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const raw = renderer.render.bind(renderer);
  function pass(m, target) { fsMesh.material = m; renderer.setRenderTarget(target); raw(fsScene, fsCam); }
  const mk = (w, h, o = {}) => {
    const C = o.msaa && gl2 ? THREE.WebGLMultisampleRenderTarget : THREE.WebGLRenderTarget;
    const t = new C(Math.max(1, w), Math.max(1, h), { type: TYPE, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: !!o.depth, stencilBuffer: !!o.depth, generateMipmaps: false });
    if (o.msaa && gl2) t.samples = o.msaa; t.texture.generateMipmaps = false; return t;
  };
  function free() { for (const t of [S.scene, S.dA, S.dA2, S.dB, S.dB2, ...S.mips]) if (t) t.dispose(); S.scene = S.dA = S.dA2 = S.dB = S.dB2 = null; S.mips = []; S.w = S.h = 0; }
  function alloc(w, h) {
    free(); const Q = GFX.preset; S.w = w; S.h = h;
    S.scene = mk(w, h, { depth: true, msaa: Q.msaa });
    let mw = w >> 1, mh = h >> 1; for (let i = 0; i < Q.bloomMips && mw >= 4 && mh >= 4; i++) { S.mips.push(mk(mw, mh)); mw >>= 1; mh >>= 1; }
    if (Q.dof > 0) { S.dA = mk(w >> 1, h >> 1); S.dA2 = mk(w >> 1, h >> 1); }
    if (Q.dof > 1) { S.dB = mk(w >> 2, h >> 2); S.dB2 = mk(w >> 2, h >> 2); }
  }
  function configure() {
    S.on = !!(GFX.preset.post && hdr);
    free();
    const dof = S.on ? Math.min(2, GFX.preset.dof) : 0;
    if (dof !== compDof) { if (mComp) mComp.dispose(); mComp = mat(FS_COMP, U, { defines: { DOF: dof } }); compDof = dof; }
  }
  const _sz = new THREE.Vector2(), _p = new THREE.Vector3();
  function texel(t) { return _sz.set(1 / t.width, 1 / t.height); }
  function blur2(src, tmp, spread) {
    mBlur.uniforms.tSrc.value = src.texture; mBlur.uniforms.uDir.value.set(spread / src.width, 0); pass(mBlur, tmp);
    mBlur.uniforms.tSrc.value = tmp.texture; mBlur.uniforms.uDir.value.set(0, spread / src.height); pass(mBlur, src);
  }
  function render() {
    renderer.getDrawingBufferSize(_sz); const w = _sz.x | 0, h = _sz.y | 0;
    if (w !== S.w || h !== S.h || !S.scene) alloc(w, h);
    const R = RL || RLOOK.emberhold, Q = GFX.preset, B = R.bloom, G = R.grade, D = R.dof;
    // 1. scene -> HDR
    renderer.setRenderTarget(S.scene); raw(scene, camera);
    const src = S.scene.texture, ac = renderer.autoClear;
    // 2. bloom mip chain
    if (S.mips.length) {
      mPre.uniforms.tSrc.value = src; mPre.uniforms.uTexel.value.set(1 / S.w, 1 / S.h); mPre.uniforms.uExp.value = R.exposure; mPre.uniforms.uThr.value = B.threshold; mPre.uniforms.uKnee.value = B.knee;
      pass(mPre, S.mips[0]);
      for (let i = 1; i < S.mips.length; i++) { const s = S.mips[i - 1]; mDown.uniforms.tSrc.value = s.texture; mDown.uniforms.uTexel.value.set(1 / s.width, 1 / s.height); pass(mDown, S.mips[i]); }
      renderer.autoClear = false;
      for (let i = S.mips.length - 1; i > 0; i--) { const s = S.mips[i]; mUp.uniforms.tSrc.value = s.texture; mUp.uniforms.uTexel.value.set(1 / s.width, 1 / s.height); mUp.uniforms.uGain.value = 1; pass(mUp, S.mips[i - 1]); }
      renderer.autoClear = ac;
    }
    // 3. tilt-shift DOF sources
    if (S.dA) {
      mDown.uniforms.tSrc.value = src; mDown.uniforms.uTexel.value.set(1 / S.w, 1 / S.h); pass(mDown, S.dA);
      blur2(S.dA, S.dA2, Q.dof > 2 ? 1.25 : 1.0);
      if (S.dB) { mDown.uniforms.tSrc.value = S.dA.texture; mDown.uniforms.uTexel.value.set(1 / S.dA.width, 1 / S.dA.height); pass(mDown, S.dB); blur2(S.dB, S.dB2, 1.0); if (Q.dof > 2) blur2(S.dB, S.dB2, 1.6); }
    }
    // focus: the player's body on screen (sharp band), eased
    let fy = 0.5;
    if (P && started) { _p.set(P.x, groundH(P.x, P.y) + 0.9, P.y).project(camera); fy = clamp(_p.y * 0.5 + 0.5, 0.2, 0.8); }
    S.focus += (fy - S.focus) * 0.25;
    // 4. composite
    U.tScene.value = src; U.tBloom.value = S.mips.length ? S.mips[0].texture : null; U.tDofA.value = S.dA ? S.dA.texture : null; U.tDofB.value = S.dB ? S.dB.texture : null;
    U.uExp.value = R.exposure; U.uBloom.value = S.mips.length ? B.strength : 0;
    const zk = clamp(40 / cam.dist, 1, 2);   // zoomed in: keep the same world area around the player sharp
    U.uFocus.value = S.focus; U.uBand.value = D.band * zk; U.uRamp.value = D.ramp * Math.sqrt(zk); U.uTop.value = D.top; U.uBot.value = D.bottom;
    U.uVig.value = R.vignette; U.uGrain.value = R.grain; U.uTime.value = typeof time === 'number' ? time : 0;
    U.uLift.value.fromArray(G.lift); U.uGamma.value.fromArray(G.gamma); U.uGain.value.fromArray(G.gain); U.uShT.value.fromArray(G.shadowTint); U.uHiT.value.fromArray(G.highTint);
    U.uSat.value = G.sat; U.uCon.value = G.contrast;
    if (!U.tBloom.value) U.tBloom.value = src, U.uBloom.value = 0;
    if (!U.tDofA.value) U.tDofA.value = src; if (!U.tDofB.value) U.tDofB.value = src;
    pass(mComp, null);
  }
  S.raw = raw; S.render = render; S.configure = configure; S.pass = pass;
  return S;
})();
// Without half-float render targets the pipeline would band badly: fall back to direct ACES rendering.
if (!POST.hdr) for (const k in GFX_PRESETS) GFX_PRESETS[k].post = false;
GFX.composer = POST;
GFX.hooks.push(() => POST.configure());
applyQuality(); POST.configure();

// Draw one frame of the 3D world (with post-processing when the quality preset enables it).
function gfxPresent() {
  if (POST.on) POST.render();
  else { renderer.setRenderTarget(null); POST.raw(scene, camera); }
}
// Route the existing renderer.render(scene, camera) call in gfx-render.js through gfxPresent.
renderer.render = function (s, c) { if (s === scene && c === camera) return gfxPresent(); return POST.raw(s, c); };
