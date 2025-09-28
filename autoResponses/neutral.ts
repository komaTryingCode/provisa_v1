// Bilingual (UZ + RU) messages used before language selection

export const neutral = {
  greeting: (name?: string) => {
    const nameUz = name ? ` ${name}` : "";
    const nameRu = name ? `, ${name}` : "";

    return `Salom${nameUz}! Green Card 2026 bo'yicha bepul konsultatsiyaga xush kelibsiz.
Здравствуйте${nameRu}! Добро пожаловать на бесплатную консультацию по Green Card 2026.`;
  },

  selectLanguage: `Tilni tanlang / Выберите язык:`,

  languageButtons: {
    uz: "🇺🇿 O'zbek",
    ru: "🇷🇺 Русский",
    kk: "🇰🇿 Qaraqalpaqsha"
  },

  reminderLanguage: `Iltimos, quyidagi tugmalardan birini bosib tilni tanlang 👇
Пожалуйста, выберите язык, нажав на одну из кнопок ниже 👇`
};