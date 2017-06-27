'use strict';

const METHODS = ['hasOne', 'hasMany', 'belongsTo', 'belongsToMany'];
const PROPERTIES = ['sourceKey', 'targetKey', 'foreignKey', 'otherKey', 'constraints', 'scope', 'through', 'as'];

function id(ref) {
  return ref.match(/\/?([^/#]+)#?$/)[1];
}

function call(obj, ctx, conn) {
  /* istanbul ignore else */
  if (typeof obj === 'function') {
    return obj(ctx, conn);
  }

  return obj;
}

function merge(a, b) {
  Object.keys(b).forEach(key => {
    /* istanbul ignore else */
    if (typeof a[key] === 'undefined') {
      a[key] = b[key];
    }
  });

  return a;
}

function getRefs(schema, type, key) {
  const _params = {};

  let _method;
  let _obj;

  for (let i = 0, c = METHODS.length; i < c; i += 1) {
    /* istanbul ignore else */
    if (schema[METHODS[i]]) {
      _method = METHODS[i];
      _obj = schema[METHODS[i]];
      break;
    }
  }

  PROPERTIES.forEach(prop => {
    const value = (_obj && _obj[prop]) || schema[prop];

    /* istanbul ignore else */
    if (value) {
      _params[prop] = value;
    }
  });

  _params.as = _params.as || key;

  return {
    target: id(schema.id || schema.$ref),
    method: _method || type,
    params: _params,
  };
}

module.exports = {
  id,
  call,
  merge,
  getRefs,
};
