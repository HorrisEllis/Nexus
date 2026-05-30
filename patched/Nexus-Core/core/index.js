// core/index.js — shared singletons
'use strict';
const { fileStore, fileRefs, store } = require('./index/query');
module.exports = { fileStore, fileRefs, store: { fileStore, fileRefs } };
