// ==UserScript==
// @name         Yun OJ Better
// @namespace    https://github.com/ojbetter
// @version      1.8.0
// @description  通用 OJ 增强：AI 解答（KaTeX + 思考过程 + 连接状态 + 断线恢复）、原题机搜索、智谱联网搜索、自动翻译、样例复制、复制题面、深色模式、快速跳转、手动配置 OJ、多套 AI 配置、自定义翻译
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // 工具函数
  // ============================================================
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const el = (t, a, x) => { const n = document.createElement(t); if (a) for (const k in a) k === 'class' ? n.className = a[k] : n.setAttribute(k, a[k]); if (x != null) n.textContent = x; return n; };
  const copy = (s, cb) => { const f = () => { const ta = el('textarea'); ta.value = s; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); cb && cb(); }; if (navigator.clipboard) navigator.clipboard.writeText(s).then(() => cb && cb(), f); else f(); };
  const escapeHtml = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fmtBytes = n => n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB';
  const fmtSec = ms => (ms / 1000).toFixed(1) + 's';

  // ============================================================
  // 存储
  // ============================================================
  const K = 'yunoj.', D = {
    dark: false, sample: true, origin: true, statement: true, search: true, translate: true, ai: true,
    barCollapsed: false, searchSource: 'yuantiji', translateTarget: 'zh-CN', userOJs: '{}',
    zhipuEngine: 'search_pro',
    // 翻译配置
    translateProvider: 'google',
    customTransUrl: '',
    customTransMethod: 'POST',
    customTransHeaders: '{\n  "Content-Type": "application/json",\n  "Authorization": "Bearer sk-..."\n}',
    customTransBody: '{\n  "model": "glm-4-flash",\n  "messages": [\n    {"role": "user", "content": "Translate the following text to {{target}}. Only output the translated text, no explanation.\\n\\n{{text}}"}\n  ]\n}',
    customTransExtract: 'choices[0].message.content',
    
    aiBase: 'https://api.deepseek.com/v1', aiKey: '', aiModel: 'deepseek-chat',
    aiSystem: '你是一名信息学竞赛教练。请根据题目给出：1) 简洁的思路分析；2) C++17 完整可运行代码；3) 时间复杂度。用中文回答，代码用 ```cpp 包裹。',
    aiProfiles: '[]', aiActiveProfile: 0,
    posBar: null, posSearch: null, posFab: null, posPanel: null, posTrans: null, posReentry: null, posOjConfig: null, posAi: null, posAiCfg: null,
  };
  const get = k => { try { return typeof GM_getValue === 'function' ? GM_getValue(K + k, D[k]) : D[k]; } catch (e) { return D[k]; } };
  const set = (k, v) => { try { if (typeof GM_setValue === 'function') GM_setValue(K + k, v); } catch (e) {} };
  const prefKey = () => 'pref_' + location.hostname;
  const autoKey = () => 'autoDetected_' + location.hostname;
  const getPref = () => get(prefKey());
  const setPref = v => set(prefKey(), v);
  function getUserOJs() { try { return JSON.parse(get('userOJs') || '{}'); } catch (e) { return {}; } }
  function saveUserOJs(obj) { set('userOJs', JSON.stringify(obj)); }

  // ============================================================
  // 多套 AI 配置
  // ============================================================
  function defaultAIProfile(name) {
    return { name: name || '默认配置', base: get('aiBase') || D.aiBase, key: get('aiKey') || '', model: get('aiModel') || D.aiModel, system: get('aiSystem') || D.aiSystem };
  }
  function getAIProfiles() {
    let arr = [];
    try { arr = JSON.parse(get('aiProfiles') || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr) || arr.length === 0) { arr = [defaultAIProfile('默认配置')]; set('aiProfiles', JSON.stringify(arr)); }
    return arr;
  }
  function saveAIProfiles(arr) { set('aiProfiles', JSON.stringify(arr)); }
  function getActiveAIProfile() {
    const profiles = getAIProfiles();
    let i = parseInt(get('aiActiveProfile') || 0, 10);
    if (!(i >= 0 && i < profiles.length)) i = 0;
    return profiles[i];
  }

  // ============================================================
  // OJ 配置表
  // ============================================================
  const OJ_CONFIG = {
    'xinyoudui.com': {
      name: 'XYDOJ',
      getCode: () => (location.pathname.match(/\/problem\/(\d+)/) || [])[1] || null,
      getTitle: () => { const n = $('._overview_yuqeq_42 h4') || $('h1') || $('h2'); return n ? n.textContent.trim().replace(/^\d+\s*[.、:\-—]\s*/, '').trim() : null; },
      statements: ['.x-star-editor-md-viewer._viewer_8kj2i_43', '._problemDescription_8kj2i_42', '.x-star-editor-md-viewer'],
      removeSelectors: ['._overview_yuqeq_42', '.ac-ant-tabs-nav', '.x-star-design-feedbackContainer'],
    },
    'luogu.com.cn': {
      name: '洛谷',
      getCode: () => (location.pathname.match(/\/problem\/([A-Za-z0-9_]+)/) || [])[1] || null,
      getTitle: () => {
        const sels = ['h1', 'h2.title', '.title', '.problem-title', '#problem-title', '.lfe-article h1', '.lfe-article h2'];
        for (const sel of sels) {
          const n = $(sel);
          if (n) {
            let t = n.textContent.trim();
            t = t.replace(/^[A-Z]+\d+[A-Za-z_0-9]*\s*/, '').trim();
            if (t && t.length < 200) return t;
          }
        }
        return document.title.replace(/\s*-\s*洛谷.*$/, '').trim();
      },
      statements: [
        '.problem-statement',
        '#problem-statement',
        '.lfe-article',
        '.markdown-body',
        '.card .content',
        '.problem-content',
        '.content',
        'article',
        'main'
      ],
      removeSelectors: [
        'nav', 'header', 'footer', '.side', '.tags', '.status', '.lg-article-tools',
        '.lfe-header', '.lfe-sidebar', '.operation', '.problem-tags', '.problem-status',
        '.problem-sidebar', '.problem-header', '.breadcrumb', '.pagination'
      ],
    },
    'codeforces.com': {
      name: 'Codeforces',
      getCode: () => {
        const m = location.pathname.match(/\/problemset\/problem\/(\d+)\/([A-Za-z]\d*)/) || location.pathname.match(/\/contest\/(\d+)\/problem\/([A-Za-z]\d*)/) || location.pathname.match(/\/gym\/(\d+)\/problem\/([A-Za-z]\d*)/);
        return m ? m[1] + m[2].toUpperCase() : null;
      },
      getTitle: () => { const t = $('.problem-statement .header .title'); return t ? t.textContent.replace(/^[A-Z]\d?\.\s*/, '').trim() : null; },
      statements: ['.problem-statement'],
      removeSelectors: ['.header', '.input-file', '.output-file', '.time-limit', '.memory-limit', '.property-title'],
    },
    'atcoder.jp': {
      name: 'AtCoder',
      getCode: () => { const m = location.pathname.match(/\/tasks\/([^/?#]+)/); return m ? m[1].toUpperCase() : null; },
      getTitle: () => { const n = $('#task-statement .h2, .h2'); return n ? n.textContent.trim() : document.title.replace(/\s*-\s*AtCoder.*$/, '').trim(); },
      statements: ['#task-statement', '.lang-en .part', '.part'],
      removeSelectors: ['nav', 'header', 'footer', '.col-sm-3'],
    },
    'vjudge.net': {
      name: 'VJudge',
      getCode: () => { const m = location.pathname.match(/\/problem\/([^/?#]+)/); return m ? decodeURIComponent(m[1]) : null; },
      getTitle: () => { const n = $('h1, .problem-title'); return n ? n.textContent.trim() : null; },
      statements: ['#problem-statement', '.problem-statement', '.problem-content'],
      removeSelectors: ['#problem-info', '.vj-page-header', '.problem-info-container'],
    },
    'nowcoder.com': {
      name: 'Nowcoder',
      getCode: () => { const m = location.pathname.match(/\/(?:acm\/contest\/\d+\/|problem\/)([^/?#]+)/); return m ? m[1] : null; },
      getTitle: () => { const n = $('.subject-title, h1, h2'); return n ? n.textContent.replace(/^[A-Z0-9]+\.\s*/, '').trim() : null; },
      statements: ['.subject-question', '.problem-content', '.nc-post-content'],
      removeSelectors: ['.subject-title', '.subject-tab', '.problem-tab'],
    },
    'hdu.edu.cn': {
      name: 'HDU',
      getCode: () => new URLSearchParams(location.search).get('pid'),
      getTitle: () => { const n = $('h1'); return n ? n.textContent.replace(/^Problem\s+\d+\s+/i, '').trim() : null; },
      statements: ['.problem-content', '.plm', 'body'],
      removeSelectors: ['h1', '.panel_title'],
    },
    'poj.org': {
      name: 'POJ',
      getCode: () => new URLSearchParams(location.search).get('id'),
      getTitle: () => { const n = $('.ptt'); return n ? n.textContent.trim() : null; },
      statements: ['.plm', 'body'],
      removeSelectors: ['.ptt', '.pst', '.pg'],
    },
    'loj.ac': {
      name: 'LibreOJ',
      getCode: () => (location.pathname.match(/\/p\/([^/?#]+)/) || [])[1] || null,
      getTitle: () => { const n = $('h1, .problem-title'); return n ? n.textContent.replace(/^#?\d+\s*/, '').trim() : null; },
      statements: ['.markdown-body', '.problem-content', '.content'],
      removeSelectors: ['nav', 'header', 'footer', '.side'],
    },
    'uoj.ac': {
      name: 'UniversalOJ',
      getCode: () => (location.pathname.match(/\/problem\/(\d+)/) || [])[1] || null,
      getTitle: () => { const n = $('h1, .uoj-content h1'); return n ? n.textContent.trim() : null; },
      statements: ['#problem-content', '.uoj-content .card', '.uoj-article'],
      removeSelectors: ['nav', 'header', 'footer'],
    },
    'spoj.com': {
      name: 'SPOJ',
      getCode: () => (location.pathname.match(/\/problems\/([^/?#]+)/) || [])[1] || null,
      getTitle: () => { const n = $('#problem-name, h1, h2'); return n ? n.textContent.trim() : null; },
      statements: ['#problem-body', '#problem-statement', '.problem-body'],
      removeSelectors: ['nav', 'header', 'footer', '#problem-tags'],
    },
    'zoj.pintia.cn': {
      name: 'ZOJ',
      getCode: () => { const m = location.pathname.match(/\/problem-sets\/(\d+)\/problems\/([^/?#]+)/); return m ? m[2] : null; },
      getTitle: () => { const n = $('h1, .problem-title'); return n ? n.textContent.replace(/^[A-Z0-9]+\s*[.、:\-—]\s*/, '').trim() : null; },
      statements: ['.problem-description', '.problem-body', '.markdown-body'],
      removeSelectors: ['nav', 'header', 'footer'],
    },
    'openjudge.cn': {
      name: 'OpenJudge',
      getCode: () => (location.pathname.match(/\/(\d+)\//) || [])[1] || null,
      getTitle: () => { const n = $('h2, .problem-title, .title'); return n ? n.textContent.trim() : null; },
      statements: ['.problem-content', '.content', '#problem-content'],
      removeSelectors: ['nav', 'header', 'footer', '.sidebar'],
    },
    'hydro.ac': {
      name: 'Hydro',
      getCode: () => { const m = location.pathname.match(/\/p\/([A-Za-z0-9_]+)/) || location.search.match(/[?&]pid=([^&]+)/); return m ? decodeURIComponent(m[1]) : null; },
      getTitle: () => { const n = $('.section__title, .problem__title, h1, h2'); return n ? n.textContent.trim() : null; },
      statements: ['.problem__content', '.section__body', '.markdown-body'],
      removeSelectors: ['nav', 'header', 'footer', '.sidebar', '.section__header', '.problem__tag'],
    },
    'codechef.com': {
      name: 'CodeChef',
      getCode: () => (location.pathname.match(/\/problems\/([A-Za-z0-9_]+)/) || [])[1] || null,
      getTitle: () => { const n = $('h1, .problem-title'); return n ? n.textContent.trim() : null; },
      statements: ['#problem-statement', '.problem-statement', '._problemBody_', '.markdown-body'],
      removeSelectors: ['nav', 'header', 'footer', '.breadcrumbs'],
    },
    'acm.timus.ru': {
      name: 'Timus',
      getCode: () => new URLSearchParams(location.search).get('space') && new URLSearchParams(location.search).get('num'),
      getTitle: () => { const n = $('.problem_title, h1, h2'); return n ? n.textContent.replace(/^\d+\.\s*/, '').trim() : null; },
      statements: ['.problem_content', '.problem-statement', '.problem'],
      removeSelectors: ['nav', 'header', 'footer', '.footer'],
    },
    'dmoj.ca': {
      name: 'DMOJ',
      getCode: () => (location.pathname.match(/\/problem\/([A-Za-z0-9_]+)/) || [])[1] || null,
      getTitle: () => { const n = $('#problem-title, .problem-title, h1'); return n ? n.textContent.replace(/^[A-Za-z0-9_]+\s*[-–—]\s*/, '').trim() : null; },
      statements: ['#problem-body', '.problem-body', '.content-description'],
      removeSelectors: ['nav', 'header', 'footer', '#problem-info', '.sidebar'],
    },
    'qoj.ac': {
      name: 'QOJ',
      getCode: () => { const m = location.pathname.match(/\/problem\/(\d+)/) || location.pathname.match(/\/contest\/([^/?#]+)\/problem\/(\d+)/); return m ? (m[2] || m[1]) : null; },
      getTitle: () => { for (const sel of ['.uoj-article h1', '#problem-content h1', '.problem-title', 'h1', 'h2']) { const n = $(sel); if (n) { const t = n.textContent.replace(/^[A-Z0-9]+\s*[.、:\-—]\s*/, '').trim(); if (t && t.length < 200) return t; } } return null; },
      statements: ['.uoj-article', '#problem-content', '.problem-content', '.problem-statement', '.markdown-body'],
      removeSelectors: ['nav', 'header', 'footer', '.uoj-content-header', '.uoj-article-side'],
    },
    '__default': {
      name: 'UnknownOJ',
      getCode: () => {
        const q = new URLSearchParams(location.search);
        for (const k of ['problem', 'problemId', 'problem_id', 'pid', 'id', 'p', 'task', 'num', 'qid', 'question', 'code', 'no']) { const v = q.get(k); if (v && /^[A-Za-z0-9_.\-]{1,40}$/.test(v.trim())) return v.trim(); }
        const h = location.hash.replace(/^#\/?/, ''); const hm = h.match(/(?:problem|task|p)\/([A-Za-z0-9_.\-]{1,40})/i); if (hm) return hm[1];
        const patterns = [/\/(?:problem|problems|problemset|problem_show|p|task|tasks|question|questions|exercise|exercises|challenge|challenges|show_problem|viewproblem|problem-detail)\/([^/?#]{1,40})/i, /\/(?:contest|contests)\/\d+\/problem\/([^/?#]{1,40})/i];
        for (const re of patterns) { const m = location.pathname.match(re); if (m) return decodeURIComponent(m[1]); }
        const title = document.title || '';
        const tm = title.match(/\b(?:Problem|Pro\.|题|#)\s*([A-Za-z0-9_.\-]{1,20})\b/i) || title.match(/\b([A-Z]{1,4}\d{1,6})\b/);
        if (tm) return tm[1];
        return null;
      },
      getTitle: () => {
        for (const sel of ['.problem-title', '.problem_title', '.title', '#problem-title', 'h1', 'h2', 'h3', 'title']) {
          const n = $(sel); if (!n) continue;
          let t = (n.textContent || '').trim();
          t = t.replace(/\s*[-|_–—]\s*(.*?(OJ|Judge|Online Judge|Programming|Coding|ACM|比赛|题面|题库).*)$/i, '').trim();
          t = t.replace(/^\s*(?:Problem|Pro\.|题)\s*[#:：]?\s*[A-Za-z0-9_.\-]{1,20}\s*[-–—:：.]?\s*/i, '').trim();
          t = t.replace(/^\s*[A-Z]{1,4}\d{1,6}\s*[-–—:：.]\s*/, '').trim();
          if (t && t.length < 200 && t.length >= 2) return t;
        }
        return null;
      },
      statements: ['#problem-statement', '#problemStatement', '.problem-statement', '.problem_statement', '.problemStatement', '.problem-description', '.problemDescription', '.problem-content', '.problemContent', '.problem-body', '.problem-detail', '#problem', '#statement', '#description', '.statement', '.description', '.question-content', '.subject-question', '.markdown-body', '.md-content', 'article', 'main'],
      removeSelectors: ['nav', 'header', 'footer', 'aside', '.sidebar', '.breadcrumb'],
    },
  };

  function detectOJ() {
    const h = location.hostname.replace(/^www\./, '').toLowerCase();
    const userOJs = getUserOJs();
    for (const key in userOJs) { const k = key.toLowerCase(); if (h === k || h.endsWith('.' + k)) return { ...OJ_CONFIG.__default, name: userOJs[key], host: h, key: '__user__' + k }; }
    for (const key in OJ_CONFIG) { if (key === '__default') continue; if (h === key || h.endsWith('.' + key)) return { ...OJ_CONFIG[key], host: h, key }; }
    return { ...OJ_CONFIG.__default, host: h, key: '__default' };
  }
  const OJ = detectOJ();

  function looksLikeOJ() {
    const path = location.pathname.toLowerCase();
    if (/\/(problem|problemset|problem_show|show_problem|viewproblem|problem-detail|contest|task|tasks|problems|p|question|questions|exercise|exercises|challenge|challenges|submission|submissions|judge)\b/.test(path)) return true;
    const body = (document.body && document.body.innerText || '').slice(0, 15000);
    if (/题目描述|问题描述|Problem\s*Statement|Problem\s*Description|输入格式|输出格式|输入描述|输出描述|Input\s*Format|Output\s*Format|Sample\s*(Input|Output)|输入样例|输出样例|样例输入|样例输出|时间限制|空间限制|Time\s*Limit|Memory\s*Limit|数据范围|Data\s*Range|Constraints/i.test(body)) return true;
    const q = new URLSearchParams(location.search);
    for (const k of ['problem', 'problemId', 'problem_id', 'pid', 'id', 'task', 'p', 'qid', 'question', 'code', 'no']) { const v = q.get(k); if (v && /^[A-Za-z0-9_.\-]{1,40}$/.test(v)) return true; }
    if ($('#problem-statement, .problem-statement, .problem-content, .problem-description, [class*="problemStatement"]')) return true;
    return false;
  }

  // ============================================================
  // 题面提取
  // ============================================================
  function dedupeKatex(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.katex').forEach(k => {
      const ann = k.querySelector('annotation[encoding="application/x-tex"]');
      let tex = ann ? (ann.textContent || '').trim() : '';
      if (!tex) { const html = k.querySelector('.katex-html'); tex = html ? (html.textContent || '').trim() : (k.textContent || '').trim(); }
      const repl = document.createTextNode(tex ? `$${tex}$` : '');
      if (k.parentNode) k.parentNode.replaceChild(repl, k);
    });
  }

  function findStatementByKeywords() {
    const KEYWORDS = ['输入格式', '输出格式', '样例输入', '样例输出', '输入描述', '输出描述', '题目描述', '问题描述', 'Sample Input', 'Sample Output', 'Input Format', 'Output Format', 'Problem Statement', 'Problem Description', '时间限制', '空间限制', 'Time Limit', 'Memory Limit', '数据范围', 'Constraints', 'Data Range', '输入样例', '输出样例', 'Sample', '样例'];
    const hits = new Set();
    for (const el of document.body.querySelectorAll('*')) {
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'SVG' || tag === 'PATH' || tag === 'TITLE') continue;
      const t = (el.textContent || '').trim();
      if (t.length === 0 || t.length > 60) continue;
      if (el.children.length > 5) continue;
      for (const kw of KEYWORDS) { if (t === kw || t === kw + '：' || t === kw + ':' || new RegExp('^' + escapeRe(kw) + '\\s*[:：]?\\s*$', 'i').test(t)) { hits.add(el); break; } }
    }
    if (hits.size < 2) return null;
    const arr = Array.from(hits);
    let anc = arr[0].parentElement;
    let depth = 0;
    while (anc && anc !== document.body && depth < 25) {
      if (arr.every(h => anc.contains(h))) {
        const len = (anc.textContent || '').trim().length;
        if (len > 200 && len < 100000 && anc.children.length < 100) {
          const text = anc.textContent || '';
          let kwCount = 0;
          for (const kw of KEYWORDS) if (text.includes(kw)) kwCount++;
          if (kwCount >= 2) return anc;
        }
      }
      anc = anc.parentElement; depth++;
    }
    return null;
  }

  function findStatementByFuzzy() {
    const fuzzySelectors = ['[class*="problem-statement"]', '[class*="problemStatement"]', '[class*="problem-description"]', '[class*="problemDescription"]', '[class*="problem-content"]', '[class*="problemContent"]', '[class*="problem-body"]', '[class*="problemBody"]', '[class*="problem-detail"]', '[class*="problemDetail"]', '[class*="statement"]', '[class*="description"]', '[id*="problem-statement"]', '[id*="problemStatement"]', '[id*="problem-content"]', '[id*="problemContent"]', '[id*="statement"]', '[id*="description"]', '[class*="题面"]', '[class*="题目"]'];
    let best = null, bestLen = 0;
    for (const sel of fuzzySelectors) {
      try {
        $$(sel).forEach(n => {
          if (n.closest('nav, header, footer, aside')) return;
          const len = (n.textContent || '').trim().length;
          if (len < 300 || len > 150000) return;
          if (n.children.length > 100) return;
          if (len > bestLen) { best = n; bestLen = len; }
        });
      } catch (e) {}
      if (best && bestLen > 300) return best;
    }
    return null;
  }

  function findStatementRoot() {
    for (const sel of OJ.statements) { let best = null, bestLen = 0; try { $$(sel).forEach(n => { const len = (n.textContent || '').trim().length; if (len > bestLen && len < 200000) { best = n; bestLen = len; } }); } catch (e) {} if (best && bestLen > 200) return best; }
    const fuzzy = findStatementByFuzzy(); if (fuzzy) return fuzzy;
    const byKw = findStatementByKeywords(); if (byKw) return byKw;
    let best = null, bestLen = 0;
    $$('div, section, article').forEach(d => {
      if (d.closest('nav, header, footer, aside')) return;
      const len = (d.textContent || '').trim().length;
      if (len > 800 && len < 100000 && len > bestLen && d.children.length < 60) { best = d; bestLen = len; }
    });
    return best;
  }

  const COMMON_NOISE = ['button', 'script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', '[role="tablist"]', '[role="navigation"]', '[role="banner"]', '[class*="tab-bar"]', '[class*="tabs-nav"]', '[class*="tabbar"]', '[class*="sidebar"]', '[class*="side-bar"]', '[class*="side-nav"]', '[class*="nav-bar"]', '[class*="navbar"]', '[class*="nav-list"]', '[class*="breadcrumb"]', '[class*="crumb"]', '[class*="problem-list"]', '[class*="problem-nav"]', '[class*="contest-header"]', '[class*="contest-info"]', '[class*="typography-copy"]', '[class*="copy-btn"]', '[class*="copy-code"]', '[class*="pagination"]', '[class*="feedback"]', '[class*="code-mirror"]', '[class*="codeMirror"]', '[class*="editor-toolbar"]', '[class*="toolbar"]', '.yunoj-copy', '.yunoj-jump', '.yunoj-statement-btn', '#yunoj-jump', '#yunoj-fab', '#yunoj-panel', '#yunoj-search', '#yunoj-trans', '#yunoj-ask', '#yunoj-reentry', '#yunoj-oj-config', '#yunoj-ai', '#yunoj-ai-cfg', '#yunoj-trans-cfg'];

  function cloneStatementForExtract() {
    const root = findStatementRoot();
    if (!root) return null;
    const clone = root.cloneNode(true);
    (OJ.removeSelectors || []).concat(COMMON_NOISE).forEach(s => { try { clone.querySelectorAll(s).forEach(n => n.remove()); } catch (e) {} });
    dedupeKatex(clone);
    clone.querySelectorAll('img').forEach(img => { const alt = (img.alt || '').trim(), src = (img.src || '').trim(); if (/^(empty image|暂无图片|加载失败|no image)$/i.test(alt) || !src) img.remove(); });
    return clone;
  }

  function extractStatement() {
    const clone = cloneStatementForExtract();
    if (!clone) return '';
    const temp = el('div');
    temp.style.cssText = 'position:fixed;left:-99999px;top:0;width:800px;visibility:hidden;';
    temp.appendChild(clone);
    document.body.appendChild(temp);
    let text = clone.innerText || clone.textContent || '';
    document.body.removeChild(temp);
    const uname = getUsername();
    if (uname && uname.length >= 2) text = text.replace(new RegExp(escapeRe(uname), 'g'), '');
    const LINE_NOISE = [/^必做题$/, /^选做题$/, /^文件操作$/, /^\d+\s*分$/, /^[一二三四五六七八九十]、\s*.*编程题/, /^做题分析$/, /^必做题完成率$/, /^\d+(\.\d+)?%$/, /^基本信息$/, /^题目列表$/, /^订正$/, /^订正得分$/, /^赛中得分$/, /^得分[:：].*/, /^最新提交.*/, /^历史最高.*/, /^Accepted.*/, /^提交记录$/, /^题解$/, /^高分代码$/, /^题目描述$/, /^\d{8}$/, /^\d{4}-\d{2}-\d{2}.*/, /^C\+\+\d*$/, /^自测样例$/, /^最新编译结果.*$/, /^\d+$/, /^暂无数据$/, /^empty image$/i, /^[\s分]+$/, /^\d+\s*\/\s*\d+$/, /^example\.zip$/i];
    const kept = [];
    for (const line of text.split('\n')) {
      let t = line.replace(/[ \t]+/g, ' ').replace(/\s+$/, '').trim();
      if (t === '') { kept.push(''); continue; }
      if (LINE_NOISE.some(re => re.test(t))) continue;
      if (/^[（(）)\[\]【】、，。：:;；\-—\s]+$/.test(t)) continue;
      kept.push(t);
    }
    return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function extractDescription() {
    const clone = cloneStatementForExtract();
    if (!clone) return null;
    let t = (clone.textContent || '').trim();
    t = t.split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return t.length > 20 ? t : null;
  }

  function getUsername() {
    const areas = $$('[class*="userAvatar"], [class*="user-avatar"], [class*="userInfo"], header .username');
    for (const area of areas) { for (const sp of area.querySelectorAll('span, a')) { if (sp.querySelector('svg') || sp.classList.contains('anticon')) continue; if (sp.classList.contains('x-star-design-avatar')) continue; const t = (sp.textContent || '').trim(); if (t && t.length >= 2 && t.length <= 30 && !/[\s:：]/.test(t)) return t; } }
    return null;
  }

  // ============================================================
  // 翻译
  // ============================================================
  function isMostlyChinese(text) { const sample = text.slice(0, 2000); if (!sample) return false; const cn = (sample.match(/[\u4e00-\u9fa5]/g) || []).length; return cn / sample.length > 0.25; }
  function gmFetch(opts) { return new Promise((resolve, reject) => { if (typeof GM_xmlhttpRequest !== 'function') return reject(new Error('GM_xmlhttpRequest 不可用')); GM_xmlhttpRequest({ ...opts, onload: res => resolve(res), onerror: () => reject(new Error('网络错误')), ontimeout: () => reject(new Error('请求超时')) }); }); }
  async function translateGoogle(text, target = 'zh-CN') { const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`; const res = await gmFetch({ method: 'GET', url, timeout: 15000 }); if (res.status !== 200) throw new Error('Google HTTP ' + res.status); const json = JSON.parse(res.responseText); const arr = json[0] || []; return arr.map(item => item[0] || '').join(''); }
  async function translateMyMemory(text, target = 'zh-CN') { const lp = `en|${target}`; const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(lp)}`; const res = await gmFetch({ method: 'GET', url, timeout: 15000 }); if (res.status !== 200) throw new Error('MyMemory HTTP ' + res.status); const json = JSON.parse(res.responseText); const t = json && json.responseData && json.responseData.translatedText; if (!t) throw new Error('MyMemory 无翻译结果'); return t; }

  // 自定义翻译解析器：利用点号路径安全提取 JSON 字段
  function extractByPath(obj, path) {
    if (!path) return obj;
    try {
      return path.split('.').reduce((acc, part) => {
        const m = part.match(/^([^\[]+)(?:\[(\d+)\])?$/);
        if (!m) return undefined;
        const key = m[1], idx = m[2];
        let val = acc && acc[key];
        if (idx !== undefined) val = val && val[parseInt(idx, 10)];
        return val;
      }, obj);
    } catch (e) { return undefined; }
  }

  async function translateCustom(text, target = 'zh-CN') {
    const url = get('customTransUrl');
    if (!url) throw new Error('未配置自定义翻译 URL');
    const method = get('customTransMethod') || 'POST';
    let headers = {};
    try { headers = JSON.parse(get('customTransHeaders') || '{}'); } catch (e) { throw new Error('请求头不是合法的 JSON'); }
    
    let bodyTpl = get('customTransBody') || '';
    // 替换变量（防转义处理）
    const payload = bodyTpl.replace(/\{\{text\}\}/g, text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')).replace(/\{\{target\}\}/g, target);
    
    const opts = { method, url, headers, timeout: 20000 };
    if (method === 'POST') opts.data = payload;
    
    const res = await gmFetch(opts);
    if (res.status !== 200) throw new Error('自定义 API HTTP ' + res.status);
    
    let output = '';
    try {
      const json = JSON.parse(res.responseText);
      const extract = get('customTransExtract') || '';
      if (extract) {
        output = extractByPath(json, extract);
      }
      if (typeof output !== 'string') output = JSON.stringify(json);
    } catch (e) {
      output = res.responseText;
    }
    
    if (!output) throw new Error('自定义翻译提取不到有效内容');
    return output.trim();
  }

  async function translateText(text, target = 'zh-CN') {
    if (!text || !text.trim()) return '';
    const provider = get('translateProvider') || 'google';
    if (provider === 'custom') {
      return await translateCustom(text, target);
    }
    if (provider === 'mymemory') {
      return await translateMyMemory(text, target);
    }
    // 默认 Google 优先，失败自动回退 MyMemory
    try { return await translateGoogle(text, target); }
    catch (e1) {
      try { return await translateMyMemory(text, target); }
      catch (e2) { throw new Error('翻译失败：' + (e1.message || e1) + ' / ' + (e2.message || e2)); }
    }
  }

  function splitParagraphs(text) {
    const lines = text.split(/\n{2,}/).map(l => l.trim()).filter(Boolean);
    const merged = [];
    for (const line of lines) { if (merged.length && (line.length < 40 || merged[merged.length - 1].length < 40)) { merged[merged.length - 1] += '\n' + line; } else { merged.push(line); } }
    const out = [];
    for (const p of merged) { if (p.length <= 1200) { out.push(p); continue; } let i = 0; while (i < p.length) { let end = Math.min(i + 1200, p.length); if (end < p.length) { const slice = p.slice(i, end); const lastBreak = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('.'), slice.lastIndexOf('\n'), slice.lastIndexOf('!'), slice.lastIndexOf('?')); if (lastBreak > 200) end = i + lastBreak + 1; } out.push(p.slice(i, end).trim()); i = end; } }
    return out;
  }
  let translateAbort = null;

  function translationPanel() {
    if ($('#yunoj-trans')) return;
    const panel = el('div', { id: 'yunoj-trans' }); panel.style.display = 'none';
    const header = el('div', { class: 'yunoj-trans-header' });
    header.appendChild(el('span', { class: 'yunoj-trans-title' }, '题面翻译'));
    const status = el('span', { class: 'yunoj-trans-status' }, '');
    header.appendChild(status);
    const copyBtn = el('a', { class: 'yunoj-trans-btn', href: 'javascript:;', title: '复制译文' }, '📋');
    copyBtn.onclick = () => { const body = panel.querySelector('.yunoj-trans-body'); if (body && body.dataset.plain) copy(body.dataset.plain, () => { copyBtn.textContent = '✓'; setTimeout(() => copyBtn.textContent = '📋', 1000); }); };
    header.appendChild(copyBtn);
    const langBtn = el('a', { class: 'yunoj-trans-btn', href: 'javascript:;', title: '切换目标语言' }, '中');
    langBtn.textContent = (get('translateTarget') || 'zh-CN') === 'zh-CN' ? '中' : 'EN';
    langBtn.onclick = () => { const cur = get('translateTarget') || 'zh-CN'; const next = cur === 'zh-CN' ? 'en' : 'zh-CN'; set('translateTarget', next); langBtn.textContent = next === 'zh-CN' ? '中' : 'EN'; };
    header.appendChild(langBtn);
    const closeBtn = el('a', { class: 'yunoj-trans-btn', href: 'javascript:;', title: '关闭' }, '✕');
    closeBtn.onclick = () => { if (translateAbort) translateAbort(); panel.style.display = 'none'; };
    header.appendChild(closeBtn);
    panel.appendChild(header);
    const body = el('div', { class: 'yunoj-trans-body' });
    body.innerHTML = '<div class="yunoj-trans-empty">点击工具栏「🌐翻译」开始翻译当前题面</div>';
    panel.appendChild(body);
    document.body.appendChild(panel);
    makeDraggable(panel, 'posTrans');
  }

  async function doTranslate() {
    const panel = $('#yunoj-trans'); if (!panel) return;
    const body = panel.querySelector('.yunoj-trans-body'); const status = panel.querySelector('.yunoj-trans-status');
    panel.style.display = 'block';
    if (translateAbort) translateAbort();
    const text = extractStatement();
    if (!text || text.length < 20) { body.innerHTML = '<div class="yunoj-trans-empty">未识别到题面</div>'; return; }
    const target = get('translateTarget') || 'zh-CN';
    if (target === 'zh-CN' && isMostlyChinese(text)) { body.innerHTML = '<div class="yunoj-trans-empty">当前题面看起来已经是中文，无需翻译</div>'; return; }
    const paragraphs = splitParagraphs(text);
    if (!paragraphs.length) { body.innerHTML = '<div class="yunoj-trans-empty">题面为空</div>'; return; }
    body.innerHTML = '';
    const progBar = el('div', { class: 'yunoj-trans-progress' }); const progFill = el('div', { class: 'yunoj-trans-progress-fill' });
    progBar.appendChild(progFill); body.appendChild(progBar);
    status.textContent = `0 / ${paragraphs.length}`;
    const outList = []; const article = el('div'); body.appendChild(article);
    const nodes = paragraphs.map(p => { const wrap = el('div', { class: 'yunoj-trans-para' }); const trans = el('div', { class: 'yunoj-trans-text' }, '翻译中…'); trans.style.opacity = '.45'; wrap.appendChild(trans); article.appendChild(wrap); return trans; });
    let aborted = false; translateAbort = () => { aborted = true; };
    let done = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      if (aborted) return;
      const src = paragraphs[i];
      try { const t = await translateText(src, target); if (aborted) return; nodes[i].textContent = t; nodes[i].style.opacity = '1'; outList.push(t); }
      catch (e) { if (aborted) return; nodes[i].textContent = '（翻译失败：' + (e.message || e) + '）'; nodes[i].classList.add('yunoj-trans-err'); nodes[i].style.opacity = '1'; outList.push(''); }
      done++; progFill.style.width = (done / paragraphs.length * 100).toFixed(1) + '%'; status.textContent = `${done} / ${paragraphs.length}`;
      if (i < paragraphs.length - 1) await new Promise(r => setTimeout(r, 120));
    }
    body.dataset.plain = outList.filter(Boolean).join('\n\n');
    status.textContent = `完成 ${done} / ${paragraphs.length}`;
    setTimeout(() => { const p = panel.querySelector('.yunoj-trans-progress'); if (p) p.remove(); }, 800);
    translateAbort = null;
  }

  // ============================================================
  // AI 解答
  // ============================================================
  let aiRequest = null;
  let aiLastRun = null;
  let aiTicker = null;

  function stopTicker() { if (aiTicker) { clearInterval(aiTicker); aiTicker = null; } }
  function startTicker() { stopTicker(); aiTicker = setInterval(() => { if (!aiLastRun || !aiLastRun.running) { stopTicker(); return; } refreshAiLive(); }, 500); }
  function refreshAiLive() {
    const live = document.querySelector('#yunoj-ai .yunoj-ai-live');
    if (live && aiLastRun) live.innerHTML = buildLiveLine(aiLastRun);
  }

  function stopAI(silent) {
    if (aiRequest && typeof aiRequest.abort === 'function') { try { aiRequest.abort(); } catch (e) {} }
    aiRequest = null;
    stopTicker();
    if (aiLastRun && aiLastRun.running) {
      aiLastRun.running = false; aiLastRun.done = true; aiLastRun.stopped = true; aiLastRun.phase = 'stopped';
      if (!silent) {
        const b = document.querySelector('#yunoj-ai .yunoj-ai-body');
        if (b) b.innerHTML = buildAiHtml(aiLastRun);
        const s = document.querySelector('#yunoj-ai .yunoj-ai-status');
        if (s) s.textContent = '已停止';
      }
    }
  }

  let katexReady = false; let katexLoading = null;
  function ensureKatex() {
    if (katexReady || window.katex) { katexReady = true; return Promise.resolve(); }
    if (katexLoading) return katexLoading;
    katexLoading = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-yunoj-katex]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
        link.setAttribute('data-yunoj-katex', '1');
        document.head.appendChild(link);
      }
      if (window.katex && window.katex.renderToString) { katexReady = true; return resolve(); }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
      s.onload = () => { katexReady = true; resolve(); };
      s.onerror = () => reject(new Error('KaTeX 加载失败'));
      document.head.appendChild(s);
    });
    return katexLoading;
  }

  function renderTex(tex, displayMode) {
    if (window.katex && window.katex.renderToString) {
      try { return window.katex.renderToString(tex, { displayMode: !!displayMode, throwOnError: false, output: 'html' }); }
      catch (e) { return displayMode ? `<pre class="yunoj-ai-pre"><code>${escapeHtml(tex)}</code></pre>` : `<code>${escapeHtml(tex)}</code>`; }
    }
    return displayMode ? `<pre class="yunoj-ai-pre"><code>${escapeHtml(tex)}</code></pre>` : `<code>${escapeHtml(tex)}</code>`;
  }

  function renderMarkdown(md) {
    if (!katexReady) {
      ensureKatex().then(() => {
        const body = document.querySelector('#yunoj-ai .yunoj-ai-body');
        if (body && body.dataset.raw && aiLastRun) body.innerHTML = buildAiHtml(aiLastRun);
      }).catch(() => {});
    }
    return _renderMarkdownSync(md);
  }

  function _renderMarkdownSync(md) {
    const blocks = [];
    md = md.replace(/```([A-Za-z0-9_+\-]*)\n([\s\S]*?)```/g, (m, lang, code) => {
      const idx = blocks.length;
      const esc = escapeHtml(code.replace(/\n$/, ''));
      const header = `<div class="yunoj-ai-code-lang">${escapeHtml(lang || '代码')}<span class="yunoj-ai-code-copy">复制</span></div>`;
      blocks.push({ type: 'code', html: header + `<pre class="yunoj-ai-pre"><code>${esc}</code></pre>` });
      return `\n@@B_${idx}@@\n`;
    });
    md = md.replace(/\$\$([\s\S]+?)\$\$/g, (m, tex) => { const idx = blocks.length; blocks.push({ type: 'mathB', tex: tex.trim() }); return `@@B_${idx}@@`; });
    md = md.replace(/\$([^\$\n]+?)\$/g, (m, tex) => { const idx = blocks.length; blocks.push({ type: 'mathI', tex: tex.trim() }); return `@@B_${idx}@@`; });
    md = md.replace(/`([^`\n]+)`/g, (m, code) => { const idx = blocks.length; blocks.push({ type: 'inline', html: `<code>${escapeHtml(code)}</code>` }); return `@@B_${idx}@@`; });
    let html = escapeHtml(md);
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';
    blocks.forEach((b, i) => {
      let replacement = '';
      if (b.type === 'code') replacement = b.html;
      else if (b.type === 'inline') replacement = b.html;
      else if (b.type === 'mathB') replacement = renderTex(b.tex, true);
      else if (b.type === 'mathI') replacement = renderTex(b.tex, false);
      html = html.replace(`@@B_${i}@@`, replacement);
    });
    return html;
  }

  function buildLiveLine(run) {
    if (!run) return '';
    const now = Date.now();
    if (run.phase === 'connecting') {
      const waited = fmtSec(now - run.startedAt);
      return '<span class="yunoj-spinner"></span>正在连接到 <b>' + escapeHtml(run.hostLabel) + '</b>… 已等待 ' + waited;
    }
    if (run.phase === 'streaming') {
      const ttfb = run.firstByteAt ? fmtSec(run.firstByteAt - run.startedAt) : '?';
      const elapsed = fmtSec(now - run.startedAt);
      return '<span class="yunoj-spinner"></span>已连接 · 接收中 · 首字节 ' + ttfb + ' · 共 ' + escapeHtml(fmtBytes(run.bytes)) + ' · 用时 ' + elapsed;
    }
    if (run.phase === 'done') {
      const total = fmtSec((run.finishedAt || now) - run.startedAt);
      const ttfb = run.firstByteAt ? fmtSec(run.firstByteAt - run.startedAt) : '-';
      return '✅ 已完成 · 首字节 ' + ttfb + ' · 共 ' + escapeHtml(fmtBytes(run.bytes)) + ' · 用时 ' + total;
    }
    if (run.phase === 'error') return '❌ ' + escapeHtml(run.error || '请求失败');
    if (run.phase === 'stopped') return '⏹ 已停止 · 已接收 ' + escapeHtml(fmtBytes(run.bytes));
    return '';
  }

  function buildAiHtml(run) {
    if (!run) return '';
    let html = '';
    html += '<div class="yunoj-ai-live' + (run.phase === 'error' ? ' yunoj-ai-live-err' : '') + (run.phase === 'done' ? ' yunoj-ai-live-ok' : '') + '">' + buildLiveLine(run) + '</div>';
    const hasContent = !!(run.fullText && run.fullText.length);
    if (run.thinkText && run.thinkText.length) {
      const openAttr = hasContent ? '' : ' open';
      html += '<details class="yunoj-ai-think"' + openAttr + '>'
           + '<summary>💭 思考过程' + (run.phase === 'streaming' && !hasContent ? '（进行中）' : '') + '</summary>'
           + '<div class="yunoj-ai-think-body">'
           + escapeHtml(run.thinkText).replace(/\n/g, '<br>')
           + '</div></details>';
    }
    if (hasContent) html += renderMarkdown(run.fullText);
    else if (run.error) html += '<div class="yunoj-ai-empty yunoj-ai-err">' + escapeHtml(run.error) + '</div>';
    else if (run.running) {
      const hint = run.phase === 'connecting' ? '正在等待服务端响应…（如果长时间无响应，请检查 API 地址、Key 和网络）' : (run.thinkText && run.thinkText.length ? '正在思考…' : '正在生成…');
      html += '<div class="yunoj-ai-tip">' + hint + '</div>';
    } else if (run.stopped) html += '<div class="yunoj-ai-tip">已停止生成。已收到的内容不会丢失。</div>';
    else if (run.done && !hasContent) html += '<div class="yunoj-ai-empty">模型没有返回正文内容（可能该模型只返回思考内容，或响应被截断）。</div>';
    return html;
  }

  function aiPanel() {
    if ($('#yunoj-ai')) return;
    const panel = el('div', { id: 'yunoj-ai' });
    panel.style.display = 'none';
    const header = el('div', { class: 'yunoj-ai-header' });
    header.appendChild(el('span', { class: 'yunoj-ai-title' }, 'AI 解答'));
    const status = el('span', { class: 'yunoj-ai-status' }, '');
    header.appendChild(status);
    const copyBtn = el('a', { class: 'yunoj-ai-btn', href: 'javascript:;', title: '复制回答' }, '📋');
    copyBtn.onclick = () => { const body = panel.querySelector('.yunoj-ai-body'); if (body) copy((aiLastRun && aiLastRun.fullText) || body.textContent || '', () => { copyBtn.textContent = '✓'; setTimeout(() => copyBtn.textContent = '📋', 1000); }); };
    header.appendChild(copyBtn);
    const regenBtn = el('a', { class: 'yunoj-ai-btn', href: 'javascript:;', title: '重新生成（会重新计费）' }, '⟳');
    regenBtn.onclick = () => { askAI(true); };
    header.appendChild(regenBtn);
    const stopBtn = el('a', { class: 'yunoj-ai-btn yunoj-ai-stop', href: 'javascript:;', title: '停止生成（已发出的请求可能仍会计费）' }, '⏹');
    stopBtn.onclick = () => { stopAI(false); };
    header.appendChild(stopBtn);
    const cfgBtn = el('a', { class: 'yunoj-ai-btn', href: 'javascript:;', title: 'AI 设置' }, '⚙');
    cfgBtn.onclick = () => { aiConfigPanel(); const c = $('#yunoj-ai-cfg'); if (c) c.style.display = 'block'; };
    header.appendChild(cfgBtn);
    const closeBtn = el('a', { class: 'yunoj-ai-btn', href: 'javascript:;', title: '关闭窗口（后台继续接收）' }, '✕');
    closeBtn.onclick = () => { panel.style.display = 'none'; };
    header.appendChild(closeBtn);
    panel.appendChild(header);
    const body = el('div', { class: 'yunoj-ai-body' });
    body.innerHTML = '<div class="yunoj-ai-empty">点击工具栏「🤖解答」开始 AI 解答</div>';
    panel.appendChild(body);
    const footer = el('div', { class: 'yunoj-ai-footer' });
    footer.appendChild(el('span', { class: 'yunoj-ai-model' }, ''));
    panel.appendChild(footer);
    document.body.appendChild(panel);
    makeDraggable(panel, 'posAi');
    body.addEventListener('click', e => {
      const btn = e.target.closest('.yunoj-ai-code-copy');
      if (!btn) return;
      let pre = null;
      const langBar = btn.closest('.yunoj-ai-code-lang');
      if (langBar) {
        let sib = langBar.nextElementSibling;
        while (sib) {
          if (sib.tagName === 'PRE' || (sib.classList && sib.classList.contains('yunoj-ai-pre'))) { pre = sib; break; }
          sib = sib.nextElementSibling;
        }
      }
      if (!pre) pre = btn.closest('.yunoj-ai-pre');
      if (!pre) return;
      const code = pre.querySelector('code');
      if (!code) return;
      copy(code.textContent || '', () => {
        btn.textContent = '✓';
        setTimeout(() => btn.textContent = '复制', 1000);
      });
    });
    ensureKatex().catch(() => {});
  }

  async function askAI(force) {
    const panel = $('#yunoj-ai'); if (!panel) return;
    const body = panel.querySelector('.yunoj-ai-body');
    const status = panel.querySelector('.yunoj-ai-status');
    const modelInfo = panel.querySelector('.yunoj-ai-model');
    panel.style.display = 'flex';

    const cur = getActiveAIProfile() || {};
    const base = (cur.base || '').trim().replace(/\/+$/, '');
    const key = (cur.key || '').trim();
    const model = (cur.model || 'deepseek-chat').trim();
    const profileLabel = (cur.name ? cur.name + ' · ' : '') + model;
    modelInfo.textContent = profileLabel;

    if (!base) { body.innerHTML = '<div class="yunoj-ai-live yunoj-ai-live-err">❌ 未配置 API 地址（点 ⚙ 打开 AI 设置）</div>'; return; }
    if (!key) { body.innerHTML = '<div class="yunoj-ai-live yunoj-ai-live-err">❌ 未配置 API Key（点 ⚙ 打开 AI 设置）</div>'; return; }

    const statement = extractStatement();
    if (!statement || statement.length < 20) { body.innerHTML = '<div class="yunoj-ai-live yunoj-ai-live-err">❌ 未识别到题面</div>'; return; }

    const sysPrompt = (cur.system || '').trim() || '你是一名信息学竞赛教练。';
    const hash = (statement.slice(0, 300)) + '|' + base + '|' + model + '|' + sysPrompt;

    if (!force && aiLastRun && aiLastRun.hash === hash) {
      body.innerHTML = buildAiHtml(aiLastRun);
      status.textContent = aiLastRun.running ? '进行中…' : (aiLastRun.done ? (aiLastRun.stopped ? '已停止' : '完成') : '');
      if (aiLastRun.running) startTicker();
      return;
    }

    if (aiRequest && typeof aiRequest.abort === 'function') { try { aiRequest.abort(); } catch (e) {} }
    aiRequest = null;
    stopTicker();

    const userPrompt = `题目：${OJ.getTitle() || '(未命名)'}\n\n${statement}`;
    let hostLabel = base;
    try { hostLabel = new URL(base).hostname; } catch (e) {}

    aiLastRun = {
      hash, fullText: '', thinkText: '', running: true, done: false, stopped: false, error: null,
      modelLabel: profileLabel, hostLabel, phase: 'connecting',
      startedAt: Date.now(), firstByteAt: null, finishedAt: null, bytes: 0,
    };
    body.innerHTML = buildAiHtml(aiLastRun);
    status.textContent = '连接中…';
    startTicker();

    let lastLen = 0;
    let buffer = '';
    const myRun = aiLastRun;

    const rerender = () => {
      const b = document.querySelector('#yunoj-ai .yunoj-ai-body');
      if (b && aiLastRun === myRun) { b.dataset.raw = aiLastRun.fullText; b.innerHTML = buildAiHtml(aiLastRun); }
    };

    const parseSSE = (text, isFinal) => {
      if (!text && !isFinal) return;
      buffer += text;
      const lines = buffer.split('\n');
      buffer = isFinal ? '' : lines.pop();
      if (isFinal && lines.length === 0 && buffer) { lines.push(buffer); buffer = ''; }
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const data = s.substring(5).trim();
        if (data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          const d = j.choices && j.choices[0] && j.choices[0].delta;
          if (!d) continue;
          let changed = false;
          if (d.reasoning_content) { aiLastRun.thinkText += d.reasoning_content; changed = true; }
          if (d.content) { aiLastRun.fullText += d.content; changed = true; }
          if (changed) rerender();
        } catch (e) {}
      }
    };

    const url = base + '/chat/completions';
    const reqData = JSON.stringify({
      model: model,
      messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }],
      stream: true,
    });

    const onFirstData = () => {
      if (myRun.phase === 'connecting') { myRun.phase = 'streaming'; myRun.firstByteAt = Date.now(); refreshAiLive(); }
    };

    aiRequest = GM_xmlhttpRequest({
      method: 'POST', url: url,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Accept': 'text/event-stream' },
      data: reqData, timeout: 180000,
      onprogress: res => {
        if (aiLastRun !== myRun || !myRun.running) return;
        const full = res.responseText || '';
        if (full.length <= lastLen) return;
        const chunk = full.substring(lastLen);
        lastLen = full.length;
        onFirstData();
        myRun.bytes = full.length;
        parseSSE(chunk, false);
        refreshAiLive();
      },
      onload: res => {
        if (aiLastRun !== myRun) return;
        if (!myRun.running) return;
        if (res.responseText) parseSSE(res.responseText, true);
        myRun.bytes = (res.responseText || '').length || myRun.bytes;
        myRun.finishedAt = Date.now();
        stopTicker();
        if (res.status !== 200) {
          let errMsg = 'HTTP ' + res.status;
          try { const j = JSON.parse(res.responseText); if (j.error && j.error.message) errMsg = j.error.message; }
          catch (e) { errMsg += ' — ' + (res.responseText || '').substring(0, 200); }
          myRun.error = errMsg; myRun.phase = 'error'; myRun.running = false; myRun.done = true;
          aiRequest = null; rerender(); status.textContent = '失败';
          return;
        }
        if (!myRun.fullText) {
          try {
            const j = JSON.parse(res.responseText);
            if (j.choices && j.choices[0]) {
              const msg = j.choices[0].message;
              if (msg && msg.content) myRun.fullText = msg.content;
              if (msg && msg.reasoning_content && !myRun.thinkText) myRun.thinkText = msg.reasoning_content;
            }
          } catch (e) {}
        }
        myRun.running = false; myRun.done = true; aiRequest = null;
        if (!myRun.fullText && !myRun.thinkText) {
          myRun.phase = 'error'; myRun.error = '模型没有返回内容（可能被截断、该模型不支持流式，或响应格式异常）';
          rerender(); status.textContent = '失败';
          return;
        }
        myRun.phase = 'done'; rerender(); status.textContent = '完成';
      },
      onerror: () => {
        if (aiLastRun !== myRun || !myRun.running) return;
        stopTicker();
        myRun.error = '网络错误：无法连接到 ' + hostLabel + '（可能是 CORS、@connect 未配置，或网络不通）';
        myRun.phase = 'error'; myRun.running = false; myRun.done = true; myRun.finishedAt = Date.now();
        aiRequest = null; rerender(); status.textContent = '失败';
      },
      ontimeout: () => {
        if (aiLastRun !== myRun || !myRun.running) return;
        stopTicker();
        myRun.error = '请求超时（180 秒无响应）：' + hostLabel;
        myRun.phase = 'error'; myRun.running = false; myRun.done = true; myRun.finishedAt = Date.now();
        aiRequest = null; rerender(); status.textContent = '失败';
      },
    });
  }

  // ============ AI 设置（多套配置） ============
  function aiConfigPanel() {
    if ($('#yunoj-ai-cfg')) return;
    const panel = el('div', { id: 'yunoj-ai-cfg' });
    panel.style.display = 'none';
    const hint = el('span', { class: 'yunoj-ai-cfg-hint' }, '');

    const header = el('div', { class: 'yunoj-ai-cfg-header' });
    header.appendChild(el('span', { class: 'yunoj-ai-cfg-title' }, 'AI 设置'));
    const closeBtn = el('a', { class: 'yunoj-ai-cfg-btn', href: 'javascript:;', title: '关闭' }, '✕');
    closeBtn.onclick = () => { panel.style.display = 'none'; };
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const profileBar = el('div', { class: 'yunoj-ai-cfg-profilebar' });
    const select = el('select', { class: 'yunoj-ai-cfg-select' });
    profileBar.appendChild(select);
    const addBtn = el('a', { class: 'yunoj-ai-cfg-mini', href: 'javascript:;', title: '新增一套配置' }, '+ 新增');
    const delBtn = el('a', { class: 'yunoj-ai-cfg-mini yunoj-ai-cfg-del', href: 'javascript:;', title: '删除当前配置' }, '删除');
    profileBar.appendChild(addBtn); profileBar.appendChild(delBtn);
    panel.appendChild(profileBar);

    const mkField = (label, key, placeholder, isPassword) => {
      const wrap = el('div', { class: 'yunoj-ai-cfg-field' });
      wrap.appendChild(el('label', { class: 'yunoj-ai-cfg-label' }, label));
      const inp = el('input', { type: isPassword ? 'password' : 'text', class: 'yunoj-ai-cfg-input', placeholder });
      inp.dataset.k = key; wrap.appendChild(inp); return wrap;
    };
    panel.appendChild(mkField('API 地址（OpenAI 兼容）', 'base', 'https://api.deepseek.com/v1'));
    panel.appendChild(mkField('API Key', 'key', 'sk-...', true));
    panel.appendChild(mkField('模型', 'model', 'deepseek-chat'));
    panel.appendChild(mkField('系统提示词', 'system', '你是一名信息学竞赛教练…'));
    panel.appendChild(el('div', { class: 'yunoj-ai-cfg-tip' }, '支持任何 OpenAI 兼容接口，可保存多套配置并用顶部下拉切换。修改 API 地址后需要把域名加到脚本头部的 @connect 里。GLM-5.3 / DeepSeek-R1 等推理模型的思考过程会自动显示在「💭 思考过程」折叠块里。'));

    const actions = el('div', { class: 'yunoj-ai-cfg-actions' });
    actions.appendChild(hint);
    const saveBtn = el('a', { class: 'yunoj-ai-cfg-save', href: 'javascript:;' }, '保存');
    actions.appendChild(saveBtn);
    panel.appendChild(actions);

    const getInputs = () => Array.from(panel.querySelectorAll('.yunoj-ai-cfg-input[data-k]'));
    const readForm = () => { const o = {}; getInputs().forEach(inp => { o[inp.dataset.k] = inp.value; }); return o; };
    const writeForm = p => { getInputs().forEach(inp => { inp.value = (p && p[inp.dataset.k]) || ''; }); };
    const activeIndex = () => { const n = getAIProfiles().length; let i = parseInt(get('aiActiveProfile') || 0, 10); if (!(i >= 0 && i < n)) i = 0; return i; };
    const syncCurrent = () => { const profiles = getAIProfiles(); const i = activeIndex(); if (profiles[i]) { Object.assign(profiles[i], readForm()); saveAIProfiles(profiles); } };

    const refresh = () => {
      const profiles = getAIProfiles();
      const i = activeIndex();
      select.innerHTML = '';
      profiles.forEach((p, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = p.name || ('配置 ' + (idx + 1));
        if (idx === i) opt.selected = true;
        select.appendChild(opt);
      });
      writeForm(profiles[i]);
      delBtn.style.opacity = profiles.length <= 1 ? '.4' : '1';
    };
    const flash = (msg, isErr) => { hint.style.color = isErr ? '#c00' : '#0969da'; hint.textContent = msg; setTimeout(() => { hint.textContent = ''; hint.style.color = ''; }, 1800); };

    select.onchange = () => { syncCurrent(); set('aiActiveProfile', parseInt(select.value, 10) || 0); refresh(); };
    addBtn.onclick = () => {
      syncCurrent();
      const profiles = getAIProfiles();
      profiles.push({ name: '配置 ' + (profiles.length + 1), base: D.aiBase, key: '', model: D.aiModel, system: D.aiSystem });
      saveAIProfiles(profiles);
      set('aiActiveProfile', profiles.length - 1);
      refresh(); flash('已新增配置');
    };
    delBtn.onclick = () => {
      const profiles = getAIProfiles();
      if (profiles.length <= 1) { flash('至少保留一个配置', true); return; }
      const i = activeIndex();
      const name = profiles[i].name || ('配置 ' + (i + 1));
      if (!confirm('确定删除配置「' + name + '」？')) return;
      profiles.splice(i, 1); saveAIProfiles(profiles);
      set('aiActiveProfile', Math.max(0, i - 1));
      refresh(); flash('已删除');
    };
    saveBtn.onclick = () => {
      const profiles = getAIProfiles();
      const i = activeIndex();
      if (!profiles[i]) return;
      Object.assign(profiles[i], readForm());
      const nm = (profiles[i].name || '').trim();
      if (!nm || /^配置\s*\d+$/.test(nm) || nm === '默认配置') {
        try { const host = new URL(profiles[i].base).hostname.replace(/^www\./, ''); if (host) profiles[i].name = host; } catch (e) {}
      }
      saveAIProfiles(profiles); refresh(); flash('已保存');
    };

    refresh();
    document.body.appendChild(panel);
    makeDraggable(panel, 'posAiCfg');
  }

  // ============ 自定义翻译设置 ============
  function transConfigPanel() {
    if ($('#yunoj-trans-cfg')) return;
    const panel = el('div', { id: 'yunoj-trans-cfg' });
    panel.style.display = 'none';
    const hint = el('span', { class: 'yunoj-ai-cfg-hint' }, '');

    const header = el('div', { class: 'yunoj-ai-cfg-header' });
    header.appendChild(el('span', { class: 'yunoj-ai-cfg-title' }, '翻译设置'));
    const closeBtn = el('a', { class: 'yunoj-ai-cfg-btn', href: 'javascript:;', title: '关闭' }, '✕');
    closeBtn.onclick = () => { panel.style.display = 'none'; };
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // 选择提供商
    const providerWrap = el('div', { class: 'yunoj-ai-cfg-field' });
    providerWrap.appendChild(el('label', { class: 'yunoj-ai-cfg-label' }, '翻译引擎'));
    const sel = el('select', { class: 'yunoj-ai-cfg-input' });
    [['google', 'Google (内置)'], ['mymemory', 'MyMemory (内置)'], ['custom', '自定义 API 接口']].forEach(([v, t]) => {
      const opt = document.createElement('option'); opt.value = v; opt.textContent = t; sel.appendChild(opt);
    });
    sel.value = get('translateProvider') || 'google';
    providerWrap.appendChild(sel);
    panel.appendChild(providerWrap);

    // 自定义配置区域
    const customFields = el('div', { class: 'yunoj-trans-custom-fields' });
    const mkArea = (label, key, placeholder, rows) => {
      const wrap = el('div', { class: 'yunoj-ai-cfg-field' });
      wrap.appendChild(el('label', { class: 'yunoj-ai-cfg-label' }, label));
      const inp = el('textarea', { class: 'yunoj-ai-cfg-input', placeholder });
      inp.rows = rows || 3;
      inp.dataset.k = key;
      wrap.appendChild(inp);
      return wrap;
    };
    customFields.appendChild(mkArea('请求 URL', 'customTransUrl', 'https://api.openai.com/v1/chat/completions'));
    
    const methodWrap = el('div', { class: 'yunoj-ai-cfg-field' });
    methodWrap.appendChild(el('label', { class: 'yunoj-ai-cfg-label' }, '请求方法'));
    const methodSel = el('select', { class: 'yunoj-ai-cfg-input' });
    ['POST', 'GET'].forEach(m => { const opt = document.createElement('option'); opt.value = m; opt.textContent = m; methodSel.appendChild(opt); });
    methodSel.dataset.k = 'customTransMethod';
    methodWrap.appendChild(methodSel);
    customFields.appendChild(methodWrap);

    customFields.appendChild(mkArea('请求头 (JSON)', 'customTransHeaders', '{"Content-Type":"application/json"}', 3));
    customFields.appendChild(mkArea('请求体模板 (POST)', 'customTransBody', '{"text":"{{text}}"}', 4));
    customFields.appendChild(mkArea('响应提取路径 (如 choices[0].message.content)', 'customTransExtract', 'choices[0].message.content', 2));

    customFields.appendChild(el('div', { class: 'yunoj-ai-cfg-tip' }, '占位符说明：{{text}} 会被替换为待翻译内容，{{target}} 替换为目标语言（如 zh-CN 或 en）。提取路径支持点号提取 JSON，例如 data.translations[0].text。若留空则原样返回响应文本。'));
    
    panel.appendChild(customFields);

    const actions = el('div', { class: 'yunoj-ai-cfg-actions' });
    actions.appendChild(hint);
    const saveBtn = el('a', { class: 'yunoj-ai-cfg-save', href: 'javascript:;' }, '保存');
    actions.appendChild(saveBtn);
    panel.appendChild(actions);

    const getInputs = () => Array.from(panel.querySelectorAll('[data-k]'));
    const writeForm = () => {
      getInputs().forEach(inp => {
        const k = inp.dataset.k;
        if (k) {
          const v = get(k);
          if (inp.tagName === 'SELECT') inp.value = v;
          else inp.value = v || '';
        }
      });
      customFields.style.display = (get('translateProvider') === 'custom') ? 'block' : 'none';
    };
    const readForm = () => {
      getInputs().forEach(inp => {
        const k = inp.dataset.k;
        if (k) set(k, inp.value);
      });
    };

    sel.onchange = () => {
      set('translateProvider', sel.value);
      customFields.style.display = (sel.value === 'custom') ? 'block' : 'none';
    };
    saveBtn.onclick = () => {
      readForm();
      hint.textContent = '已保存'; hint.style.color = '#0969da';
      setTimeout(() => { hint.textContent = ''; }, 1500);
    };

    writeForm();
    document.body.appendChild(panel);
    makeDraggable(panel, 'posAiCfg'); // 借用一个位置保存
  }

  // ============================================================
  // 样例复制
  // ============================================================
  const SAMPLE_IN_RE = /^(Sample\s*Input\s*\d*|样例输入\s*\d*|输入样例\s*\d*|输入\s*#?\s*\d*|入力例\s*\d*)$/i;
  const SAMPLE_OUT_RE = /^(Sample\s*Output\s*\d*|样例输出\s*\d*|输出样例\s*\d*|输出\s*#?\s*\d*|出力例\s*\d*)$/i;
  function findSampleBlock(from) { let n = from, u = 0; while (n && n !== document.body && u < 6) { let s = n.nextElementSibling, a = 0; while (s && a < 8) { if (/^(PRE|TEXTAREA|CODE)$/.test(s.tagName)) return s; const i = s.querySelector('pre, textarea, code'); if (i) return i; s = s.nextElementSibling; a++; } n = n.parentElement; u++; } return null; }
  function sampleCopy() {
    $$('h1,h2,h3,h4,h5,p,b,strong,div,span,td,label,font').forEach(lab => {
      if (lab.__yunoj) return;
      const t = (lab.textContent || '').trim();
      let kind;
      if (SAMPLE_IN_RE.test(t)) kind = 'in'; else if (SAMPLE_OUT_RE.test(t)) kind = 'out'; else return;
      const childHas = Array.from(lab.children).some(c => { const ct = (c.textContent || '').trim(); return SAMPLE_IN_RE.test(ct) || SAMPLE_OUT_RE.test(ct); });
      if (childHas) return;
      lab.__yunoj = 1;
      const b = findSampleBlock(lab); if (!b || b.__yunoj) return; b.__yunoj = 1;
      const btn = el('button', { class: 'yunoj-copy', type: 'button' }, kind === 'in' ? '复制输入' : '复制输出');
      btn.onclick = () => copy(b.value || b.textContent || '', () => { btn.textContent = '已复制'; setTimeout(() => btn.textContent = kind === 'in' ? '复制输入' : '复制输出', 1000); });
      if (lab.parentNode) lab.parentNode.insertBefore(btn, lab.nextSibling); else lab.appendChild(btn);
    });
  }

  // ============================================================
  // 原题搜索 + 智谱联网搜索
  // ============================================================
  function searchYuantiji(keyword, callback) {
    if (typeof GM_xmlhttpRequest !== 'function') return callback(new Error('GM_xmlhttpRequest 不可用'));
    const query = keyword.length > 15000 ? keyword.substring(0, 15000) : keyword;
    GM_xmlhttpRequest({ method: 'POST', url: 'https://yuantiji.ac/api/search', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, data: JSON.stringify({ query, k: 10, rewrite: false, skip_short: true, rerank: false }), timeout: 20000,
      onload: res => { if (res.status === 422) return callback(new Error('题面过长')); if (res.status !== 200) return callback(new Error('HTTP ' + res.status)); try { const json = JSON.parse(res.responseText); const raw = json.results || []; const list = raw.slice(0, 3).map(r => ({ title: r.title || '(未命名)', url: r.url || '', src: r.src || '', uid: r.uid || '', cos: typeof r.cos === 'number' ? r.cos : 0 })); callback(null, { list, total: raw.length }); } catch (e) { callback(new Error('响应解析失败')); } },
      onerror: () => callback(new Error('原题机连接失败')), ontimeout: () => callback(new Error('原题机请求超时')) });
  }

  function searchZhipuApi(keyword, callback, engine) {
    if (typeof GM_xmlhttpRequest !== 'function') return callback(new Error('GM_xmlhttpRequest 不可用'));
    const cur = getActiveAIProfile() || {};
    const key = (cur.key || '').trim();
    if (!key) return callback(new Error('未配置 API Key（请先在「AI 设置」里填写智谱 Key）'));
    const query = (keyword || '').slice(0, 500);
    const eng = engine || get('zhipuEngine') || 'search_pro';
    const body = { search_query: query, search_engine: eng, search_intent: false };
    if (eng === 'search_pro_sogou') body.count = 10;
    else if (eng !== 'search_pro_quark') body.count = 10;

    GM_xmlhttpRequest({
      method: 'POST', url: 'https://open.bigmodel.cn/api/paas/v4/web_search',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' },
      data: JSON.stringify(body), timeout: 20000,
      onload: res => {
        if (res.status !== 200) {
          let msg = 'HTTP ' + res.status;
          try { const j = JSON.parse(res.responseText); if (j.error && j.error.message) msg = j.error.message; } catch (e) {}
          return callback(new Error(msg));
        }
        try {
          const json = JSON.parse(res.responseText);
          const raw = json.search_result || json.data || [];
          const list = raw.slice(0, 5).map(r => ({ title: r.title || '(无标题)', url: r.link || r.url || '', src: r.media || r.source || '网页', cos: 0, content: r.content || '' }));
          callback(null, { list, total: raw.length });
        } catch (e) { callback(new Error('响应解析失败')); }
      },
      onerror: () => callback(new Error('智谱搜索连接失败（可能是网络或 @connect 未配置）')),
      ontimeout: () => callback(new Error('智谱搜索请求超时')),
    });
  }

  let searchSeq = 0;
  function isValidPid(pid) { return pid && pid.length >= 2 && pid.length <= 30 && /^[A-Za-z]/.test(pid) && /\d/.test(pid) && !/^[A-Za-z]+$/.test(pid); }
  function parseLuoguHTML(html) {
    const result = { list: [], total: 0 }; const seen = new Set();
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      for (const a of doc.querySelectorAll('a[href^="/problem/"]')) {
        const m = (a.getAttribute('href') || '').match(/^\/problem\/([A-Za-z][A-Za-z0-9_]*)/); if (!m) continue;
        const pid = m[1]; if (!isValidPid(pid) || seen.has(pid)) continue; seen.add(pid);
        let title = (a.textContent || '').trim();
        if (title.length <= pid.length + 2) { const parent = a.closest('li, tr, [class*="item"], [class*="row"], [class*="card"]') || a.parentElement; if (parent) { const titleEl = parent.querySelector('[class*="title"], h4, h3, [class*="name"]'); if (titleEl) title = titleEl.textContent.trim(); } }
        title = title.replace(new RegExp('^\\s*' + escapeRe(pid) + '\\s*[-:：.、]?\\s*'), '').trim();
        if (!title || title === pid || /^[\s\-_.,:：、。]+$/.test(title)) continue;
        result.list.push({ pid, title }); if (result.list.length >= 3) break;
      }
    } catch (e) {}
    const tc = html.match(/"totalCount"\s*:\s*(\d+)/) || html.match(/"count"\s*:\s*(\d+)/);
    result.total = tc ? parseInt(tc[1], 10) : result.list.length;
    return result;
  }
  function searchLuoguApi(keyword, callback) {
    let k = (keyword || '').replace(/\s+/g, ' ').trim(); if (k.length > 200) k = k.substring(0, 200);
    const enc = encodeURIComponent(k);
    const htmlUrl = `https://www.luogu.com.cn/problem/list?keyword=${enc}&page=1&type=all`;
    if (typeof GM_xmlhttpRequest !== 'function') return callback(new Error('GM_xmlhttpRequest 不可用'));
    GM_xmlhttpRequest({ method: 'GET', url: htmlUrl, headers: { 'Accept': 'text/html' }, timeout: 12000, onload: res => { if (res.status !== 200) return callback(new Error('HTTP ' + res.status)); try { callback(null, parseLuoguHTML(res.responseText || '')); } catch (e) { callback(e); } }, onerror: () => callback(new Error('网络错误')), ontimeout: () => callback(new Error('请求超时')) });
  }

  function getSelectedText() { const sel = window.getSelection(); if (sel && sel.rangeCount > 0) { const t = sel.toString().trim().replace(/\s+/g, ' '); if (t && t.length >= 2 && t.length <= 500) return t; } return null; }
  function buildSearchKeyword() { const sel = getSelectedText(); if (sel) return sel; const title = OJ.getTitle(); const desc = extractDescription(); let kw = title || ''; if (desc && desc.length > 20) kw += (kw ? '\n\n' : '') + desc; if (!kw) kw = OJ.getCode() || ''; return kw.length > 15000 ? kw.substring(0, 15000) : kw; }

  const SEARCH_TARGETS = [
    { label: '洛谷', color: '#0969da', url: kw => `https://www.luogu.com.cn/problem/list?keyword=${encodeURIComponent(kw)}` },
    { label: 'VJudge', color: '#0969da', url: kw => `https://vjudge.net/problem#OJId=All&probNum=&title=${encodeURIComponent(kw)}` },
    { label: 'Codeforces', color: '#1f883d', url: kw => `https://www.bing.com/search?q=${encodeURIComponent('site:codeforces.com ' + kw)}` },
    { label: 'AtCoder', color: '#1f883d', url: kw => `https://www.bing.com/search?q=${encodeURIComponent('site:atcoder.jp ' + kw)}` },
    { label: 'Bing', color: '#6e7781', url: kw => `https://www.bing.com/search?q=${encodeURIComponent(kw + ' 题解')}` },
    { label: 'Google', color: '#6e7781', url: kw => `https://www.google.com/search?q=${encodeURIComponent(kw + ' 题解')}` },
  ];

  function renderSearchResults(kw, state, payload) {
    const box = $('#yunoj-search-results'); if (!box) return;
    if (state === 'loading') { box.innerHTML = `<div class="yunoj-search-tip"><span class="yunoj-spinner"></span>搜索中…</div>`; return; }
    if (state === 'empty') { const src = payload && payload.source; const manual = src === 'yuantiji' ? 'https://yuantiji.ac/' : (src === 'zhipu' ? `https://www.bing.com/search?q=${encodeURIComponent(kw + ' 题解')}` : `https://www.luogu.com.cn/problem/list?keyword=${encodeURIComponent(kw)}`); box.innerHTML = `<div class="yunoj-search-tip">无匹配结果。<a class="yunoj-search-manual" href="${manual}" target="_blank" rel="noopener">手动搜索 ↗</a></div>`; return; }
    if (state === 'error') { const src = payload && payload.source || 'yuantiji'; const manual = src === 'yuantiji' ? 'https://yuantiji.ac/' : (src === 'zhipu' ? `https://www.bing.com/search?q=${encodeURIComponent(kw + ' 题解')}` : `https://www.luogu.com.cn/problem/list?keyword=${encodeURIComponent(kw)}`); const msg = typeof payload === 'string' ? payload : (payload && payload.message) || '未知错误'; box.innerHTML = `<div class="yunoj-search-tip yunoj-search-err">搜索失败：${escapeHtml(msg)}　<a class="yunoj-search-manual" href="${manual}" target="_blank" rel="noopener">手动搜索 ↗</a></div>`; return; }
    if (state === 'ok') {
      const list = payload.list || []; const total = payload.total || list.length; const source = payload.source || 'yuantiji';
      const srcLabel = source === 'yuantiji' ? '原题机' : (source === 'zhipu' ? '智谱联网' : '洛谷');
      const header = `<div class="yunoj-search-results-header">${srcLabel}匹配到 <b>${total}</b> 条${total > list.length ? '，显示前 ' + list.length : ''}</div>`;
      const items = list.map(p => {
        if (source === 'yuantiji') { const src = p.src || '未知来源'; const url = p.url || '#'; const cos = (p.cos || 0).toFixed(3); return `<a class="yunoj-search-result" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(p.title)}"><span class="yunoj-search-src">${escapeHtml(src)}</span><span class="yunoj-search-title">${escapeHtml(p.title)}</span><span class="yunoj-search-cos">${cos}</span></a>`; }
        if (source === 'zhipu') { const src = p.src || '网页'; const url = p.url || '#'; return `<a class="yunoj-search-result" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(p.title)}"><span class="yunoj-search-src">${escapeHtml(src)}</span><span class="yunoj-search-title">${escapeHtml(p.title)}</span></a>`; }
        const pid = p.pid || p.problemId || ''; return `<a class="yunoj-search-result" href="https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}" target="_blank" rel="noopener" title="${escapeHtml(p.title)}"><span class="yunoj-search-pid">${escapeHtml(pid)}</span><span class="yunoj-search-title">${escapeHtml(p.title)}</span></a>`;
      }).join('');
      box.innerHTML = header + items;
    }
  }

  let searchTimer = null;
  function doSearch(kw) {
    if (!kw) { const box = $('#yunoj-search-results'); if (box) box.innerHTML = `<div class="yunoj-search-tip">输入关键词后自动后台搜索</div>`; return; }
    const mySeq = ++searchSeq; renderSearchResults(kw, 'loading');
    const source = get('searchSource') || 'yuantiji'; let query = kw;
    if (source === 'luogu') { query = kw.replace(/\s+/g, ' ').trim(); if (query.length > 200) query = query.substring(0, 200); }
    if (source === 'zhipu') { query = kw.replace(/\s+/g, ' ').trim(); if (query.length > 500) query = query.substring(0, 500); }
    let fn;
    if (source === 'zhipu') fn = (k, cb) => searchZhipuApi(k, cb, get('zhipuEngine') || 'search_pro');
    else if (source === 'luogu') fn = searchLuoguApi;
    else fn = searchYuantiji;
    fn(query, (err, data) => {
      if (mySeq !== searchSeq) return;
      if (err) return renderSearchResults(kw, 'error', { message: err.message, source });
      const list = (data && data.list) || [];
      if (list.length === 0) return renderSearchResults(kw, 'empty', { source });
      renderSearchResults(kw, 'ok', { list, total: data.total || list.length, source });
    });
  }
  function scheduleSearch(kw) { if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(() => doSearch(kw), 450); }

  function searchPanel() {
    if ($('#yunoj-search')) return;
    const panel = el('div', { id: 'yunoj-search' }); panel.style.display = 'none';
    const header = el('div', { class: 'yunoj-search-header' });
    header.appendChild(el('span', { class: 'yunoj-search-title' }, '原题搜索'));
    header.appendChild(el('span', { class: 'yunoj-search-hint' }, OJ.name));
    panel.appendChild(header);
    const sourceRow = el('div', { class: 'yunoj-search-source' });
    sourceRow.appendChild(el('span', { class: 'yunoj-search-src-label' }, '数据源：'));
    [['yuantiji', '原题机'], ['luogu', '洛谷'], ['zhipu', '智谱联网']].forEach(([src, label]) => {
      const btn = el('a', { class: 'yunoj-search-src' + (get('searchSource') === src ? ' yunoj-src-active' : ''), href: 'javascript:;', 'data-src': src }, label);
      btn.onclick = () => { set('searchSource', src); $$('.yunoj-search-src', panel).forEach(b => b.classList.toggle('yunoj-src-active', b.dataset.src === src)); updateEngineRow(); const kw = panel.__kwInput && panel.__kwInput.value.trim(); if (kw) doSearch(kw); };
      sourceRow.appendChild(btn);
    });
    panel.appendChild(sourceRow);

    // 智谱搜索引擎选择（仅在选中「智谱联网」时显示）
    const engineRow = el('div', { class: 'yunoj-search-engine-row' });
    engineRow.appendChild(el('span', { class: 'yunoj-search-src-label' }, '引擎：'));
    const engines = [
      ['search_std', '标准'],
      ['search_pro', '进阶'],
      ['search_pro_quark', '夸克'],
      ['search_pro_sogou', '搜狗'],
    ];
    const engineSel = el('select', { class: 'yunoj-search-engine' });
    engines.forEach(([v, t]) => { const opt = document.createElement('option'); opt.value = v; opt.textContent = t; if ((get('zhipuEngine') || 'search_pro') === v) opt.selected = true; engineSel.appendChild(opt); });
    engineSel.onchange = () => { set('zhipuEngine', engineSel.value); const kw = panel.__kwInput && panel.__kwInput.value.trim(); if (kw && (get('searchSource') === 'zhipu')) doSearch(kw); };
    engineRow.appendChild(engineSel);
    panel.appendChild(engineRow);
    const updateEngineRow = () => {
      engineRow.style.display = (get('searchSource') === 'zhipu') ? 'flex' : 'none';
    };
    updateEngineRow();

    const kwInput = el('input', { type: 'text', class: 'yunoj-search-kw', placeholder: '输入关键词或粘贴题面' });
    kwInput.addEventListener('input', () => scheduleSearch(kwInput.value.trim()));
    panel.appendChild(kwInput);
    const kwActions = el('div', { class: 'yunoj-search-actions' });
    const autoBtn = el('a', { class: 'yunoj-search-mini', href: 'javascript:;' }, '🔄 自动提取'); autoBtn.onclick = () => { const kw = buildSearchKeyword(); kwInput.value = kw; doSearch(kw); kwInput.focus(); }; kwActions.appendChild(autoBtn);
    const selBtn = el('a', { class: 'yunoj-search-mini', href: 'javascript:;' }, '📌 用选中文字'); selBtn.onclick = () => { const sel = getSelectedText(); if (sel) { kwInput.value = sel; doSearch(sel); } else { kwInput.focus(); } }; kwActions.appendChild(selBtn);
    const fullBtn = el('a', { class: 'yunoj-search-mini', href: 'javascript:;' }, '📋 用完整题面'); fullBtn.onclick = () => { const full = extractStatement(); if (full && full.length > 20) { kwInput.value = full; doSearch(full); } else { kwInput.focus(); } }; kwActions.appendChild(fullBtn);
    const clearBtn = el('a', { class: 'yunoj-search-mini', href: 'javascript:;' }, '✕ 清空'); clearBtn.onclick = () => { kwInput.value = ''; doSearch(''); kwInput.focus(); }; kwActions.appendChild(clearBtn);
    panel.appendChild(kwActions);
    const results = el('div', { id: 'yunoj-search-results', class: 'yunoj-search-results' });
    results.innerHTML = '<div class="yunoj-search-tip">输入关键词后自动后台搜索</div>'; panel.appendChild(results);
    const btnRow = el('div', { class: 'yunoj-search-targets' });
    SEARCH_TARGETS.forEach(t => { const btn = el('a', { class: 'yunoj-search-btn', href: 'javascript:;' }, t.label); btn.style.backgroundColor = t.color; btn.onclick = () => { const kw = kwInput.value.trim(); if (!kw) { kwInput.focus(); return; } const short = kw.length > 200 ? kw.substring(0, 200) : kw; window.open(t.url(short), '_blank', 'noopener'); }; btnRow.appendChild(btn); });
    panel.appendChild(btnRow);
    document.body.appendChild(panel);
    makeDraggable(panel, 'posSearch');
    document.addEventListener('mousedown', e => { const p = $('#yunoj-search'); if (!p || p.style.display === 'none') return; if (p.contains(e.target)) return; const t = $('.yunoj-search-toggle'); if (t && t.contains(e.target)) return; p.style.display = 'none'; });
    panel.__kwInput = kwInput;
  }

  // ============================================================
  // 工具栏
  // ============================================================
  function buildLuoguURL() { const title = OJ.getTitle(); const code = OJ.getCode(); let kw = title || code || ''; if (OJ.key === 'xinyoudui.com' || OJ.key === 'luogu.com.cn') { const desc = extractDescription(); if (desc && desc.length > 20) kw = (title || '') + ' ' + desc.substring(0, 300); } return `https://www.luogu.com.cn/problem/list?keyword=${encodeURIComponent(kw.trim().substring(0, 200))}`; }
  function getToolbarLabel() { if (OJ.key !== '__default') return OJ.name; const auto = get(autoKey()); if (auto === true) return 'UnknownOJ'; if (auto === false) return '工具'; return looksLikeOJ() ? 'UnknownOJ' : '工具'; }

  function jumpBar() {
    if ($('#yunoj-jump')) return;
    const code = OJ.getCode(); const label = getToolbarLabel();
    const bar = el('div', { id: 'yunoj-jump' });
    if (get('barCollapsed')) bar.classList.add('yunoj-collapsed');
    bar.appendChild(el('span', { class: 'yunoj-lb' }, label));
    if (get('origin')) {
      bar.appendChild(el('a', { class: 'yunoj-a', href: buildLuoguURL(), target: '_blank', rel: 'noopener' }, '洛谷'));
      const vjUrl = code ? `https://vjudge.net/problem#OJId=All&probNum=${encodeURIComponent(code)}` : `https://vjudge.net/problem`;
      bar.appendChild(el('a', { class: 'yunoj-a', href: vjUrl, target: '_blank', rel: 'noopener' }, 'VJudge'));
    }
    if (get('search')) { const sBtn = el('a', { class: 'yunoj-a yunoj-search-toggle', href: 'javascript:;' }, '🔍搜索'); sBtn.onclick = () => { const p = $('#yunoj-search'); if (!p) return; if (p.style.display === 'none') { const sel = getSelectedText(); const kw = sel || buildSearchKeyword(); const kwInput = p.__kwInput; if (kwInput) kwInput.value = kw; p.style.display = 'block'; if (kw) doSearch(kw); if (kwInput) setTimeout(() => kwInput.focus(), 30); } else p.style.display = 'none'; }; bar.appendChild(sBtn); }
    if (get('translate')) { const tBtn = el('a', { class: 'yunoj-a yunoj-trans-toggle', href: 'javascript:;' }, '🌐翻译'); tBtn.onclick = () => { const p = $('#yunoj-trans'); if (!p) return; if (p.style.display === 'none') { doTranslate(); } else { if (translateAbort) translateAbort(); p.style.display = 'none'; } }; bar.appendChild(tBtn); }
    if (get('ai')) {
      const aiBtn = el('a', { class: 'yunoj-a yunoj-ai-toggle', href: 'javascript:;' }, '🤖解答');
      aiBtn.onclick = () => { const p = $('#yunoj-ai'); if (!p) return; if (p.style.display === 'none' || p.style.display === '') { askAI(false); } else { p.style.display = 'none'; } };
      bar.appendChild(aiBtn);
    }
    if (get('statement')) { const stBtn = el('a', { class: 'yunoj-a yunoj-statement-btn', href: 'javascript:;' }, '复制题面'); stBtn.onclick = () => { const text = extractStatement(); if (!text) { stBtn.textContent = '未识别'; setTimeout(() => stBtn.textContent = '复制题面', 1200); return; } copy(text, () => { stBtn.textContent = `已复制(${text.length}字)`; setTimeout(() => stBtn.textContent = '复制题面', 1500); }); }; bar.appendChild(stBtn); }
    if (code) { const codeBtn = el('a', { class: 'yunoj-a yunoj-copy-pid', href: 'javascript:;' }, `#${code}`); codeBtn.onclick = () => copy(code, () => { codeBtn.textContent = '已复制'; setTimeout(() => codeBtn.textContent = `#${code}`, 1000); }); bar.appendChild(codeBtn); }
    const collapseBtn = el('a', { class: 'yunoj-a yunoj-collapse-btn', href: 'javascript:;', title: get('barCollapsed') ? '展开工具栏' : '折叠工具栏' }, get('barCollapsed') ? '🔧' : '−');
    collapseBtn.onclick = () => {
      const now = bar.classList.toggle('yunoj-collapsed');
      collapseBtn.textContent = now ? '🔧' : '−';
      collapseBtn.title = now ? '展开工具栏' : '折叠工具栏';
      set('barCollapsed', now);
      if (now) { const p = $('#yunoj-search'); if (p) p.style.display = 'none'; const t = $('#yunoj-trans'); if (t) t.style.display = 'none'; const a = $('#yunoj-ai'); if (a) a.style.display = 'none'; }
    };
    bar.appendChild(collapseBtn);
    document.body.appendChild(bar);
    makeDraggable(bar, 'posBar');
  }

  const applyDark = () => document.documentElement.classList.toggle('yunoj-dark', get('dark'));

  // ============================================================
  // 自定义 OJ
  // ============================================================
  let __refreshOjList = null;
  function ojConfigPanel() {
    if ($('#yunoj-oj-config')) return;
    const panel = el('div', { id: 'yunoj-oj-config' }); panel.style.display = 'none';
    const header = el('div', { class: 'yunoj-ojconfig-header' });
    header.appendChild(el('span', { class: 'yunoj-ojconfig-title' }, '自定义 OJ'));
    const closeBtn = el('a', { class: 'yunoj-ojconfig-btn', href: 'javascript:;', title: '关闭' }, '✕');
    closeBtn.onclick = () => { panel.style.display = 'none'; };
    header.appendChild(closeBtn);
    panel.appendChild(header);
    panel.appendChild(el('div', { class: 'yunoj-ojconfig-desc' }, '输入网址或域名，添加后该域名下的页面会显示你设定的名称。'));
    const list = el('div', { class: 'yunoj-ojconfig-list' }); panel.appendChild(list);
    const addRow = el('div', { class: 'yunoj-ojconfig-add' });
    const urlInput = el('input', { type: 'text', class: 'yunoj-ojconfig-input', placeholder: '网址或域名，如 qoj.ac' });
    const nameInput = el('input', { type: 'text', class: 'yunoj-ojconfig-input', placeholder: '显示名称，如 QOJ' });
    addRow.appendChild(urlInput); addRow.appendChild(nameInput); panel.appendChild(addRow);
    const actionsRow = el('div', { class: 'yunoj-ojconfig-actions' });
    const hint = el('span', { class: 'yunoj-ojconfig-hint' }, '');
    actionsRow.appendChild(hint);
    const addBtn = el('a', { class: 'yunoj-ojconfig-addbtn', href: 'javascript:;' }, '+ 添加');
    actionsRow.appendChild(addBtn); panel.appendChild(actionsRow);
    const renderList = () => {
      list.innerHTML = '';
      const userOJs = getUserOJs(); const keys = Object.keys(userOJs);
      if (keys.length === 0) { list.innerHTML = '<div class="yunoj-ojconfig-empty">还没有自定义 OJ</div>'; return; }
      for (const k of keys) {
        const row = el('div', { class: 'yunoj-ojconfig-row' });
        row.appendChild(el('span', { class: 'yunoj-ojconfig-row-host' }, k));
        row.appendChild(el('span', { class: 'yunoj-ojconfig-row-arrow' }, '→'));
        row.appendChild(el('span', { class: 'yunoj-ojconfig-row-name' }, userOJs[k]));
        const delBtn = el('a', { class: 'yunoj-ojconfig-del', href: 'javascript:;', title: '删除' }, '×');
        delBtn.onclick = () => { const u = getUserOJs(); delete u[k]; saveUserOJs(u); renderList(); };
        row.appendChild(delBtn);
        list.appendChild(row);
      }
    };
    __refreshOjList = renderList; renderList();
    addBtn.onclick = () => {
      const rawUrl = (urlInput.value || '').trim(); const rawName = (nameInput.value || '').trim();
      if (!rawUrl || !rawName) { hint.style.color = '#c00'; hint.textContent = '请填写网址和名称'; setTimeout(() => { hint.textContent = ''; hint.style.color = ''; }, 2500); return; }
      let host; try { host = /^https?:\/\//i.test(rawUrl) ? new URL(rawUrl).hostname : rawUrl.split('/')[0]; } catch (e) { host = rawUrl.split('/')[0]; }
      host = host.replace(/^www\./i, '').toLowerCase();
      if (!host || host.length < 3 || host.indexOf('.') === -1) { hint.style.color = '#c00'; hint.textContent = '网址格式不正确'; setTimeout(() => { hint.textContent = ''; hint.style.color = ''; }, 2500); return; }
      const userOJs = getUserOJs(); userOJs[host] = rawName; saveUserOJs(userOJs);
      urlInput.value = ''; nameInput.value = ''; renderList();
      hint.style.color = '#0969da'; hint.textContent = '已添加：' + host + ' → ' + rawName;
      setTimeout(() => { hint.textContent = ''; }, 2500);
      const h = location.hostname.replace(/^www\./, '').toLowerCase();
      if (h === host || h.endsWith('.' + host)) hint.textContent = '已添加，刷新页面后生效';
    };
    document.body.appendChild(panel);
    makeDraggable(panel, 'posOjConfig');
  }

  // ============================================================
  // 设置面板
  // ============================================================
  function panel() {
    if ($('#yunoj-fab')) return;
    const fab = el('button', { id: 'yunoj-fab', type: 'button', title: 'Yun OJ Better 设置（可拖动）' }, '⚙');
    const p = el('div', { id: 'yunoj-panel' }); p.style.display = 'none';
    const mk = (k, label) => { const l = el('label'); const i = el('input', { type: 'checkbox' }); i.checked = get(k); i.dataset.k = k; l.appendChild(i); l.appendChild(el('span', null, label)); return l; };
    const ck = [mk('origin', '原题识别'), mk('search', '原题搜索'), mk('translate', '自动翻译'), mk('ai', 'AI 解答'), mk('statement', '复制题面'), mk('sample', '样例复制'), mk('dark', '深色模式')];
    const save = el('button', { class: 'yunoj-save', type: 'button' }, '保存');
    ck.forEach(c => p.appendChild(c)); p.appendChild(save);
    
    const aiCfgBtn = el('button', { class: 'yunoj-ojconfig-open', type: 'button' }, 'AI 设置');
    aiCfgBtn.onclick = () => { aiConfigPanel(); const c = $('#yunoj-ai-cfg'); if (c) c.style.display = 'block'; p.style.display = 'none'; };
    p.appendChild(aiCfgBtn);

    const transCfgBtn = el('button', { class: 'yunoj-ojconfig-open', type: 'button' }, '翻译设置');
    transCfgBtn.onclick = () => { transConfigPanel(); const c = $('#yunoj-trans-cfg'); if (c) c.style.display = 'block'; p.style.display = 'none'; };
    p.appendChild(transCfgBtn);

    const ojConfigBtn = el('button', { class: 'yunoj-ojconfig-open', type: 'button' }, '配置 OJ');
    ojConfigBtn.onclick = () => { ojConfigPanel(); if (__refreshOjList) __refreshOjList(); const cfg = $('#yunoj-oj-config'); if (cfg) { cfg.style.display = 'block'; p.style.display = 'none'; } };
    p.appendChild(ojConfigBtn);
    if (OJ.key === '__default') {
      const pref = getPref();
      const info = el('div', { class: 'yunoj-pref-info' }, `本站判定：${pref === 'yes' ? '已启用' : pref === 'no' ? '未启用' : '未决定'}`);
      p.appendChild(info);
      const resetBtn = el('button', { class: 'yunoj-reset', type: 'button' }, '重置本站判定');
      resetBtn.onclick = () => { set(prefKey(), null); set(autoKey(), null); info.textContent = '本站判定：未决定（刷新后重新询问）'; };
      p.appendChild(resetBtn);
    }
    save.onclick = () => {
      ck.forEach(c => set(c.querySelector('input').dataset.k, c.querySelector('input').checked));
      applyDark();
      ['#yunoj-jump', '#yunoj-search', '#yunoj-trans', '#yunoj-ai'].forEach(sel => { const n = $(sel); if (n) n.remove(); });
      searchPanel(); translationPanel(); aiPanel();
      if (get('origin') || get('statement') || get('search') || get('translate') || get('ai')) jumpBar();
      $$('.yunoj-copy').forEach(b => b.remove());
      if (get('sample')) sampleCopy();
      p.style.display = 'none';
    };
    fab.onclick = () => p.style.display = p.style.display === 'none' ? 'block' : 'none';
    document.body.appendChild(fab); document.body.appendChild(p);
    makeDraggable(fab, 'posFab'); makeDraggable(p, 'posPanel');
  }

  function showAskDialog(onYes, onNo) {
    const old = $('#yunoj-ask'); if (old) old.remove();
    const box = el('div', { id: 'yunoj-ask' });
    box.appendChild(el('div', { class: 'yunoj-ask-title' }, 'Yun OJ Better'));
    box.appendChild(el('div', { class: 'yunoj-ask-desc' }, '当前网站似乎不是 OJ 题目页。是否仍要启用 OJ 增强功能？（选择会按域名记住，可在设置里重置）'));
    const actions = el('div', { class: 'yunoj-ask-actions' });
    const noBtn = el('a', { class: 'yunoj-ask-btn', href: 'javascript:;' }, '不启用');
    noBtn.onclick = () => { setPref('no'); set(autoKey(), null); box.remove(); onNo && onNo(); };
    const yesBtn = el('a', { class: 'yunoj-ask-btn yunoj-ask-yes', href: 'javascript:;' }, '启用');
    yesBtn.onclick = () => { setPref('yes'); set(autoKey(), looksLikeOJ()); box.remove(); onYes && onYes(); };
    actions.appendChild(noBtn); actions.appendChild(yesBtn);
    box.appendChild(actions);
    document.body.appendChild(box);
  }
  function showReEntryButton() {
    if ($('#yunoj-reentry')) return;
    const btn = el('button', { id: 'yunoj-reentry', type: 'button', title: 'Yun OJ Better（点击重新选择是否启用）' }, 'OJ');
    btn.onclick = () => { showAskDialog(() => { btn.remove(); init(); }, () => {}); };
    document.body.appendChild(btn);
    makeDraggable(btn, 'posReentry');
  }

  // ============================================================
  // 拖动
  // ============================================================
  function setPosition(elem, x, y) { const w = elem.offsetWidth || 100, h = elem.offsetHeight || 40; x = Math.max(0, Math.min(x, window.innerWidth - w)); y = Math.max(0, Math.min(y, window.innerHeight - h)); elem.style.left = x + 'px'; elem.style.top = y + 'px'; elem.style.right = 'auto'; elem.style.bottom = 'auto'; }
  function shouldSkipDrag(e) { const t = e.target; if (t.closest('input, textarea, select, details, summary')) return true; const a = t.closest('a'); if (a) { const href = a.getAttribute('href') || ''; if (!href.startsWith('javascript:')) return true; } return false; }
  function makeDraggable(elem, key) {
    if (!elem || elem.__draggable) return;
    elem.__draggable = true;
    const saved = get(key);
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') { elem.style.left = saved.x + 'px'; elem.style.top = saved.y + 'px'; elem.style.right = 'auto'; elem.style.bottom = 'auto'; }
    elem.addEventListener('mousedown', e => {
      if (e.button !== 0 || shouldSkipDrag(e)) return;
      const startX = e.clientX, startY = e.clientY;
      const rect = elem.getBoundingClientRect();
      const startLeft = rect.left, startTop = rect.top;
      let moved = false;
      const onMove = ev => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!moved) { if (Math.abs(dx) + Math.abs(dy) < 3) return; moved = true; elem.style.left = startLeft + 'px'; elem.style.top = startTop + 'px'; elem.style.right = 'auto'; elem.style.bottom = 'auto'; elem.classList.add('yunoj-dragging'); }
        ev.preventDefault();
        elem.style.left = (startLeft + dx) + 'px'; elem.style.top = (startTop + dy) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
        elem.classList.remove('yunoj-dragging');
        if (moved) {
          const w = elem.offsetWidth, h = elem.offsetHeight;
          const x = parseFloat(elem.style.left) || 0, y = parseFloat(elem.style.top) || 0;
          const cx = Math.max(0, Math.min(x, window.innerWidth - w));
          const cy = Math.max(0, Math.min(y, window.innerHeight - h));
          elem.style.left = cx + 'px'; elem.style.top = cy + 'px';
          set(key, { x: cx, y: cy });
          const blockClick = ev => { ev.stopPropagation(); ev.preventDefault(); };
          document.addEventListener('click', blockClick, { capture: true, once: true });
          setTimeout(() => document.removeEventListener('click', blockClick, true), 50);
        }
      };
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    });
  }

  // ============================================================
  // CSS
  // ============================================================
  function css() {
    const c = [
      'html.yunoj-dark{filter:invert(.9) hue-rotate(180deg);background:#111}',
      'html.yunoj-dark img,html.yunoj-dark video,html.yunoj-dark iframe,html.yunoj-dark canvas{filter:invert(1) hue-rotate(180deg)}',
      '.yunoj-copy{margin-left:8px;padding:1px 8px;font-size:12px;border:1px solid #999;border-radius:4px;background:#fff;color:#222;cursor:pointer;vertical-align:middle}',
      '.yunoj-copy:hover{background:#f0f0f0}',
      '.yunoj-dragging{transition:none !important}',
      '#yunoj-fab,#yunoj-jump,#yunoj-panel,#yunoj-search,#yunoj-trans,#yunoj-reentry,#yunoj-oj-config,#yunoj-ai,#yunoj-ai-cfg,#yunoj-trans-cfg{cursor:grab;font-family:system-ui,-apple-system,sans-serif;color:#222;box-sizing:border-box}',
      '#yunoj-fab.yunoj-dragging,#yunoj-jump.yunoj-dragging,#yunoj-panel.yunoj-dragging,#yunoj-search.yunoj-dragging,#yunoj-trans.yunoj-dragging,#yunoj-reentry.yunoj-dragging,#yunoj-oj-config.yunoj-dragging,#yunoj-ai.yunoj-dragging,#yunoj-ai-cfg.yunoj-dragging,#yunoj-trans-cfg.yunoj-dragging{cursor:grabbing}',
      '#yunoj-jump .yunoj-a,#yunoj-panel label,#yunoj-panel input,#yunoj-panel button,#yunoj-search input,#yunoj-search select,#yunoj-oj-config input,#yunoj-ai-cfg input,#yunoj-ai-cfg select,#yunoj-trans-cfg input,#yunoj-trans-cfg select,#yunoj-trans-cfg textarea{cursor:pointer}',
      '#yunoj-search input,#yunoj-trans textarea,#yunoj-oj-config input,#yunoj-ai-cfg input,#yunoj-trans-cfg textarea{cursor:text}',
      '#yunoj-search a,#yunoj-trans a,#yunoj-oj-config a,#yunoj-ai a,#yunoj-ai-cfg a,#yunoj-trans-cfg a{cursor:pointer}',
      '#yunoj-fab,#yunoj-jump,#yunoj-panel,#yunoj-search,#yunoj-trans,#yunoj-oj-config,#yunoj-ai,#yunoj-ai-cfg,#yunoj-trans-cfg{user-select:none;-webkit-user-select:none}',
      '#yunoj-panel input,#yunoj-search input,#yunoj-trans .yunoj-trans-body,#yunoj-oj-config input,#yunoj-ai-cfg input,#yunoj-ai-cfg select,#yunoj-ai .yunoj-ai-body,#yunoj-trans-cfg input,#yunoj-trans-cfg select,#yunoj-trans-cfg textarea{user-select:text;-webkit-user-select:text}',
      '#yunoj-fab{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:44px;height:44px;border-radius:50%;border:none;background:#0969da;color:#fff;font-size:20px;cursor:grab;box-shadow:0 2px 8px rgba(0,0,0,.3)}',
      '#yunoj-fab:hover{background:#0550ae}',
      '#yunoj-panel{position:fixed;right:18px;bottom:72px;z-index:2147483001;width:220px;padding:12px;background:#fff;border:1px solid #ccc;border-radius:8px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.2)}',
      '#yunoj-panel label{display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer}',
      '#yunoj-panel .yunoj-save{margin-top:8px;padding:4px 12px;border:none;border-radius:4px;background:#0969da;color:#fff;cursor:pointer}',
      '#yunoj-panel .yunoj-save:hover{background:#0550ae}',
      '#yunoj-panel .yunoj-ojconfig-open{margin-top:8px;width:100%;padding:5px 10px;border:1px solid #ccc;border-radius:4px;background:#f6f8fa;color:#444;cursor:pointer;font-size:12px;font-family:inherit}',
      '#yunoj-panel .yunoj-ojconfig-open:hover{background:#eaeef2;border-color:#999}',
      '#yunoj-panel .yunoj-pref-info{margin-top:10px;padding-top:8px;border-top:1px dashed #eaeef2;font-size:11px;color:#888}',
      '#yunoj-panel .yunoj-reset{margin-top:6px;padding:3px 10px;border:1px solid #ccc;border-radius:4px;background:#f6f8fa;color:#444;cursor:pointer;font-size:11px}',
      '#yunoj-panel .yunoj-reset:hover{background:#eaeef2}',
      '#yunoj-jump{position:fixed;top:12px;right:12px;z-index:2147482999;display:flex;align-items:center;gap:6px;padding:6px 10px;background:#fff;border:1px solid #ccc;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);font-size:13px}',
      '#yunoj-jump .yunoj-lb{color:#666}',
      '#yunoj-jump .yunoj-a{padding:2px 10px;border-radius:4px;background:#0969da;color:#fff;text-decoration:none;cursor:pointer}',
      '#yunoj-jump .yunoj-a:hover{background:#0550ae}',
      '#yunoj-jump .yunoj-statement-btn{background:#1f883d}',
      '#yunoj-jump .yunoj-statement-btn:hover{background:#1a7f37}',
      '#yunoj-jump .yunoj-search-toggle{background:#8250df}',
      '#yunoj-jump .yunoj-search-toggle:hover{background:#6639ba}',
      '#yunoj-jump .yunoj-trans-toggle{background:#0ea5e9}',
      '#yunoj-jump .yunoj-trans-toggle:hover{background:#0284c7}',
      '#yunoj-jump .yunoj-ai-toggle{background:#d97706}',
      '#yunoj-jump .yunoj-ai-toggle:hover{background:#b45309}',
      '#yunoj-jump .yunoj-copy-pid{background:#6e7781}',
      '#yunoj-jump .yunoj-copy-pid:hover{background:#57606a}',
      '#yunoj-jump .yunoj-collapse-btn{background:#6e7781;padding:2px 8px;font-weight:bold;line-height:1;min-width:22px;text-align:center}',
      '#yunoj-jump .yunoj-collapse-btn:hover{background:#57606a}',
      '#yunoj-jump.yunoj-collapsed{padding:4px;gap:0}',
      '#yunoj-jump.yunoj-collapsed .yunoj-lb{display:none}',
      '#yunoj-jump.yunoj-collapsed .yunoj-a:not(.yunoj-collapse-btn){display:none}',
      '#yunoj-jump.yunoj-collapsed .yunoj-collapse-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border-radius:50%;font-size:16px;font-weight:normal}',
      '#yunoj-search{position:fixed;top:56px;right:12px;z-index:2147482998;width:400px;padding:12px;background:#fff;border:1px solid #ccc;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.2);font-size:13px}',
      '#yunoj-search .yunoj-search-header{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}',
      '#yunoj-search .yunoj-search-title{font-weight:600;font-size:14px}',
      '#yunoj-search .yunoj-search-hint{font-size:11px;color:#999}',
      '#yunoj-search .yunoj-search-source{display:flex;align-items:center;gap:6px;margin-bottom:8px}',
      '#yunoj-search .yunoj-search-engine-row{display:none;align-items:center;gap:6px;margin-bottom:8px}',
      '#yunoj-search .yunoj-search-src-label{font-size:11px;color:#666}',
      '#yunoj-search .yunoj-search-src{padding:2px 10px;border:1px solid #ccc;border-radius:4px;font-size:11px;color:#444;text-decoration:none;background:#f6f8fa;cursor:pointer}',
      '#yunoj-search .yunoj-search-src:hover{background:#eaeef2}',
      '#yunoj-search .yunoj-search-src.yunoj-src-active{background:#0969da;color:#fff;border-color:#0969da}',
      '#yunoj-search .yunoj-search-engine{padding:2px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px;background:#fff;outline:none;font-family:inherit;cursor:pointer}',
      '#yunoj-search .yunoj-search-engine:focus{border-color:#0969da}',
      '#yunoj-search .yunoj-search-kw{width:100%;padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;outline:none;box-sizing:border-box;font-family:inherit}',
      '#yunoj-search .yunoj-search-kw:focus{border-color:#0969da;box-shadow:0 0 0 2px rgba(9,105,218,.15)}',
      '#yunoj-search .yunoj-search-actions{display:flex;gap:8px;margin-top:6px;margin-bottom:10px;flex-wrap:wrap}',
      '#yunoj-search .yunoj-search-mini{padding:2px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px;color:#444;text-decoration:none;background:#f6f8fa;cursor:pointer}',
      '#yunoj-search .yunoj-search-mini:hover{background:#eaeef2;border-color:#999}',
      '#yunoj-search .yunoj-search-results{min-height:80px;max-height:300px;overflow-y:auto;margin-bottom:10px;padding:8px;border:1px solid #eaeef2;border-radius:6px;background:#fafbfc}',
      '#yunoj-search .yunoj-search-tip{font-size:12px;color:#888;padding:8px 4px;display:flex;align-items:center;flex-wrap:wrap;gap:4px}',
      '#yunoj-search .yunoj-search-err{color:#c00}',
      '#yunoj-search .yunoj-search-manual{color:#0969da;text-decoration:none;font-size:12px}',
      '#yunoj-search .yunoj-search-results-header{font-size:11px;color:#666;margin-bottom:6px;padding:0 2px}',
      '#yunoj-search .yunoj-search-result{display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:4px;border-radius:4px;background:#fff;border:1px solid #eaeef2;text-decoration:none;color:#222;cursor:pointer}',
      '#yunoj-search .yunoj-search-result:hover{background:#eef6ff;border-color:#0969da}',
      '#yunoj-search .yunoj-search-pid{flex-shrink:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;font-weight:600;color:#0969da;background:#e6f4ff;padding:1px 6px;border-radius:3px;min-width:56px;text-align:center}',
      '#yunoj-search .yunoj-search-src{flex-shrink:0;font-size:11px;font-weight:600;color:#c2410c;background:#fff7ed;border:1px solid #fed7aa;padding:1px 6px;border-radius:3px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#yunoj-search .yunoj-search-title{flex:1;font-size:13px;color:#222;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
      '#yunoj-search .yunoj-search-cos{flex-shrink:0;font-size:11px;color:#999;font-family:ui-monospace,Menlo,Consolas,monospace}',
      '#yunoj-search .yunoj-spinner{display:inline-block;width:12px;height:12px;border:2px solid #ccc;border-top-color:#0969da;border-radius:50%;animation:yunoj-spin .8s linear infinite;vertical-align:-2px;margin-right:6px}',
      '@keyframes yunoj-spin{to{transform:rotate(360deg)}}',
      '#yunoj-search .yunoj-search-targets{display:flex;flex-wrap:wrap;gap:6px}',
      '#yunoj-search .yunoj-search-btn{padding:5px 12px;border-radius:4px;color:#fff;text-decoration:none;font-size:12px;cursor:pointer;white-space:nowrap}',
      '#yunoj-search .yunoj-search-btn:hover{opacity:.85}',
      '#yunoj-trans{position:fixed;top:56px;left:12px;z-index:2147482997;width:480px;max-height:80vh;display:flex;flex-direction:column;background:#fff;border:1px solid #ccc;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.2);font-size:13px}',
      '#yunoj-trans .yunoj-trans-header{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #eaeef2;background:#f6f8fa;border-radius:8px 8px 0 0;flex-shrink:0}',
      '#yunoj-trans .yunoj-trans-title{font-weight:600;font-size:13px;flex:1}',
      '#yunoj-trans .yunoj-trans-status{font-size:11px;color:#888;font-family:ui-monospace,Menlo,monospace;margin-right:4px}',
      '#yunoj-trans .yunoj-trans-btn{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:22px;padding:0 6px;border-radius:4px;font-size:12px;color:#444;text-decoration:none;background:#fff;border:1px solid #ddd;cursor:pointer;font-family:inherit}',
      '#yunoj-trans .yunoj-trans-btn:hover{background:#f0f0f0}',
      '#yunoj-trans .yunoj-trans-body{overflow-y:auto;padding:10px 14px 14px;line-height:1.7;font-size:13.5px;color:#222;flex:1;min-height:80px}',
      '#yunoj-trans .yunoj-trans-empty{color:#999;text-align:center;padding:24px 8px;font-size:12.5px}',
      '#yunoj-trans .yunoj-trans-para{margin-bottom:10px;padding-bottom:8px;border-bottom:1px dashed #eaeef2}',
      '#yunoj-trans .yunoj-trans-para:last-child{border-bottom:0;margin-bottom:0;padding-bottom:0}',
      '#yunoj-trans .yunoj-trans-text{white-space:pre-wrap;word-break:break-word}',
      '#yunoj-trans .yunoj-trans-err{color:#c00}',
      '#yunoj-trans .yunoj-trans-progress{position:sticky;top:0;height:3px;background:#eaeef2;border-radius:2px;margin-bottom:10px;overflow:hidden;z-index:1}',
      '#yunoj-trans .yunoj-trans-progress-fill{height:100%;width:0;background:linear-gradient(90deg,#0ea5e9,#0969da);transition:width .3s ease}',
      '#yunoj-ai{position:fixed;top:80px;right:12px;z-index:2147482995;width:520px;height:600px;max-height:85vh;display:flex;flex-direction:column;background:#fff;border:1px solid #ccc;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.18);font-size:13px}',
      '#yunoj-ai .yunoj-ai-header{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid #eaeef2;background:#f6f8fa;border-radius:10px 10px 0 0;flex-shrink:0}',
      '#yunoj-ai .yunoj-ai-title{font-weight:600;font-size:13px;flex:1}',
      '#yunoj-ai .yunoj-ai-status{font-size:11px;color:#888;font-family:ui-monospace,Menlo,monospace;margin-right:4px}',
      '#yunoj-ai .yunoj-ai-btn{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:22px;padding:0 6px;border-radius:4px;font-size:12px;color:#444;text-decoration:none;background:#fff;border:1px solid #ddd;cursor:pointer;font-family:inherit}',
      '#yunoj-ai .yunoj-ai-btn:hover{background:#f0f0f0}',
      '#yunoj-ai .yunoj-ai-stop{color:#c00;border-color:#f0c0c0}',
      '#yunoj-ai .yunoj-ai-stop:hover{background:#ffe0e0;border-color:#c00}',
      '#yunoj-ai .yunoj-ai-body{overflow-y:auto;padding:12px 16px;flex:1;font-size:13.5px;line-height:1.75;color:#222;user-select:text}',
      '#yunoj-ai .yunoj-ai-body p{margin:0 0 8px}',
      '#yunoj-ai .yunoj-ai-body h2,#yunoj-ai .yunoj-ai-body h3,#yunoj-ai .yunoj-ai-body h4{margin:12px 0 6px;font-weight:600}',
      '#yunoj-ai .yunoj-ai-body h2{font-size:16px}',
      '#yunoj-ai .yunoj-ai-body h3{font-size:15px}',
      '#yunoj-ai .yunoj-ai-body h4{font-size:14px}',
      '#yunoj-ai .yunoj-ai-body code{background:#f0f3f6;color:#c7254e;padding:1px 5px;border-radius:3px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px}',
      '#yunoj-ai .yunoj-ai-body strong{font-weight:600}',
      '#yunoj-ai .yunoj-ai-pre{position:relative;margin:8px 0;padding:24px 12px 10px;background:#f6f8fa;border:1px solid #e1e4e8;border-radius:6px;overflow-x:auto}',
      '#yunoj-ai .yunoj-ai-pre code{display:block;background:transparent;color:#24292e;padding:0;border-radius:0;font-size:12.5px;line-height:1.5;white-space:pre;font-family:ui-monospace,Menlo,Consolas,monospace}',
      '#yunoj-ai .yunoj-ai-code-lang{position:absolute;top:0;left:0;right:0;height:22px;padding:0 10px;font-size:11px;line-height:22px;color:#666;background:#ebeff3;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;font-family:ui-monospace,Menlo,monospace}',
      '#yunoj-ai .yunoj-ai-code-copy{cursor:pointer;color:#0969da;user-select:none}',
      '#yunoj-ai .yunoj-ai-code-copy:hover{text-decoration:underline}',
      '#yunoj-ai .yunoj-ai-live{padding:6px 10px;margin:0 0 10px;border-radius:6px;font-size:12px;font-family:ui-monospace,Menlo,Consolas,monospace;color:#555;background:#f6f8fa;border:1px solid #eaeef2;display:flex;align-items:center;flex-wrap:wrap;line-height:1.6}',
      '#yunoj-ai .yunoj-ai-live b{color:#0969da;font-weight:600}',
      '#yunoj-ai .yunoj-ai-live-ok{background:#f0fff4;border-color:#a7f3d0;color:#1a7f37}',
      '#yunoj-ai .yunoj-ai-live-ok b{color:#1a7f37}',
      '#yunoj-ai .yunoj-ai-live-err{background:#fff5f5;border-color:#fecaca;color:#c00}',
      '#yunoj-ai .yunoj-ai-live-err b{color:#c00}',
      '#yunoj-ai .yunoj-ai-think{margin:8px 0 12px;border:1px solid #eaeef2;border-radius:6px;background:#fafbfc;font-size:12.5px}',
      '#yunoj-ai .yunoj-ai-think summary{cursor:pointer;padding:6px 10px;color:#666;user-select:none;outline:none;font-weight:500}',
      '#yunoj-ai .yunoj-ai-think summary:hover{color:#0969da}',
      '#yunoj-ai .yunoj-ai-think-body{padding:0 10px 10px;color:#777;line-height:1.7;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow-y:auto;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}',
      '#yunoj-ai .yunoj-ai-empty{color:#999;text-align:center;padding:40px 8px;font-size:13px}',
      '#yunoj-ai .yunoj-ai-err{color:#c00}',
      '#yunoj-ai .yunoj-ai-tip{padding:20px 8px;text-align:center;color:#888;font-size:12.5px;line-height:1.7}',
      '#yunoj-ai .yunoj-ai-footer{padding:6px 12px;border-top:1px solid #eaeef2;background:#f8f9fa;font-size:11px;color:#999;font-family:ui-monospace,Menlo,monospace;border-radius:0 0 10px 10px;flex-shrink:0}',
      '#yunoj-ai .katex{font-size:1.05em}',
      '#yunoj-ai .katex-display{margin:10px 0;overflow-x:auto;overflow-y:hidden;padding:4px 0}',
      '#yunoj-ai .katex-display > .katex{display:block;text-align:center;white-space:nowrap}',
      '#yunoj-ai-cfg,#yunoj-trans-cfg{position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:2147482996;width:460px;padding:16px;background:#fff;border:1px solid #ccc;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.18);font-size:13px}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-header,#yunoj-trans-cfg .yunoj-ai-cfg-header{display:flex;align-items:center;gap:8px;margin-bottom:12px}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-title,#yunoj-trans-cfg .yunoj-ai-cfg-title{font-weight:600;font-size:14px;flex:1}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-btn,#yunoj-trans-cfg .yunoj-ai-cfg-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:4px;color:#666;text-decoration:none;font-size:14px;cursor:pointer}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-btn:hover,#yunoj-trans-cfg .yunoj-ai-cfg-btn:hover{background:#f0f0f0;color:#222}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-profilebar{display:flex;gap:6px;align-items:center;margin-bottom:12px}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-select{flex:1;min-width:0;padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:12.5px;outline:none;font-family:inherit;background:#fff;cursor:pointer;box-sizing:border-box}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-select:focus{border-color:#0969da;box-shadow:0 0 0 2px rgba(9,105,218,.15)}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-mini{padding:5px 10px;border:1px solid #ccc;border-radius:4px;background:#f6f8fa;color:#444;text-decoration:none;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-mini:hover{background:#eaeef2;border-color:#999}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-del{color:#c00;border-color:#f0c0c0}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-del:hover{background:#ffe0e0;border-color:#c00}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-field,#yunoj-trans-cfg .yunoj-ai-cfg-field{margin-bottom:10px}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-label,#yunoj-trans-cfg .yunoj-ai-cfg-label{display:block;font-size:12px;color:#666;margin-bottom:4px}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-input,#yunoj-trans-cfg .yunoj-ai-cfg-input{width:100%;padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:12.5px;outline:none;font-family:inherit;box-sizing:border-box}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-input:focus,#yunoj-trans-cfg .yunoj-ai-cfg-input:focus{border-color:#0969da;box-shadow:0 0 0 2px rgba(9,105,218,.15)}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-tip,#yunoj-trans-cfg .yunoj-ai-cfg-tip{font-size:11px;color:#888;line-height:1.6;margin:8px 0 12px;padding:8px;background:#f6f8fa;border-radius:4px}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-actions,#yunoj-trans-cfg .yunoj-ai-cfg-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-hint,#yunoj-trans-cfg .yunoj-ai-cfg-hint{color:#0969da;font-size:11px;flex:1}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-save,#yunoj-trans-cfg .yunoj-ai-cfg-save{padding:5px 16px;border:none;border-radius:4px;background:#0969da;color:#fff;text-decoration:none;font-size:12px;cursor:pointer;font-family:inherit}',
      '#yunoj-ai-cfg .yunoj-ai-cfg-save:hover,#yunoj-trans-cfg .yunoj-ai-cfg-save:hover{background:#0550ae}',
      '.yunoj-trans-custom-fields textarea.yunoj-ai-cfg-input{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.4;resize:vertical}',
      '#yunoj-ask{position:fixed;right:18px;bottom:80px;z-index:2147483002;width:320px;padding:16px;background:#fff;border:1px solid #ccc;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.18);font-family:system-ui,sans-serif;font-size:13px;color:#222;box-sizing:border-box}',
      '#yunoj-ask .yunoj-ask-title{font-weight:600;font-size:14px;margin-bottom:6px}',
      '#yunoj-ask .yunoj-ask-desc{color:#666;font-size:12.5px;line-height:1.6;margin-bottom:12px}',
      '#yunoj-ask .yunoj-ask-actions{display:flex;gap:8px;justify-content:flex-end}',
      '#yunoj-ask .yunoj-ask-btn{padding:5px 14px;border-radius:6px;font-size:12.5px;cursor:pointer;border:1px solid #ccc;background:#f6f8fa;color:#222;text-decoration:none;font-family:inherit}',
      '#yunoj-ask .yunoj-ask-btn:hover{background:#eaeef2}',
      '#yunoj-ask .yunoj-ask-yes{background:#0969da;color:#fff;border-color:#0969da}',
      '#yunoj-ask .yunoj-ask-yes:hover{background:#0550ae}',
      '#yunoj-reentry{position:fixed;right:18px;bottom:18px;z-index:2147482990;width:32px;height:32px;padding:0;border-radius:50%;border:1px solid #ccc;background:#fff;color:#888;font-size:11px;font-weight:600;font-family:system-ui,sans-serif;cursor:grab;opacity:.55;box-shadow:0 2px 6px rgba(0,0,0,.12);letter-spacing:.5px}',
      '#yunoj-reentry:hover{opacity:1;background:#f0f4ff;color:#0969da;border-color:#0969da}',
      '#yunoj-oj-config{position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:2147482996;width:420px;padding:14px;background:#fff;border:1px solid #ccc;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.18);font-size:13px}',
      '#yunoj-oj-config .yunoj-ojconfig-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
      '#yunoj-oj-config .yunoj-ojconfig-title{font-weight:600;font-size:14px;flex:1}',
      '#yunoj-oj-config .yunoj-ojconfig-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:4px;color:#666;text-decoration:none;font-size:14px;cursor:pointer}',
      '#yunoj-oj-config .yunoj-ojconfig-btn:hover{background:#f0f0f0;color:#222}',
      '#yunoj-oj-config .yunoj-ojconfig-desc{color:#666;font-size:12px;line-height:1.6;margin-bottom:10px}',
      '#yunoj-oj-config .yunoj-ojconfig-list{max-height:200px;overflow-y:auto;margin-bottom:10px;padding:6px 8px;border:1px solid #eaeef2;border-radius:6px;background:#fafbfc}',
      '#yunoj-oj-config .yunoj-ojconfig-empty{color:#999;text-align:center;padding:14px 8px;font-size:12px}',
      '#yunoj-oj-config .yunoj-ojconfig-row{display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:4px;border-radius:4px;background:#fff;border:1px solid #eaeef2;font-size:12px}',
      '#yunoj-oj-config .yunoj-ojconfig-row:last-child{margin-bottom:0}',
      '#yunoj-oj-config .yunoj-ojconfig-row-host{font-family:ui-monospace,Menlo,Consolas,monospace;color:#0969da;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#yunoj-oj-config .yunoj-ojconfig-row-arrow{color:#999;flex-shrink:0}',
      '#yunoj-oj-config .yunoj-ojconfig-row-name{color:#222;flex-shrink:0;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#yunoj-oj-config .yunoj-ojconfig-del{padding:0 6px;color:#c00;text-decoration:none;font-size:16px;cursor:pointer;flex-shrink:0;line-height:1}',
      '#yunoj-oj-config .yunoj-ojconfig-del:hover{background:#ffe0e0;border-radius:3px}',
      '#yunoj-oj-config .yunoj-ojconfig-add{display:flex;gap:6px;margin-bottom:8px}',
      '#yunoj-oj-config .yunoj-ojconfig-input{flex:1;padding:5px 8px;border:1px solid #ccc;border-radius:4px;font-size:12px;outline:none;font-family:inherit;box-sizing:border-box;min-width:0}',
      '#yunoj-oj-config .yunoj-ojconfig-input:focus{border-color:#0969da;box-shadow:0 0 0 2px rgba(9,105,218,.15)}',
      '#yunoj-oj-config .yunoj-ojconfig-actions{display:flex;align-items:center;gap:8px;font-size:11px}',
      '#yunoj-oj-config .yunoj-ojconfig-hint{flex:1;color:#0969da}',
      '#yunoj-oj-config .yunoj-ojconfig-addbtn{padding:5px 14px;border:none;border-radius:4px;background:#0969da;color:#fff;text-decoration:none;font-size:12px;cursor:pointer;font-family:inherit}',
      '#yunoj-oj-config .yunoj-ojconfig-addbtn:hover{background:#0550ae}',
    ].join('\n');
    if (typeof GM_addStyle === 'function') GM_addStyle(c);
    else { const s = el('style'); s.textContent = c; document.head.appendChild(s); }
  }

  // ============================================================
  // 初始化
  // ============================================================
  function init() {
    css();
    panel();
    searchPanel();
    translationPanel();
    aiPanel();
    ojConfigPanel();
    aiConfigPanel();
    transConfigPanel();
    applyDark();
    if (get('sample')) sampleCopy();
    if (get('origin') || get('statement') || get('search') || get('translate') || get('ai')) jumpBar();
    setTimeout(() => {
      if (get('sample')) sampleCopy();
      if (!document.querySelector('#yunoj-jump') && (get('origin') || get('statement') || get('search') || get('translate') || get('ai'))) jumpBar();
    }, 1500);
    window.addEventListener('resize', () => {
      ['posBar', 'posSearch', 'posFab', 'posPanel', 'posTrans', 'posReentry', 'posOjConfig', 'posAi', 'posAiCfg'].forEach(key => {
        const s = get(key); if (!s) return;
        const map = { posBar: '#yunoj-jump', posSearch: '#yunoj-search', posFab: '#yunoj-fab', posPanel: '#yunoj-panel', posTrans: '#yunoj-trans', posReentry: '#yunoj-reentry', posOjConfig: '#yunoj-oj-config', posAi: '#yunoj-ai', posAiCfg: '#yunoj-ai-cfg' };
        const elem = $(map[key]); if (elem) setPosition(elem, s.x, s.y);
      });
    });
  }

  function boot() {
    if (OJ.key !== '__default') { init(); return; }
    const pref = getPref();
    if (pref === 'yes') { const auto = get(autoKey()); if (auto === undefined || auto === null) { set(autoKey(), looksLikeOJ()); } init(); return; }
    if (pref === 'no') { css(); if (document.body) showReEntryButton(); else document.addEventListener('DOMContentLoaded', () => showReEntryButton()); return; }
    if (looksLikeOJ()) { setPref('yes'); set(autoKey(), true); init(); return; }
    css();
    if (document.body) { showAskDialog(() => { init(); }, () => { showReEntryButton(); }); }
    else { document.addEventListener('DOMContentLoaded', () => { showAskDialog(() => { init(); }, () => { showReEntryButton(); }); }); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();