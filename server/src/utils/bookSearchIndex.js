function buildBookSearchIndex(book = {}) {
  const values = [book.title, book.author, book.isbn].map(
    (value) => typeof value === 'string' ? value : '',
  );

  const grams = new Set();

  for (const value of values) {
    const normalized = value.toLowerCase();

    for (let i = 0; i <= normalized.length - 3; i++) {
      grams.add(normalized.slice(i, i + 3));
    }
  }

  return {
    searchNgrams: [...grams],
  };
}

function getSearchTrigrams(text) {
  if (typeof text !== 'string' || !/^[\x00-\x7F]+$/.test(text)) {
    return null;
  }

  const normalized = text.toLowerCase();

  if (normalized.length < 3) return null;

  const grams = new Set();

  for (let i = 0; i <= normalized.length - 3; i++) {
    grams.add(normalized.slice(i, i + 3));
  }

  return [...grams];
}

module.exports = {
  buildBookSearchIndex,
  getSearchTrigrams,
};
