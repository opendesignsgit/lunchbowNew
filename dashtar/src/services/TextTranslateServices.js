// Third-party translation API (not the LunchBowl backend), so no auth header is sent.
const TextTranslateServices = {
  translateText: async (text, translateFrom, translateTo) => {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${translateFrom}|${translateTo}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Translation failed (${response.status})`);
    return response.json();
  },
};

export default TextTranslateServices;
