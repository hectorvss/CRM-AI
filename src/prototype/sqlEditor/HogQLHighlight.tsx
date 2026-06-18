// HogQLHighlight — lightweight regex-based syntax highlighter for HogQL.
// PostHog OSS uses Monaco with a custom `hogql` language definition. Until we
// pull Monaco in, this component renders a coloured copy of the SQL behind a
// transparent <textarea> in `QueryWindow`. Same colour roles PostHog uses
// (keywords, types, strings, numbers, comments) adapted to the Clain palette.

import React from 'react';

const KEYWORDS = new Set([
  'select','from','where','group','order','by','limit','offset','having',
  'join','left','right','inner','outer','full','on','using','as','and','or',
  'not','in','exists','between','like','ilike','null','true','false','case',
  'when','then','else','end','distinct','all','union','intersect','except',
  'with','insert','update','delete','values','set','create','table','view',
  'materialized','if','asc','desc','interval','day','hour','minute','second',
  'week','month','year','top','sample','prewhere','format','settings',
]);

const FUNCTIONS = new Set([
  'count','countif','sum','avg','min','max','median','quantile','any','anyif',
  'uniq','uniqexact','groupArray','groupUniqArray','arrayJoin','tuple','array',
  'now','today','yesterday','tostartofday','tostartofhour','tostartofweek',
  'tostartofmonth','toyear','tomonth','toweek','today','toint','tofloat',
  'tostring','todate','todatetime','todatetime64','length','lower','upper',
  'concat','substring','replace','trim','splitbychar','splitbystring','json_value',
  'json_extract','tojsontype','round','floor','ceil','abs','exp','log','sqrt',
  'rand','generateuuidv4','if','multiif','coalesce','ifnull','nullif',
  'extract','date_diff','date_add','date_sub','datediff','dateadd','datesub',
  'tostartoffifteenminutes','tostartoffiveminutes','toyyyymm','toyyyymmdd',
  'arrayfilter','arraymap','arraysum','arraycount','arrayexists','arrayall',
  'has','hasany','hasall','indexof','startswith','endswith','position',
  'regex','matches','match','replaceregexpall','replaceregexpone',
  'tohumandate','tohumantime','formatdatetime',
]);

const TYPES = new Set([
  'string','integer','int','float','double','boolean','bool','date','datetime',
  'datetime64','array','json','tuple','uuid','enum','map','nullable',
]);

interface Token {
  type: 'keyword' | 'function' | 'type' | 'string' | 'number' | 'comment' | 'operator' | 'identifier' | 'text';
  value: string;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // Line comments: -- ... \n
    if (ch === '-' && text[i + 1] === '-') {
      const end = text.indexOf('\n', i);
      const slice = end === -1 ? text.slice(i) : text.slice(i, end);
      tokens.push({ type: 'comment', value: slice });
      i += slice.length;
      continue;
    }

    // Block comments: /* ... */
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const slice = end === -1 ? text.slice(i) : text.slice(i, end + 2);
      tokens.push({ type: 'comment', value: slice });
      i += slice.length;
      continue;
    }

    // Strings: '...'
    if (ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== "'") {
        if (text[j] === '\\') j++;
        j++;
      }
      const slice = text.slice(i, Math.min(j + 1, text.length));
      tokens.push({ type: 'string', value: slice });
      i += slice.length;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < text.length && /[0-9._eE+-]/.test(text[j])) j++;
      const slice = text.slice(i, j);
      tokens.push({ type: 'number', value: slice });
      i += slice.length;
      continue;
    }

    // Identifiers / keywords / functions / types
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_$.]/.test(text[j])) j++;
      const slice = text.slice(i, j);
      const lower = slice.toLowerCase();
      let type: Token['type'] = 'identifier';
      if (KEYWORDS.has(lower)) type = 'keyword';
      else if (FUNCTIONS.has(lower)) type = 'function';
      else if (TYPES.has(lower)) type = 'type';
      tokens.push({ type, value: slice });
      i += slice.length;
      continue;
    }

    // Operators
    if (/[+\-*/%=<>!&|^~]/.test(ch)) {
      let j = i;
      while (j < text.length && /[+\-*/%=<>!&|^~]/.test(text[j])) j++;
      tokens.push({ type: 'operator', value: text.slice(i, j) });
      i = j;
      continue;
    }

    // Whitespace + punctuation pass-through
    tokens.push({ type: 'text', value: ch });
    i += 1;
  }
  return tokens;
}

const COLORS: Record<Token['type'], string> = {
  keyword:    '#7c3aed', // violet — SELECT / FROM / WHERE
  function:   '#0891b2', // teal  — count() / now() / toDate()
  type:       '#0d9488',
  string:     '#16a34a', // green — 'foo'
  number:     '#e8572a', // Clain orange — 123
  comment:    '#9ca3af', // grey  — -- ...
  operator:   '#646462',
  identifier: '#1a1a18',
  text:       '#1a1a18',
};

interface HogQLHighlightProps {
  text: string;
  className?: string;
}

export function HogQLHighlight({ text, className }: HogQLHighlightProps): React.ReactElement {
  const tokens = React.useMemo(() => tokenize(text), [text]);
  return (
    <code className={className}>
      {tokens.map((t, i) => (
        <span key={i} style={{ color: COLORS[t.type] }}>{t.value}</span>
      ))}
    </code>
  );
}

export default HogQLHighlight;
