import { describe, it, expect } from 'vitest';
import { cleanName, validName, ipBucket, readJson } from '../worker/util';

describe('names in emails', () => {
  it('allows real names in any language', () => {
    for (const n of ['Katie', 'Mary-Jane', "O'Brien", 'José', 'Zoë Kravitz', '山田', 'Наташа', 'D’Angelo']) expect(validName(cleanName(n))).toBe(true);
  });
  it('blocks links, emails, numbers and markup (phishing through our emails)', () => {
    for (const n of ['PayPal Security: verify at evil.com', 'evil.com', 'me@example.com', 'Call 555-0100', '<b>hi</b>', 'https://x.co', 'a'.repeat(41), '-dash', '']) expect(validName(cleanName(n))).toBe(false);
  });
});

describe('rate-limit buckets', () => {
  it('groups an IPv6 household by its /64, keeps IPv4 as is', () => {
    expect(ipBucket('2001:db8:1:2:aaaa::1')).toBe(ipBucket('2001:db8:1:2:ffff::9'));
    expect(ipBucket('2001:db8:1:3::1')).not.toBe(ipBucket('2001:db8:1:2::1'));
    expect(ipBucket('203.0.113.7')).toBe('203.0.113.7');
  });
});

describe('request bodies', () => {
  const req = (body: string) => new Request('https://flappymail.net/api/letters', { method: 'POST', body });
  it('reads small JSON and refuses oversized or broken bodies', async () => {
    expect(await readJson(req('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJson(req('x'.repeat(30_000)))).toBeNull();
    expect(await readJson(req('{oops'))).toBeNull();
  });
});
