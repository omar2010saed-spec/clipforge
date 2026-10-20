import { encodeWav, sfxDurationMs, SFX_IDS, SAMPLE_RATE, synthesize, toBase64 } from '../src/sfx/synth';

describe('sfx synth', () => {
  it('every effect is audible, bounded and between 0.05 and 2.5 seconds', () => {
    for (const id of SFX_IDS) {
      const s = synthesize(id);
      const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(peak > 0.3 && peak <= 0.9).toBe(true);
      const ms = sfxDurationMs(id);
      expect(ms >= 50 && ms <= 2500).toBe(true);
      expect(s.every((v) => Number.isFinite(v))).toBe(true);
    }
  });
  it('is deterministic', () => {
    expect(synthesize('applause').slice(1000, 1010)).toEqual(synthesize('applause').slice(1000, 1010));
  });
  it('writes a valid wav header', () => {
    const wav = encodeWav(synthesize('pop'));
    const text = (a: number, b: number) => String.fromCharCode(...Array.from(wav.slice(a, b)));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 12)).toBe('WAVE');
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(wav.length).toBe(44 + synthesize('pop').length * 2);
  });
  it('base64 matches the reference encoder', () => {
    expect(toBase64(new Uint8Array([102, 111, 111, 98, 97]))).toBe('Zm9vYmE=');
    expect(toBase64(new Uint8Array([]))).toBe('');
    expect(toBase64(new Uint8Array([255]))).toBe('/w==');
  });
});
