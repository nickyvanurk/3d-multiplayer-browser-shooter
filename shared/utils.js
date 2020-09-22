import sanitizeHtml from 'sanitize-html';

export default {
  sanitize: (string) => {
    return sanitizeHtml(string);
  }
};

