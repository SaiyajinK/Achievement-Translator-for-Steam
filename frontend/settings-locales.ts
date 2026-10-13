import type { SteamLanguage } from './locales';

/** Text of the Millennium sidebar, translated to all 30 Steam client languages. */
export const SETTINGS_DESCRIPTIONS: Record<SteamLanguage, string> = {
  bulgarian: 'Добавя бутон „Преведи постиженията“ в изскачащия прозорец, който превежда имената и описанията на постиженията на езика на Steam клиента.',
  schinese: '在弹出窗口中添加“翻译成就”按钮，可将成就名称和描述翻译为 Steam 客户端的语言。',
  tchinese: '在彈出視窗中新增「翻譯成就」按鈕，可將成就名稱和說明翻譯成 Steam 用戶端的語言。',
  czech: 'Do vyskakovacího okna přidá tlačítko „Přeložit úspěchy“, které přeloží názvy a popisy úspěchů do jazyka klienta Steam.',
  danish: 'Tilføjer knappen "Oversæt præstationer" i pop op-vinduet, så præstationernes navne og beskrivelser kan oversættes til Steam-klientens sprog.',
  dutch: 'Voegt een knop "Prestaties vertalen" toe aan het pop-upvenster om namen en beschrijvingen van prestaties naar de taal van de Steam-client te vertalen.',
  english: 'Adds a "Translate achievements" button to the popup that translates achievement names and descriptions into the Steam client language.',
  finnish: 'Lisää ponnahdusikkunaan ”Käännä saavutukset” -painikkeen, jolla saavutusten nimet ja kuvaukset voi kääntää Steam-asiakasohjelman kielelle.',
  french: 'Ajoute un bouton "Traduire les succès" dans la popup qui permet de traduire les noms et les descriptions des succès dans la langue du client Steam.',
  german: 'Fügt dem Pop-up die Schaltfläche „Errungenschaften übersetzen“ hinzu, um Namen und Beschreibungen der Errungenschaften in die Sprache des Steam-Clients zu übersetzen.',
  greek: 'Προσθέτει ένα κουμπί «Μετάφραση επιτευγμάτων» στο αναδυόμενο παράθυρο, για τη μετάφραση των ονομάτων και περιγραφών στη γλώσσα του Steam.',
  hungarian: 'A felugró ablakhoz hozzáad egy „Teljesítmények fordítása” gombot, amely a teljesítmények nevét és leírását a Steam-kliens nyelvére fordítja.',
  indonesian: 'Menambahkan tombol "Terjemahkan pencapaian" ke jendela pop-up untuk menerjemahkan nama dan deskripsi pencapaian ke bahasa klien Steam.',
  italian: 'Aggiunge un pulsante "Traduci gli obiettivi" nel popup per tradurre nomi e descrizioni degli obiettivi nella lingua del client Steam.',
  japanese: 'ポップアップに「実績を翻訳」ボタンを追加し、実績の名前と説明をSteamクライアントの言語に翻訳できるようにします。',
  koreana: '팝업에 "도전 과제 번역" 버튼을 추가하여 도전 과제 이름과 설명을 Steam 클라이언트 언어로 번역합니다.',
  malay: 'Menambah butang "Terjemahkan pencapaian" dalam tetingkap timbul untuk menterjemah nama dan penerangan pencapaian ke bahasa klien Steam.',
  norwegian: 'Legger til en «Oversett prestasjoner»-knapp i popup-vinduet som oversetter navn og beskrivelser av prestasjoner til Steam-klientens språk.',
  polish: 'Dodaje przycisk „Przetłumacz osiągnięcia” do wyskakującego okna, który tłumaczy nazwy i opisy osiągnięć na język klienta Steam.',
  portuguese: 'Adiciona o botão "Traduzir conquistas" à janela pop-up para traduzir os nomes e as descrições das conquistas para o idioma do cliente Steam.',
  brazilian: 'Adiciona o botão "Traduzir conquistas" à janela pop-up para traduzir os nomes e as descrições das conquistas para o idioma do cliente Steam.',
  romanian: 'Adaugă un buton „Tradu realizările” în fereastra pop-up, care traduce numele și descrierile realizărilor în limba clientului Steam.',
  russian: 'Добавляет кнопку «Перевести достижения» во всплывающее окно для перевода названий и описаний достижений на язык клиента Steam.',
  spanish: 'Añade un botón «Traducir logros» a la ventana emergente para traducir los nombres y las descripciones de los logros al idioma del cliente de Steam.',
  latam: 'Agrega un botón «Traducir logros» a la ventana emergente para traducir los nombres y las descripciones de los logros al idioma del cliente de Steam.',
  swedish: 'Lägger till knappen ”Översätt prestationer” i popup-fönstret för att översätta prestationernas namn och beskrivningar till Steam-klientens språk.',
  thai: 'เพิ่มปุ่ม "แปลความสำเร็จ" ในหน้าต่างป๊อปอัป เพื่อแปลชื่อและคำอธิบายความสำเร็จเป็นภาษาของไคลเอนต์ Steam',
  turkish: 'Açılır pencereye "Başarımları çevir" düğmesi ekleyerek başarım adlarını ve açıklamalarını Steam istemcisinin diline çevirir.',
  ukrainian: 'Додає кнопку «Перекласти досягнення» у спливному вікні для перекладу назв і описів досягнень мовою клієнта Steam.',
  vietnamese: 'Thêm nút "Dịch thành tích" vào cửa sổ bật lên để dịch tên và mô tả thành tích sang ngôn ngữ của ứng dụng Steam.',
};

export const settingsDescription = (language: SteamLanguage): string => SETTINGS_DESCRIPTIONS[language];
