import { formatCountdown, parsePairingCode, qrPayload, secondsLeft } from '../pairing';

describe('parsePairingCode', () => {
  it('reads our QR payload', () => {
    expect(parsePairingCode(qrPayload('ABC23X'))).toBe('ABC23X');
  });

  it('accepts a typed code in any case, with spaces or dashes', () => {
    expect(parsePairingCode(' abc 23x ')).toBe('ABC23X');
    expect(parsePairingCode('abc-23x')).toBe('ABC23X');
    expect(parsePairingCode('FOODIEMATCH:PAIR:abc23x')).toBe('ABC23X');
  });

  it('rejects look-alike characters that codes never contain', () => {
    expect(parsePairingCode('ABC0OX')).toBeNull(); // 0 and O
    expect(parsePairingCode('ABC1IL')).toBeNull(); // 1, I and L
  });

  it('rejects wrong lengths and unrelated QR codes', () => {
    expect(parsePairingCode('ABC23')).toBeNull();
    expect(parsePairingCode('ABC23XY')).toBeNull();
    expect(parsePairingCode('https://example.com/ABC23X')).toBeNull();
    expect(parsePairingCode('')).toBeNull();
  });
});

describe('secondsLeft', () => {
  const expires = '2026-09-26T10:10:00.000Z';
  const at = (iso: string) => Date.parse(iso);

  it('counts down in whole seconds, rounding up', () => {
    expect(secondsLeft(expires, at('2026-09-26T10:00:00.000Z'))).toBe(600);
    expect(secondsLeft(expires, at('2026-09-26T10:09:59.500Z'))).toBe(1);
  });

  it('is 0 once expired', () => {
    expect(secondsLeft(expires, at('2026-09-26T10:10:00.000Z'))).toBe(0);
    expect(secondsLeft(expires, at('2026-09-26T11:00:00.000Z'))).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(545)).toBe('9:05');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});
