import { describe, it, expect } from 'vitest';
import { departureEmail, arrivalEmail, deliveredEmail, lostEmail, Mail } from '../worker/email';

const site = 'https://flappymail.net';
const all = (bottle: boolean): Mail[] => [
  departureEmail({ to: 'katie@example.com', carrierName: 'Sir Pickles', bottle, recipient: 'Maya', fromCity: 'San Francisco', toCity: 'London', eta: 'about 9 days, 4 hours', trackingUrl: `${site}/?t=TRACK` }),
  arrivalEmail({ to: 'maya@example.com', carrierName: 'Sir Pickles', bottle, senderFirst: 'Katie', recipientFirst: 'Maya', letterUrl: `${site}/l/LETTER`, blockUrl: `${site}/block/LETTER` }),
  deliveredEmail({ to: 'katie@example.com', carrierName: 'Sir Pickles', bottle, recipientFirst: 'Maya', toCity: 'London', tripText: '9 days, 4 hours', trackingUrl: `${site}/?t=TRACK` }),
  lostEmail({ to: 'katie@example.com', carrierName: 'Sir Pickles', bottle, recipientFirst: 'Maya', reasonText: 'got distracted by a dropped sandwich', resendUrl: `${site}/send.html?resend=TRACK`, trackingUrl: `${site}/?t=TRACK` }),
];

describe('emails', () => {
  it('match the spec subjects', () => {
    const [dep, arr, del, lost] = all(false);
    expect(dep.subject).toBe('Sir Pickles has taken off with your letter');
    expect(arr.subject).toBe('A pigeon named Sir Pickles just landed on your windowsill');
    expect(del.subject).toBe('Your letter to Maya was delivered');
    expect(lost.subject).toBe('Uh oh. Sir Pickles got distracted by a dropped sandwich');
    expect(all(true)[1].subject).toBe('A bottle washed up on your shore');
  });

  it('always have a plain-text version and the right links', () => {
    for (const bottle of [false, true]) {
      const [dep, arr, del, lost] = all(bottle);
      for (const m of [dep, arr, del, lost]) { expect(m.text.length).toBeGreaterThan(50); expect(m.html).toContain('FLAPPY MAIL'); }
      expect(dep.text).toContain(`${site}/?t=TRACK`);
      expect(arr.text).toContain(`${site}/l/LETTER`);
      expect(del.text).toContain(`${site}/?t=TRACK`);
      expect(lost.text).toContain('resend=TRACK');
    }
  });

  it('give the recipient a one-click way to stop birds', () => {
    const arr = all(false)[1];
    expect(arr.text).toContain(`${site}/block/LETTER`);
    expect(arr.html).toContain("Don't send me birds");
    expect(arr.headers?.['List-Unsubscribe']).toBe(`<${site}/block/LETTER>`);
    expect(arr.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('use only the sender first name for the recipient and never mention a loss before sending', () => {
    const arr = all(false)[1];
    expect(arr.text).toContain('from Katie');
    for (const m of all(false).slice(0, 3)) expect(m.text.toLowerCase()).not.toMatch(/lost|16%|chance/);
  });

  it('escape names in HTML', () => {
    const m = deliveredEmail({ to: 'x@example.com', carrierName: 'Sir Pickles', bottle: false, recipientFirst: '<b>Maya</b>', toCity: 'London', tripText: '2 days', trackingUrl: `${site}/?t=T` });
    expect(m.html).not.toContain('<b>Maya</b>');
    expect(m.html).toContain('&lt;b&gt;Maya&lt;/b&gt;');
  });
});
