/* Uebungsportal - gemeinsame Hilfsfunktionen.
   Der Zustand liegt in localStorage; damit verhaelt sich das Portal wie eine
   echte Anwendung mit Sitzung und dauerhaften Datensaetzen. */

const ANTRAEGE = [
  { nr: 'A-10001', wer: 'Meier, Anna',   ks: '4711', betrag: '1.240,00' },
  { nr: 'A-10002', wer: 'Schulz, Bernd', ks: '4711', betrag: '380,50' },
  { nr: 'A-10003', wer: 'Yilmaz, Cem',   ks: '4712', betrag: '2.905,00' },
  { nr: 'A-10004', wer: 'Nowak, Dorota', ks: '4712', betrag: '77,90' },
  { nr: 'A-10005', wer: 'Fischer, Erik', ks: '4713', betrag: '1.010,00' },
  { nr: 'A-10006', wer: 'Braun, Frieda', ks: '4713', betrag: '640,00' },
  { nr: 'A-10007', wer: 'Gruber, Georg', ks: '4714', betrag: '3.150,75' },
  { nr: 'A-10008', wer: 'Horn, Heike',   ks: '4714', betrag: '212,40' }
];

const angemeldet = () => localStorage.getItem('uebung.sitzung') === 'ja';

function sitzungPruefen() {
  if (!angemeldet()) { location.href = 'index.html'; return false; }
  return true;
}

const freigaben = () => JSON.parse(localStorage.getItem('uebung.freigaben') || '{}');

function freigeben(nr, vermerk) {
  const f = freigaben();
  f[nr] = { zeit: new Date().toISOString(), vermerk: vermerk || '' };
  localStorage.setItem('uebung.freigaben', JSON.stringify(f));
}

const parameter = name => new URLSearchParams(location.search).get(name);

function kopfZeichnen() {
  document.querySelector('.wer').textContent = angemeldet() ? 'Angemeldet: P. Bearbeiter' : 'Nicht angemeldet';
}
