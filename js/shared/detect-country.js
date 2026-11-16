// Which country the map opens on.
//
// Order: #dk in the address, then the browser's time zone, then its language, then Cyprus.
// English is skipped because it says nothing about where someone is.

const BY_TIME_ZONE = {'Europe/Copenhagen':'dk','Europe/Stockholm':'se','Europe/Oslo':'no','Europe/Helsinki':'fi','Atlantic/Reykjavik':'is','Europe/London':'gb','Europe/Dublin':'ie',
    'Europe/Amsterdam':'nl','Europe/Brussels':'be','Europe/Luxembourg':'lu','Europe/Paris':'fr','Europe/Monaco':'mc','Europe/Berlin':'de','Europe/Busingen':'de','Europe/Zurich':'ch','Europe/Vienna':'at',
    'Europe/Andorra':'ad','Europe/Madrid':'es','Atlantic/Canary':'es','Europe/Lisbon':'pt','Atlantic/Madeira':'pt','Atlantic/Azores':'pt','Europe/Rome':'it','Europe/San_Marino':'sm','Europe/Malta':'mt',
    'Europe/Athens':'gr','Asia/Nicosia':'cy','Europe/Nicosia':'cy','Asia/Famagusta':'cy','Europe/Istanbul':'tr','Asia/Istanbul':'tr','Europe/Sofia':'bg','Europe/Bucharest':'ro','Europe/Chisinau':'md',
    'Europe/Kyiv':'ua','Europe/Kiev':'ua','Europe/Uzhgorod':'ua','Europe/Zaporozhye':'ua','Europe/Minsk':'by','Europe/Moscow':'ru','Europe/Kaliningrad':'ru','Europe/Samara':'ru','Europe/Volgograd':'ru',
    'Europe/Tallinn':'ee','Europe/Riga':'lv','Europe/Vilnius':'lt','Europe/Warsaw':'pl','Europe/Prague':'cz','Europe/Bratislava':'sk','Europe/Budapest':'hu','Europe/Ljubljana':'si','Europe/Zagreb':'hr',
    'Europe/Sarajevo':'ba','Europe/Belgrade':'rs','Europe/Podgorica':'me','Europe/Skopje':'mk','Europe/Tirane':'al','Asia/Tbilisi':'ge','Asia/Yerevan':'am','Asia/Baku':'az',
    'Asia/Jerusalem':'il','Asia/Tel_Aviv':'il','Africa/Casablanca':'ma'};

const BY_LANGUAGE = {da:'dk',sv:'se',nb:'no',nn:'no',no:'no',fi:'fi',is:'is',et:'ee',lv:'lv',lt:'lt',pl:'pl',cs:'cz',sk:'sk',hu:'hu',sl:'si',hr:'hr',sr:'rs',bs:'ba',mk:'mk',sq:'al',
    el:'gr',tr:'tr',bg:'bg',ro:'ro',uk:'ua',be:'by',ka:'ge',hy:'am',az:'az',he:'il',mt:'mt',ru:'ru',ga:'ie',lb:'lu',ca:'ad',it:'it',es:'es',pt:'pt',nl:'nl',fr:'fr',de:'de'};

// Newer time-zone data folds some zones together (Copenhagen, Oslo and Stockholm into Berlin,
// Amsterdam and Luxembourg into Brussels, Monaco into Paris). If the language points to one
// of the folded countries, believe the language.
const FOLDED_INTO = { de: ['dk', 'no', 'se'], be: ['nl', 'lu'], fr: ['mc'] };

const FALLBACK = 'cy';

export function countryFromHash(known) {
  const id = location.hash.slice(1).toLowerCase();
  return known.has(id) ? id : null;
}

/** @param {Set<string>} known country ids in the data */
export function detectCountry(known) {
  const fromHash = countryFromHash(known);
  if (fromHash) return fromHash;

  let zone = '';
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* very old browsers */ }
  const fromZone = BY_TIME_ZONE[zone] || (zone.startsWith('Australia/') ? 'au' : null);

  let fromLanguage = null;
  for (const tag of navigator.languages?.length ? navigator.languages : [navigator.language || '']) {
    const [language, region] = tag.toLowerCase().split('-');
    if (language === 'en') continue;
    if (region && known.has(region)) { fromLanguage = region; break; }
    if (BY_LANGUAGE[language]) { fromLanguage = BY_LANGUAGE[language]; break; }
  }

  if (fromZone && fromLanguage && FOLDED_INTO[fromZone]?.includes(fromLanguage)) return fromLanguage;
  return fromZone || fromLanguage || FALLBACK;
}
