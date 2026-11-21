'use strict';
const sanitizeHtml = require('sanitize-html');

// Rich text editors in the admin produce HTML. It is ALWAYS sanitised on save with this allow-list.
const RICH = {
  allowedTags: ['p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'iframe', 'code', 'pre'],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'width', 'height', 'loading', 'title'],
    iframe: ['src', 'width', 'height', 'title', 'allowfullscreen', 'loading'], th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'],
    '*': ['class'],
  },
  allowedClasses: { '*': ['lead', 'note', 'text-center', 'btn', 'btn-primary', 'btn-outline', 'table-wrap'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  allowedIframeHostnames: ['www.youtube-nocookie.com', 'www.youtube.com', 'www.google.com', 'drive.google.com'],
  transformTags: {
    a: (tag, attribs) => {
      const out = { ...attribs };
      if (out.target === '_blank') out.rel = 'noopener noreferrer';
      else delete out.target;
      return { tagName: 'a', attribs: out };
    },
    img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy' } }),
  },
  disallowedTagsMode: 'discard',
};

const rich = (html) => sanitizeHtml(String(html || '').slice(0, 200000), RICH);
const plain = (s) => sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} });
module.exports = { rich, plain };
