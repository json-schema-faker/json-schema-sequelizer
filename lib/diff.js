'use strict';

const util = require('./util');

const UNCHANGED = 0;
const DELETED = -1;
const CREATED = 1;
const RENAMED = 2;
const MODIFIED = 3;

function typeOf(obj) {
  return Object.prototype.toString.call(obj);
}

function isObject(obj) {
  return typeOf(obj) === '[object Object]';
}

function isValue(obj) {
  return !Array.isArray(obj) && !isObject(obj);
}

function compareValues(value1, value2) {
  /* istanbul ignore else */
  if (value1 === value2) {
    return UNCHANGED;
  }

  /* istanbul ignore else */
  if (typeof value1 === 'undefined') {
    return CREATED;
  }

  /* istanbul ignore else */
  if (typeof value2 === 'undefined') {
    return DELETED;
  }

  /* istanbul ignore else */
  if (typeOf(value1) === typeOf(value2)) {
    const a = Object.keys(value1);
    const b = Object.keys(value2);

    /* istanbul ignore else */
    if (a.length !== b.length) {
      return MODIFIED;
    }

    a.sort();
    b.sort();

    for (let i = 0; i < a.length; i += 1) {
      /* istanbul ignore else */
      if (a[i] !== b[i]) {
        return MODIFIED;
      }
    }

    for (let i = 0; i < a.length; i += 1) {
      /* istanbul ignore else */
      if (compareValues(value1[a[i]], value2[b[i]])) {
        return MODIFIED;
      }
    }

    return UNCHANGED;
  }

  return MODIFIED;
}

function diffMap(from, to) {
  /* istanbul ignore else */
  if (Array.isArray(from) || Array.isArray(to)) {
    const a = !Array.isArray(from) && from ? [from] : from || [];
    const b = !Array.isArray(to) && to ? [to] : to || [];

    // deletions
    const c = a.reduce((prev, cur) => {
      prev.push([b.indexOf(cur) === -1 ? -1 : 0, cur]);
      return prev;
    }, []);

    // additions
    const d = b.reduce((prev, cur) => {
      prev.push([a.indexOf(cur) === -1 ? 1 : 0, cur]);
      return prev;
    }, []);

    // differences
    const e = c.concat(d).reduce((prev, cur) => {
      const found = prev.filter(x => (x[0] === cur[0] && x[1] === cur[1]));

      /* istanbul ignore else */
      if (!found.length) {
        prev.push(cur);
      }

      return prev;
    }, []);

    return {
      $type: compareValues(from, to),
      $data: e.map(obj => ({
        $type: obj[0],
        $data: obj[1],
      })),
    };
  }

  /* istanbul ignore else */
  if (isValue(from) || isValue(to)) {
    return {
      $type: compareValues(from, to),
      $data: to,
    };
  }

  const diff = Array.isArray(to) ? [] : {};

  Object.keys(from).forEach(k => {
    diff[k] = diffMap(from[k], typeof to[k] !== 'undefined' ? to[k] : undefined);
  });

  Object.keys(to).forEach(k => {
    /* istanbul ignore else */
    if (typeof diff[k] === 'undefined') {
      diff[k] = diffMap(undefined, to[k]);
    }

    /* istanbul ignore else */
    if (!Array.isArray(diff[k].$data) && diff[k].$type === 1 && !isValue(to[k])) {
      const set = Object.keys(from).map(key => ({
        prop: key,
        diff: compareValues(to[k], from[key]),
      }));

      for (let i = 0; i < set.length; i += 1) {
        /* istanbul ignore else */
        if (set[i].diff === UNCHANGED) {
          delete diff[set[i].prop];

          diff[k].$type = RENAMED;
          diff[k].$prev = set[i].prop;
        }
      }
    }
  });

  return diff;
}

function safeValue(obj, pad, unwrap) {
  /* istanbul ignore else */
  if (typeof obj === 'object') {
    /* istanbul ignore else */
    if (Array.isArray(obj)) {
      return unwrap
        ? obj.map(x => safeValue(x, pad)).join(', ')
        : `[${obj.map(x => safeValue(x, pad)).join(', ')}]`;
    }

    const out = [];

    Object.keys(obj).forEach(k => {
      out.push(`${pad}  ${k}: ${safeValue(obj[k], `${pad}  `)},`);
    });

    return unwrap
      ? out.join('\n')
      : `{\n${out.join('\n')}\n${pad}}`;
  }

  /* istanbul ignore else */
  if (typeof obj === 'string') {
    return `'${obj}'`;
  }

  return obj;
}

function getValues(source) {
  if (!source || typeof source !== 'object') {
    return source;
  }

  if (Array.isArray(source)) {
    return source.reduce((prev, cur) => {
      /* istanbul ignore else */
      if (typeof cur.$type === 'number') {
        if (cur.$type !== -1) {
          prev.push(getValues(cur.$data));
        }
      } else {
        prev.push(getValues(cur));
      }

      return prev;
    }, []);
  }

  if (typeof source.$type === 'number') {
    return source.$type > -1
      ? source.$data
      : undefined;
  }

  const copy = {};

  Object.keys(source).forEach(key => {
    if (typeof source[key].$type === 'number') {
      if (source[key].$type !== -1) {
        copy[key] = getValues(source[key].$data);
      }
    } else {
      copy[key] = getValues(source[key]);
    }
  });

  return copy;
}

function buildSchema(schema, source, prev) {
  const pad = '    ';

  // changes
  const up = [];
  const down = [];
  const change = [];

  // lazy-load
  const types = require('./types');

  function walk(props, copy, old, cb, p) {
    if (!Array.isArray(props) && typeof props === 'object') {
      Object.keys(props).forEach(k => {
        if (typeof props[k].$type === 'number') {
          cb(p.concat(k), props[k].$type,
            getValues(props[k].$data), (old && old[k]) || (copy && copy[k]),
            props);
          return;
        }

        walk(props[k],
          copy && copy[k],
          old && old[k],
          cb, p.concat(k));
      });
    }
  }

  function addColumn(prefix, field, out) {
    const suffix = field.enum
      ? `(${safeValue(field.enum, '', true)})`
      : '';

    // FIXME: skip by now
    if (field.$ref || (field.items && field.items.$ref)) {
      out.push(`${prefix}// <${field.$ref || (field.items && field.items.$ref)}>`);
      out.push(`${prefix}type: dataTypes.VIRTUAL,`);
      return;
    }

    // FIXME: avoid by-passing given attributes
    const sub = !field._modelAttribute
      ? util.getDefinition(field)
      : field;

    out.push(`${prefix}type: dataTypes.${sub[0]}${suffix},`);

    /* istanbul ignore else */
    if (sub[1]) {
      const opts = types.dropTypes(sub[1]);

      Object.keys(opts).forEach(k => {
        /* istanbul ignore else */
        if (isValue(opts[k]) && k !== 'type') {
          out.push(`${prefix}${k}: ${safeValue(opts[k], prefix)},`);
        }
      });
    }
  }

  function addColumns(props, out) {
    Object.keys(props).forEach(prop => {
      const ref = props[prop].items || props[prop];

      // FIXME: skip by now
      if (typeof ref.id === 'string') {
        out.push(`${pad}  // ${prop} <${ref.id}>`);
        return;
      }

      out.push(`${pad}  ${prop}: {`);
      addColumn(`${pad}    `, props[prop], out);
      out.push(`${pad}  },`);
    });
  }

  walk(schema, source, prev, (key, type, value, previous, sourceObject) => {
    const opts = sourceObject.options && sourceObject.options.$type !== -1
      ? `, ${safeValue(getValues(sourceObject.options), pad)}`
      : '';

    /* istanbul ignore else */
    if (key[0] === 'id') {
      /* istanbul ignore else */
      if (type === CREATED) {
        up.push(`${pad}queryInterface.createTable('${value}', {`);

        /* istanbul ignore else */
        if (sourceObject.properties && sourceObject.properties.$type === 1) {
          addColumns(getValues(sourceObject.properties), up);
        }

        up.push(`${pad}}${opts}),`);
        down.push(`${pad}queryInterface.dropTable('${value}'${opts}),`);
      }

      /* istanbul ignore else */
      if (type === DELETED) {
        up.push(`${pad}queryInterface.dropTable('${previous}'${opts}),`);
        down.push(`${pad}queryInterface.createTable('${previous}', {`);
        addColumns(source.properties, down);
        down.push(`${pad}}),`);
      }

      /* istanbul ignore else */
      if (type === MODIFIED) {
        up.push(`${pad}queryInterface.renameTable('${previous}', '${value}'${opts}),`);
        down.push(`${pad}queryInterface.renameTable('${value}', '${previous}'${opts}),`);
      }
    }

    /* istanbul ignore else */
    if (key[0] === 'properties' && key[1] && type !== 0) {
      const prop = key[key.length - 1];

      /* istanbul ignore else */
      if (type === CREATED) {
        if (!key[2]) {
          up.push(`${pad}queryInterface.addColumn('${schema.id.$data}', '${prop}', {`);
          addColumn(`${pad}  `, value, up);
          up.push(`${pad}}),`);
          down.unshift(`${pad}queryInterface.removeColumn('${schema.id.$data}', '${prop}'),`);
        } else {
          change.push(`${pad}queryInterface.changeColumn('${schema.id.$data}', '${key[1]}', {`);

          if (sourceObject.enum) {
            addColumn(`${pad}  `, getValues(sourceObject), change);
          } else {
            addColumn(`${pad}  `, { type: sourceObject.type.$data }, change);
            change.push(`${pad}  ${key[2]}: ${safeValue(value, `${pad}  `)},`);
          }

          change.push(`${pad}}),`);
        }
      }

      /* istanbul ignore else */
      if (type === RENAMED) {
        up.push(`${pad}queryInterface.renameColumn('${schema.id.$data}', '${sourceObject[prop].$prev}', '${prop}'),`);
        down.push(`${pad}queryInterface.renameColumn('${schema.id.$data}', '${prop}', '${sourceObject[prop].$prev}'),`);
      }

      /* istanbul ignore else */
      if (type === DELETED && !key[2]) {
        up.push(`${pad}queryInterface.removeColumn('${schema.id.$data}', '${prop}'),`);
        down.push(`${pad}queryInterface.addColumn('${schema.id.$data}', '${prop}', {`);
        addColumn(`${pad}  `, previous, down);
        down.push(`${pad}}),`);
      }

      /* istanbul ignore else */
      if (type === MODIFIED && !sourceObject.enum) {
        change.push(`${pad}queryInterface.changeColumn('${schema.id.$data}', '${key[1]}', {`);
        addColumn(`${pad}  `, getValues(sourceObject), change);
        change.push(`${pad}}),`);
      }
    }
  }, [], null);

  return [
    '(queryInterface, dataTypes) => ({\n',
    `  up: [\n${up.length ? `${up.join('\n')}\n` : ''}  ],\n`,
    `  down: [\n${down.length ? `${down.join('\n')}\n` : ''}  ],\n`,
    `  change: [\n${change.length ? `${change.join('\n')}\n` : ''}  ],\n`,
    '})',
  ].join('');
}

function shadowClone(a, b) {
  if (typeof b !== 'object' || !b) {
    return typeof a !== 'undefined' ? a : null;
  }

  if (Array.isArray(b)) {
    const n = !Array.isArray(a) && a ? [a] : a || [];
    return b.map((x, i) => shadowClone(n[i], x));
  }

  const c = {};

  Object.keys(b).forEach(k => {
    c[k] = shadowClone(a ? a[k] : null, b[k]);
  });

  return c;
}

function doChanges(from, to, m, p) {
  return buildSchema(m, from, shadowClone(from, to), p);
}

module.exports = {
  build: doChanges,
  map: diffMap,
};
