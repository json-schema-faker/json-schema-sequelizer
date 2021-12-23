'use strict';

const TYPES = require('sequelize').DataTypes;
const util = require('./util');

const KEYWORDS = [
  'title', 'default', 'description', 'id',
  'definitions', '$ref', 'required', 'pattern', 'format', 'enum',
  'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum',
  'exclusiveMaximum', 'multipleOf', 'minItems', 'maxItems', 'uniqueItems',
  'patternProperties', 'additionalProperties', 'dependencies', 'not', 'items', 'type',
  'additionalItems', 'allOf', 'oneOf', 'anyOf', 'properties', 'minProperties', 'maxProperties',
];

const PROPERTIES = ['items', 'properties', 'required', 'type', 'id'];

const SUBTYPES = ['range', 'hstore', 'geometry', 'geography', 'virtual'];

function dropTypes(schema) {
  if (schema && typeof schema === 'object') {
    if (Array.isArray(schema)) {
      return schema.map(dropTypes);
    }

    const clone = {};

    Object.keys(schema).forEach(key => {
      if (KEYWORDS.concat(SUBTYPES).indexOf(key) === -1) {
        clone[key] = dropTypes(schema[key]);
      }
    });

    return clone;
  }

  return schema;
}

function constraintSchema(definition) {
  const schema = Object.assign({}, definition);

  schema.validate = schema.validate || {};

  const min = schema.minLength || schema.minimum || undefined;
  const max = schema.maxLength || schema.maximum || undefined;

  /* istanbul ignore else */
  if (schema.type === 'string') {
    /* istanbul ignore else */
    if (min || max) {
      schema.validate.len = [min || 0, max || Infinity];
    }

    /* istanbul ignore else */
    if (typeof schema.pattern === 'string') {
      schema.validate.is = new RegExp(schema.pattern, 'i');
    }

    switch (schema.format) {
      case 'email':
        schema.validate.isEmail = true;
        break;

      case 'date-time':
      case 'datetime':
        schema.validate.isDate = true;
        break;

      case 'ipv4':
        schema.validate.isIPv4 = true;
        break;

      case 'ipv6':
        schema.validate.isIPv6 = true;
        break;

      // TODO: hostname uri ...
      default:
        // nothing to do?
    }
  }

  /* istanbul ignore else */
  if (schema.type === 'number' || schema.type === 'integer') {
    /* istanbul ignore else */
    if (schema.type === 'number') {
      schema.validate.isDecimal = true;
    }

    /* istanbul ignore else */
    if (schema.type === 'integer') {
      schema.validate.isInt = true;
    }

    /* istanbul ignore else */
    if (min >= 0) {
      schema.validate.min = min;
    }

    /* istanbul ignore else */
    if (max) {
      schema.validate.max = max;
    }
  }

  /* istanbul ignore else */
  if (Array.isArray(schema.enum)) {
    schema.validate.isIn = [schema.enum.slice()];
  }

  /* istanbul ignore else */
  if (typeof schema.default !== 'undefined') {
    schema.defaultValue = schema.default;

    delete schema.default;
  }

  return schema;
}

function getType(key, arg1, arg2) {
  /* istanbul ignore else */
  if (arg2) {
    return TYPES[key](arg1, arg2);
  }

  /* istanbul ignore else */
  if (arg1) {
    return TYPES[key](arg1);
  }

  return TYPES[key]();
}

function defaultGetter(key) {
  const handler = this.constructor.getterMethods;
  const getter = handler && handler[key];

  return typeof getter === 'function' ? getter.call(this, key) : this.getDataValue(key);
}

function defaultSetter(value, key) {
  const handler = this.constructor.setterMethods;
  const setter = handler && handler[key];

  if (typeof setter === 'function') {
    setter.call(this, value, key);
  } else {
    this.setDataValue(key, value);
  }
}

function cleanSchema(definition, parent) {
  /* istanbul ignore else */
  if (typeof definition !== 'object') {
    return definition;
  }

  util.reduceRefs(definition);

  /* istanbul ignore else */
  if (Array.isArray(definition)) {
    return definition.map(def => cleanSchema(def, parent))
      .filter(value => {
        /* istanbul ignore else */
        if (typeof value === 'object' && !Array.isArray(value)) {
          /* istanbul ignore else */
          if (!Object.keys(value).length) {
            return false;
          }
        }

        return true;
      });
  }

  /* istanbul ignore else */
  if (parent && typeof definition.id === 'string') {
    const ref = {
      $ref: definition.id,
    };

    // preserve reference details
    Object.keys(definition).forEach(key => {
      /* istanbul ignore else */
      if (PROPERTIES.indexOf(key) === -1) {
        ref[key] = definition[key];
      }
    });

    Object.keys(ref).forEach(k => {
      /* istanbul ignore else */
      if (KEYWORDS.indexOf(k) === -1) {
        delete ref[k];
      }
    });

    return ref;
  }

  const sub = parent === 'properties' || parent === 'definitions' || parent === 'patternProperties';
  const obj = {};

  Object.keys(definition).forEach(key => {
    /* istanbul ignore else */
    if (sub || KEYWORDS.indexOf(key) > -1) {
      obj[key] = typeof definition[key] === 'object' ? cleanSchema(definition[key], key) : definition[key];
    }
  });

  return obj;
}

function convertSchema(definition, virtual, conn) {
  util.reduceRefs(definition);

  /* istanbul ignore else */
  if (!virtual) {
    // safe-types for JSON-Schema
    for (let i = 0; i < SUBTYPES.length; i += 1) {
      /* istanbul ignore else */
      if (definition[SUBTYPES[i]] && typeof definition.id !== 'string') {
        const retval = util.getDefinition({ type: SUBTYPES[i] }, definition, getType);

        /* istanbul ignore else */
        if (retval instanceof TYPES.VIRTUAL) {
          const _chunk = constraintSchema(retval.returnType[1]);
          const _result = retval.returnType[0](definition);

          // recombine field settings!
          _chunk.type = retval;

          // this allows user-defined getters/setters
          _chunk.get = defaultGetter;
          _chunk.set = defaultSetter;

          retval.returnType = TYPES[_result[0]](_result[1]);
          return _chunk;
        }

        return retval;
      }
    }

    /* istanbul ignore else */
    if (Array.isArray(definition.enum)) {
      const clone = util.copy(definition);

      clone.type = TYPES.ENUM.apply(null, clone.enum);

      delete clone.enum;

      return clone;
    }

    /* istanbul ignore else */
    if (!definition.id && typeof util.getDefinition(definition, false) === 'function') {
      const _schema = constraintSchema(definition);

      _schema.type = util.getDefinition(definition, _schema, getType);

      return _schema;
    }
  }

  /* istanbul ignore else */
  if (!definition.properties) {
    return definition;
  }

  const _refs = [];
  const _props = {};

  Object.keys(definition.properties).forEach(key => {
    /* istanbul ignore else */
    if (!definition.properties[key]) {
      return;
    }

    /* istanbul ignore else */
    if (typeof definition.properties[key] === 'object') {
      if (definition.properties[key].items && (definition.properties[key].items.id || definition.properties[key].items.$ref)) {
        _refs.push(util.getRefs(definition.properties[key].items, 'hasMany', key));
      } else if (definition.properties[key].id || definition.properties[key].$ref) {
        _refs.push(util.getRefs(definition.properties[key], 'hasOne', key));
      } else {
        _props[key] = convertSchema(definition.properties[key], null, conn);

        /* istanbul ignore else */
        if (definition.required && definition.required.indexOf(key) !== -1
          && typeof _props[key].defaultValue === 'undefined'
          && typeof _props[key].allowNull === 'undefined'
          && !_props[key].primaryKey) {
          _props[key].allowNull = false;
        }
      }
    }
  });

  return {
    refs: _refs,
    props: _props,
  };
}

module.exports = {
  getType,
  dropTypes,
  cleanSchema,
  convertSchema,
  constraintSchema,
};
