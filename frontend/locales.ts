/** The 30 languages selectable for the Steam CLIENT (Arabic is game-only). */
export const STEAM_LANGUAGES = {
  bulgarian:  { code: 'bg', label: 'Преведи постиженията', my: ['моите постижения'] },
  schinese:   { code: 'zh-CN', label: '翻译成就', my: ['我的成就'] },
  tchinese:   { code: 'zh-TW', label: '翻譯成就', my: ['我的成就'] },
  czech:      { code: 'cs', label: 'Přeložit úspěchy', my: ['moje úspěchy'] },
  danish:     { code: 'da', label: 'Oversæt præstationer', my: ['mine præstationer'] },
  dutch:      { code: 'nl', label: 'Prestaties vertalen', my: ['mijn prestaties'] },
  english:    { code: 'en', label: 'Translate achievements', my: ['my achievements'] },
  finnish:    { code: 'fi', label: 'Käännä saavutukset', my: ['omat saavutukset'] },
  french:     { code: 'fr', label: 'Traduire les succès', my: ['mes succès'] },
  german:     { code: 'de', label: 'Errungenschaften übersetzen', my: ['meine errungenschaften'] },
  greek:      { code: 'el', label: 'Μετάφραση επιτευγμάτων', my: ['τα επιτεύγματά μου'] },
  hungarian:  { code: 'hu', label: 'Teljesítmények fordítása', my: ['eredményeim'] },
  indonesian: { code: 'id', label: 'Terjemahkan pencapaian', my: ['pencapaian saya'] },
  italian:    { code: 'it', label: 'Traduci gli obiettivi', my: ['i miei achievement', 'i miei obiettivi'] },
  japanese:   { code: 'ja', label: '実績を翻訳', my: ['自分の実績'] },
  koreana:    { code: 'ko', label: '도전 과제 번역', my: ['내 도전 과제'] },
  malay:      { code: 'ms', label: 'Terjemahkan pencapaian', my: ['pencapaian saya'] },
  norwegian:  { code: 'no', label: 'Oversett prestasjoner', my: ['mine prestasjoner'] },
  polish:     { code: 'pl', label: 'Przetłumacz osiągnięcia', my: ['moje osiągnięcia'] },
  portuguese: { code: 'pt', label: 'Traduzir conquistas', my: ['minhas conquistas'] },
  brazilian:  { code: 'pt-BR', label: 'Traduzir conquistas', my: ['minhas conquistas'] },
  romanian:   { code: 'ro', label: 'Tradu realizările', my: ['realizările mele'] },
  russian:    { code: 'ru', label: 'Перевести достижения', my: ['мои достижения'] },
  spanish:    { code: 'es', label: 'Traducir logros', my: ['mis logros'] },
  latam:      { code: 'es-419', label: 'Traducir logros', my: ['mis logros'] },
  swedish:    { code: 'sv', label: 'Översätt prestationer', my: ['mina prestationer'] },
  thai:       { code: 'th', label: 'แปลความสำเร็จ', my: ['ความสำเร็จของฉัน'] },
  turkish:    { code: 'tr', label: 'Başarımları çevir', my: ['başarımlarım'] },
  ukrainian:  { code: 'uk', label: 'Перекласти досягнення', my: ['мої досягнення'] },
  vietnamese: { code: 'vi', label: 'Dịch thành tích', my: ['thành tích của tôi'] },
} as const;

export type SteamLanguage = keyof typeof STEAM_LANGUAGES;

export function getLanguage(steamCode: string | null | undefined): SteamLanguage | null {
  if (!steamCode) return null;
  const code = steamCode.toLowerCase().replace('_', '-');
  const aliases: Record<string, SteamLanguage> = {
    'zh-cn': 'schinese', 'zh-hans': 'schinese', 'zh-tw': 'tchinese', 'zh-hant': 'tchinese',
    'ko': 'koreana', 'pt-br': 'brazilian', 'es-419': 'latam', 'es-mx': 'latam',
    'nb': 'norwegian', 'nb-no': 'norwegian', 'no': 'norwegian',
  };
  if (code in aliases) return aliases[code];
  if (code in STEAM_LANGUAGES) return code as SteamLanguage;
  for (const [steamName, data] of Object.entries(STEAM_LANGUAGES)) {
    if (data.code.toLowerCase() === code) return steamName as SteamLanguage;
  }
  const base = code.split('-')[0];
  if (base !== code) return getLanguage(base);
  return null;
}

/** Label used after translation, when a click restores Steam's original texts. */
export const ORIGINAL_BUTTON_LABELS: Record<SteamLanguage, string> = {
  bulgarian: 'Покажи оригинала',
  schinese: '显示原文',
  tchinese: '顯示原文',
  czech: 'Zobrazit originál',
  danish: 'Vis original',
  dutch: 'Origineel tonen',
  english: 'Show original',
  finnish: 'Näytä alkuperäinen',
  french: 'Afficher l’original',
  german: 'Original anzeigen',
  greek: 'Εμφάνιση πρωτοτύπου',
  hungarian: 'Eredeti megjelenítése',
  indonesian: 'Tampilkan aslinya',
  italian: 'Mostra originale',
  japanese: '原文を表示',
  koreana: '원문 보기',
  malay: 'Tunjukkan asal',
  norwegian: 'Vis original',
  polish: 'Pokaż oryginał',
  portuguese: 'Mostrar original',
  brazilian: 'Mostrar original',
  romanian: 'Afișează originalul',
  russian: 'Показать оригинал',
  spanish: 'Mostrar original',
  latam: 'Mostrar original',
  swedish: 'Visa original',
  thai: 'แสดงต้นฉบับ',
  turkish: 'Orijinali göster',
  ukrainian: 'Показати оригінал',
  vietnamese: 'Hiển thị bản gốc',
};

export function originalButtonLabel(language: SteamLanguage): string {
  return ORIGINAL_BUTTON_LABELS[language];
}

export function buttonLabel(language: SteamLanguage): string {
  return STEAM_LANGUAGES[language].label;
}

export function normalizeText(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/\s+/g, ' ');
}

export const MY_TAB_NAMES = new Set<string>(
  Object.values(STEAM_LANGUAGES).flatMap(v => [...v.my].map(normalizeText)),
);
