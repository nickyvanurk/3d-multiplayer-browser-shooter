import sanitizeHtml from 'sanitize-html';

export default {
  sanitize: (string) => {
    return sanitizeHtml(string);
  },

  random: (range) => {
    return Math.floor(Math.random() * range);
  }
};

