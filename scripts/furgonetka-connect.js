#!/usr/bin/env node
/**
 * Refume: connects the Refume account on Furgonetka.pl (once per environment).
 *
 *   node scripts/furgonetka-connect.js
 *
 * Asks for the login and password of the Furgonetka account in the terminal (the password is
 * not shown and not saved anywhere). Furgonetka gives back a token, which is saved encrypted in
 * the Refume database; the server refreshes it by itself from then on. Needs in .env:
 * DATABASE_URL, FURGONETKA_ENV, FURGONETKA_CLIENT_ID, FURGONETKA_CLIENT_SECRET.
 *
 * Run it again only when the server says the connection is gone. Each login opens one of the
 * 20 sessions Furgonetka allows per application.
 */
const path = require('path');
const readline = require('readline');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const furgonetka = require('../server/api-util/furgonetka');
const { isDbConfigured } = require('../server/api-util/refumeDb');

const ask = (question, { hidden = false } = {}) =>
  new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Print the question, then hide what's typed
      rl._writeToOutput = text => {
        if (text.includes(question)) rl.output.write(text);
        else if (text === '\r\n' || text === '\n') rl.output.write(text);
      };
    }
    rl.question(question, answer => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });

(async () => {
  if (!isDbConfigured()) {
    console.error('Brak DATABASE_URL w .env albo paczki pg (uruchom yarn install).');
    process.exit(1);
  }
  if (!process.env.FURGONETKA_CLIENT_ID || !process.env.FURGONETKA_CLIENT_SECRET) {
    console.error('Brak FURGONETKA_CLIENT_ID lub FURGONETKA_CLIENT_SECRET w .env.');
    process.exit(1);
  }
  console.log(`Łączenie konta Refume z Furgonetką (${furgonetka.env()}: ${furgonetka.panelUrl()})`);
  const login = await ask('Login (e-mail) do Furgonetki: ');
  const password = await ask('Hasło (nie będzie widoczne): ', { hidden: true });
  try {
    await furgonetka.connectWithPassword(login, password);
  } catch (e) {
    if (e.data?.error === '2fa_required' && e.data?.hint) {
      const code = await ask('Kod z aplikacji do weryfikacji dwuetapowej: ');
      await furgonetka.connectWithTwoFactor(e.data.hint, login, code);
    } else {
      console.error(`Nie udało się połączyć: ${e.message}`);
      process.exit(1);
    }
  }
  const services = await furgonetka.listServices();
  console.log('Połączono. Przewoźnicy na koncie:');
  services.forEach(s => console.log(`  - ${s.service} (id ${s.id}${s.owner ? `, ${s.owner}` : ''}): ${s.name || ''}`));
  process.exit(0);
})().catch(e => {
  console.error(`Błąd: ${e.message}`);
  process.exit(1);
});
